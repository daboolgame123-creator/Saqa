#!/usr/bin/env python3
"""Phase 24-E: validate synthetic CI renderer provenance, never approve a host.

Consumes evidence collected inside the CI-built Docker image. Neither the
local image ID nor a license-file checksum is a registry digest/approval.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re

HEX64 = re.compile(r"^[0-9a-f]{64}$")
IMAGE_ID = re.compile(r"^sha256:[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
EXPECTED_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
EXPECTED_LICENSE = "/usr/share/doc/fonts-dejavu-core/copyright"


class EvidenceRejected(ValueError):
    pass


def _hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_manifest(commit: str, image_id: str, font_data: object,
                   dockerfile: bytes, supervisor: bytes) -> dict:
    if not COMMIT.fullmatch(commit):
        raise EvidenceRejected("Missing exact source commit")
    if not IMAGE_ID.fullmatch(image_id):
        raise EvidenceRejected("Expected local CI image ID, not a mutable tag")
    if not isinstance(font_data, dict) or set(font_data) != {
        "fontPath", "fontBytes", "fontSha256",
        "licensePath", "licenseBytes", "licenseSha256", "packageVersion"
    }:
        raise EvidenceRejected("Incomplete font/license evidence")
    if (font_data["fontPath"] != EXPECTED_FONT or
            font_data["licensePath"] != EXPECTED_LICENSE or
            not isinstance(font_data["fontBytes"], int) or
            isinstance(font_data["fontBytes"], bool) or
            font_data["fontBytes"] < 1000 or
            not isinstance(font_data["licenseBytes"], int) or
            isinstance(font_data["licenseBytes"], bool) or
            font_data["licenseBytes"] < 100 or
            not isinstance(font_data["packageVersion"], str) or
            not 1 <= len(font_data["packageVersion"]) <= 80 or
            not isinstance(font_data["fontSha256"], str) or
            not HEX64.fullmatch(font_data["fontSha256"]) or
            not isinstance(font_data["licenseSha256"], str) or
            not HEX64.fullmatch(font_data["licenseSha256"])):
        raise EvidenceRejected("Unverified installed font or license checksum")
    if len(dockerfile) < 100 or len(supervisor) < 100:
        raise EvidenceRejected("Missing reviewed source files")
    return {
        "schemaVersion": 1,
        "status": "CI_SYNTHETIC_ONLY_HOST_NO_GO",
        "sourceCommit": commit,
        "image": {
            "localImageId": image_id,
            "registryImageDigest": None,
            "immutableRegistryImageApproved": False,
            "dockerfileSha256": _hash(dockerfile),
        },
        "font": {
            "package": "fonts-dejavu-core",
            "packageVersion": font_data["packageVersion"],
            "installedPath": EXPECTED_FONT,
            "installedBytes": font_data["fontBytes"],
            "installedSha256": font_data["fontSha256"],
            "licenseEvidencePath": EXPECTED_LICENSE,
            "licenseEvidenceBytes": font_data["licenseBytes"],
            "licenseEvidenceSha256": font_data["licenseSha256"],
            "licenseReviewedAndApproved": False,
        },
        "containerPolicySourceSha256": _hash(supervisor),
        "limits": {
            "networkAndCgroupsHostVerified": False,
            "crashCleanupOnInstitutionHostVerified": False,
            "humanArabicVisualApproved": False,
            "productionReleaseApproved": False,
            "note": "A local image ID and license checksum are inventory, not production approval.",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--image-id-file", type=Path, required=True)
    parser.add_argument("--font-json", type=Path, required=True)
    parser.add_argument("--dockerfile", type=Path, required=True)
    parser.add_argument("--supervisor", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    evidence = build_manifest(
        args.commit,
        args.image_id_file.read_text(encoding="ascii").strip(),
        json.loads(args.font_json.read_text(encoding="utf-8")),
        args.dockerfile.read_bytes(),
        args.supervisor.read_bytes(),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists() or args.output.is_symlink():
        raise EvidenceRejected("Refusing to overwrite image provenance manifest")
    with args.output.open("x", encoding="utf-8") as file:
        json.dump(evidence, file, ensure_ascii=False, indent=2, sort_keys=True)
        file.write("\n")
    print("PHASE24_E_CI_PROVENANCE_PASS local_image_only host_approval=false")


if __name__ == "__main__":
    main()
