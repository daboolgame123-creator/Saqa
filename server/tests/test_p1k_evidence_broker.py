#!/usr/bin/env python3
"""Negative tests for CI-only fixed-allowlist PDF evidence broker."""
from __future__ import annotations
import io
import pathlib
import tarfile
import tempfile
import unittest
from p1kEvidenceBroker import NAMES, extract


def payload(name: str) -> bytes:
    if name.endswith(".pdf"):
        return b"%PDF-1.7\n1 0 obj\nendobj\n%%EOF\n"
    return (name + "\n").encode()


def archive(path: pathlib.Path, extra: str | None = None,
            link: str | None = None, duplicate: str | None = None) -> None:
    with tarfile.open(path, "w") as tf:
        for name in (*NAMES, *((extra,) if extra else ())):
            b = payload(name)
            item = tarfile.TarInfo(name)
            if name == link:
                item.type = tarfile.SYMTYPE
                item.linkname = "/etc/passwd"
                item.size = 0
                tf.addfile(item)
            else:
                item.size = len(b)
                tf.addfile(item, io.BytesIO(b))
            if name == duplicate:
                item2 = tarfile.TarInfo(name)
                item2.size = len(b)
                tf.addfile(item2, io.BytesIO(b))


class EvidenceBrokerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.tar = self.root / "evidence.tar"
        self.dst = self.root / "out"
        self.dst.mkdir()

    def test_valid_fixed_artifact_set(self) -> None:
        archive(self.tar)
        extract(self.tar, self.dst)
        self.assertEqual(set(f.name for f in self.dst.iterdir()), set(NAMES))

    def test_rejects_arbitrary_additional_file(self) -> None:
        archive(self.tar, extra="../escape")
        with self.assertRaisesRegex(ValueError, "allowlist"):
            extract(self.tar, self.dst)
        self.assertEqual(list(self.dst.iterdir()), [])

    def test_rejects_symlink_member(self) -> None:
        archive(self.tar, link="details.pdf")
        with self.assertRaisesRegex(ValueError, "non-regular"):
            extract(self.tar, self.dst)
        self.assertEqual(list(self.dst.iterdir()), [])

    def test_rejects_duplicate_name(self) -> None:
        archive(self.tar, duplicate="ack.pdf")
        with self.assertRaisesRegex(ValueError, "allowlist"):
            extract(self.tar, self.dst)
        self.assertEqual(list(self.dst.iterdir()), [])

    def test_rejects_destination_symlink(self) -> None:
        archive(self.tar)
        outside = self.root / "outside"
        outside.mkdir()
        self.dst.rmdir()
        self.dst.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            extract(self.tar, self.dst)
        self.assertEqual(list(outside.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
