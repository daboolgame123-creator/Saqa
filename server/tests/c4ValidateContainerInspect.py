"""Phase 23/C4 — offline fail-closed checker for *synthetic* Docker inspect evidence.

Input: captured JSON arrays from `docker inspect CONTAINER` and
`docker image inspect IMAGE`, plus the expected immutable RepoDigest.
This tool NEVER contacts Docker or the network and MUST NOT be represented
as an independent verification of the target host's security.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

PINNED = re.compile(r"^[a-zA-Z0-9._/-]+(?:\:[0-9]+)?@sha256:[0-9a-f]{64}$")
MAX_MEMORY = 805_306_368
MAX_PIDS = 64


class C4InspectionRejected(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise C4InspectionRejected(message)


def single(value: Any, name: str) -> dict[str, Any]:
    require(isinstance(value, list) and len(value) == 1, f"{name}: expected a single inspect object")
    obj = value[0]
    require(isinstance(obj, dict), f"{name}: invalid object")
    return obj


def integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def validate_inspections(container_docs: Any, image_docs: Any, expected_image: str) -> dict[str, str]:
    require(bool(PINNED.fullmatch(expected_image)), "Expected image is not an immutable digest reference")
    container = single(container_docs, "container")
    image = single(image_docs, "image")
    cfg = container.get("Config")
    host = container.get("HostConfig")
    require(isinstance(cfg, dict) and isinstance(host, dict), "Missing container config")
    require(cfg.get("Image") == expected_image, "Container did not request the expected immutable image")
    require(container.get("Image") == image.get("Id"), "Running container image ID differs from inspected image")
    digests = image.get("RepoDigests")
    require(isinstance(digests, list) and expected_image in digests, "Expected repository digest not present in image inspect")

    user = cfg.get("User")
    require(isinstance(user, str) and bool(re.fullmatch(r"[1-9][0-9]*:[1-9][0-9]*", user)),
            "Container must run with an explicit non-root numeric UID:GID")
    require(host.get("Privileged") is False, "Privileged container denied")
    require(host.get("ReadonlyRootfs") is True, "Writable root filesystem denied")
    require(host.get("NetworkMode") == "none", "Network namespace must be disabled")
    require(host.get("PidMode") in ("", "private", None), "Host PID namespace denied")
    require(host.get("IpcMode") in ("", "private", None), "Host IPC namespace denied")
    require(host.get("CgroupnsMode") in ("", "private", None), "Host cgroup namespace denied")
    require(host.get("CapAdd") in (None, []), "Additional Linux capabilities denied")
    drops = host.get("CapDrop")
    require(isinstance(drops, list) and "ALL" in [str(x).upper() for x in drops],
            "ALL Linux capabilities must be dropped")
    security = host.get("SecurityOpt")
    require(isinstance(security, list) and any(s == "no-new-privileges" or s == "no-new-privileges:true"
                                              for s in security), "no-new-privileges missing")
    require(all("unconfined" not in str(s).lower() for s in security), "Unconfined security override denied")
    require(host.get("SecurityOpt") is not None, "Missing security options")

    memory = host.get("Memory")
    pids = host.get("PidsLimit")
    require(integer(memory) and 0 < memory <= MAX_MEMORY, "Memory cap missing or too high")
    require(integer(pids) and 0 < pids <= MAX_PIDS, "PID cap missing or too high")
    nano = host.get("NanoCpus")
    quota, period = host.get("CpuQuota"), host.get("CpuPeriod")
    nano_ok = integer(nano) and 0 < nano <= 1_000_000_000
    quota_ok = integer(quota) and integer(period) and 0 < quota <= period
    require(nano_ok or quota_ok, "CPU quota missing or too high")

    require(host.get("Binds") in (None, []), "Host bind mounts denied")
    require(host.get("Mounts") in (None, []), "Host mount configuration denied")
    require(container.get("Mounts") == [], "Observed volume/bind mounts denied")
    tmpfs = host.get("Tmpfs")
    require(isinstance(tmpfs, dict) and set(tmpfs) == {"/tmp", "/output"},
            "Only private /tmp and /output tmpfs permitted")
    for path, limit in (("/tmp", 33_554_432), ("/output", 33_554_432)):
        spec = tmpfs[path]
        require(isinstance(spec, str) and "nosuid" in spec.split(",") and
                "nodev" in spec.split(",") and
                any(part == f"size={limit}" for part in spec.split(",")),
                f"{path} must use approved tmpfs size and mount options")

    require(cfg.get("AttachStdin") is not False or cfg.get("OpenStdin") is not False,
            "Worker stdin must be available for JSON handoff")
    return {"state": "INSPECT_FIELDS_PASS", "image": expected_image,
            "warning": "Static evidence only; target-host runtime and C4 approval unverified"}


def main() -> int:
    parser = argparse.ArgumentParser(description="C4 offline inspect policy; NEVER production approval")
    parser.add_argument("--container", type=Path, required=True)
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--expected-image", required=True)
    args = parser.parse_args()
    try:
        container = json.loads(args.container.read_text(encoding="utf-8"))
        image = json.loads(args.image.read_text(encoding="utf-8"))
        print(json.dumps(validate_inspections(container, image, args.expected_image), sort_keys=True))
        return 0
    except (C4InspectionRejected, OSError, ValueError) as exc:
        print(json.dumps({"state": "INSPECT_FIELDS_REJECTED", "reason": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
