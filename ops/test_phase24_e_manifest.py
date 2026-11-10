"""Negative and valid synthetic provenance tests; no Docker or actual font required."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).with_name("phase24_e_manifest.py")
spec = importlib.util.spec_from_file_location("phase24_e_manifest", ROOT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def valid_font():
    return {
        "fontPath": "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "fontBytes": 123456,
        "fontSha256": "a" * 64,
        "licensePath": "/usr/share/doc/fonts-dejavu-core/copyright",
        "licenseBytes": 455,
        "licenseSha256": "b" * 64,
        "packageVersion": "2.37-6",
    }


def valid_manifest(font=None, image=None, commit=None):
    return module.build_manifest(
        commit if commit is not None else "c" * 40,
        image if image is not None else "sha256:" + "d" * 64,
        valid_font() if font is None else font,
        b"D" * 200, b"S" * 200,
    )


class Phase24EManifestTests(unittest.TestCase):
    def test_valid_evidence_is_never_an_approval_or_registry_digest(self):
        result = valid_manifest()
        self.assertEqual(result["status"], "CI_SYNTHETIC_ONLY_HOST_NO_GO")
        self.assertIsNone(result["image"]["registryImageDigest"])
        self.assertFalse(result["font"]["licenseReviewedAndApproved"])
        self.assertFalse(result["limits"]["productionReleaseApproved"])
        self.assertEqual(result["sourceCommit"], "c" * 40)

    def test_mutable_or_unverified_image_id_denied(self):
        for image in ["python:3.12-slim-bookworm", "sha256:" + "g" * 64, "sha256:" + "a" * 63,
                      "registry.test/renderer@sha256:" + "a" * 64, ""]:
            with self.subTest(image=image), self.assertRaises(module.EvidenceRejected):
                valid_manifest(image=image)

    def test_invalid_commit_denied(self):
        for commit in ["not-a-commit", "f" * 39, "f" * 41, "Z" * 40]:
            with self.subTest(commit=commit), self.assertRaises(module.EvidenceRejected):
                valid_manifest(commit=commit)

    def test_missing_or_false_font_and_license_proof_denied(self):
        for key, value in [
            ("fontSha256", "bad"), ("licenseSha256", "not-a-hash"),
            ("fontBytes", 0), ("fontBytes", True), ("licenseBytes", 0),
            ("fontPath", "/tmp/fake.ttf"), ("licensePath", "/tmp/LICENSE"),
            ("packageVersion", ""),
        ]:
            font = valid_font()
            font[key] = value
            with self.subTest(field=key), self.assertRaises(module.EvidenceRejected):
                valid_manifest(font=font)

    def test_missing_evidence_fields_denied(self):
        font = valid_font()
        del font["licenseSha256"]
        with self.assertRaises(module.EvidenceRejected):
            valid_manifest(font=font)

    def test_source_hashes_are_sha256_and_nonempty_source_required(self):
        result = valid_manifest()
        self.assertEqual(result["image"]["dockerfileSha256"], module._hash(b"D" * 200))
        self.assertEqual(result["containerPolicySourceSha256"], module._hash(b"S" * 200))
        with self.assertRaises(module.EvidenceRejected):
            module.build_manifest("c" * 40, "sha256:" + "d" * 64, valid_font(), b"", b"S" * 200)


if __name__ == "__main__":
    unittest.main()
