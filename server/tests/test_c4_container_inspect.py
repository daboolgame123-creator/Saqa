"""C4 offline inspect verifier tests — no Docker, network, host data, or image pulls."""
import copy
import importlib.util
import pathlib
import unittest

PATH = pathlib.Path(__file__).with_name("c4ValidateContainerInspect.py")
spec = importlib.util.spec_from_file_location("c4_inspect", PATH)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

IMAGE = "registry.example.invalid/alsqaya-pdf@sha256:" + "a" * 64
IDENTITY = "sha256:" + "b" * 64


def sample():
    image = [{"Id": IDENTITY, "RepoDigests": [IMAGE]}]
    container = [{
        "Image": IDENTITY,
        "Config": {"Image": IMAGE, "User": "10001:10001", "OpenStdin": True},
        "Mounts": [],
        "HostConfig": {
            "Privileged": False,
            "ReadonlyRootfs": True,
            "NetworkMode": "none",
            "PidMode": "",
            "IpcMode": "private",
            "CgroupnsMode": "private",
            "CapAdd": [],
            "CapDrop": ["ALL"],
            "SecurityOpt": ["no-new-privileges"],
            "Memory": 768 * 1024 * 1024,
            "PidsLimit": 64,
            "NanoCpus": 1_000_000_000,
            "Binds": [],
            "Mounts": [],
            "Tmpfs": {"/tmp": "rw,nosuid,nodev,size=32m,mode=1777",
                      "/output": "rw,nosuid,nodev,size=33554432,mode=1777"},
        },
    }]
    return container, image


class ContainerInspectTests(unittest.TestCase):
    def test_approved_shape_passes_as_static_evidence_only(self):
        c, i = sample()
        result = module.validate_inspections(c, i, IMAGE)
        self.assertEqual(result["state"], "INSPECT_FIELDS_PASS")
        self.assertIn("unverified", result["warning"])

    def test_mutable_tag_or_mismatched_digest_rejected(self):
        c, i = sample()
        for candidate in ("registry.example.invalid/alsqaya-pdf:latest", "bad"):
            with self.subTest(candidate=candidate):
                with self.assertRaises(module.C4InspectionRejected):
                    module.validate_inspections(c, i, candidate)
        i[0]["RepoDigests"] = []
        with self.assertRaises(module.C4InspectionRejected):
            module.validate_inspections(c, i, IMAGE)

    def test_privileges_network_and_mounts_fail_closed(self):
        changes = [
            ("HostConfig", "NetworkMode", "bridge"),
            ("HostConfig", "Privileged", True),
            ("HostConfig", "ReadonlyRootfs", False),
            ("HostConfig", "CapDrop", []),
            ("HostConfig", "SecurityOpt", ["no-new-privileges", "seccomp=unconfined"]),
            ("HostConfig", "Memory", 0),
            ("HostConfig", "Memory", 2_000_000_000),
            ("HostConfig", "PidsLimit", 0),
            ("HostConfig", "NanoCpus", 0),
            ("HostConfig", "Binds", ["/:/host"]),
            ("Config", "User", "0:0"),
            ("Config", "OpenStdin", False),
        ]
        for field, key, bad in changes:
            with self.subTest(key=key, bad=bad):
                c, i = sample()
                c[0][field][key] = bad
                with self.assertRaises(module.C4InspectionRejected):
                    module.validate_inspections(c, i, IMAGE)
        c, i = sample()
        c[0]["Mounts"] = [{"Type": "bind", "Source": "/home"}]
        with self.assertRaises(module.C4InspectionRejected):
            module.validate_inspections(c, i, IMAGE)

    def test_tmpfs_limits_and_unexpected_mounts_rejected(self):
        for invalid in ("rw,nosuid,nodev,size=64m", "rw,nodev,size=32m",
                        "rw,nosuid,nodev,size=0", "rw,nosuid,nodev"):
            with self.subTest(invalid=invalid):
                c, i = sample()
                c[0]["HostConfig"]["Tmpfs"]["/output"] = invalid
                with self.assertRaises(module.C4InspectionRejected):
                    module.validate_inspections(c, i, IMAGE)
        c, i = sample()
        c[0]["HostConfig"]["Tmpfs"]["/data"] = "rw,nosuid,nodev,size=4m"
        with self.assertRaises(module.C4InspectionRejected):
            module.validate_inspections(c, i, IMAGE)

    def test_inspect_shape_and_image_mismatch_rejected(self):
        c, i = sample()
        for altered in ([], [{}, {}], [{}]):
            with self.subTest(altered=altered):
                with self.assertRaises(module.C4InspectionRejected):
                    module.validate_inspections(altered, i, IMAGE)
        c[0]["Image"] = "sha256:" + "c" * 64
        with self.assertRaises(module.C4InspectionRejected):
            module.validate_inspections(c, i, IMAGE)


if __name__ == "__main__":
    unittest.main()
