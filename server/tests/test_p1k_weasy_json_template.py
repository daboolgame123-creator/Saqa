"""ALT-08 fixed-template input denial and markup-escaping tests (synthetic)."""
import json
import unittest

from p1kWeasyJsonTemplate import InvalidPdfInput, decode, make_html


def example():
    return {
        "schemaVersion": 1, "title": "اختبار <script>alert(1)</script>",
        "summary": [["التاريخ", "2026-11-06T10:00:00Z"]],
        "details": [["2026-11-06T10:00:00Z", "وارد", "", "مستخدم اصطناعي",
                     "مكتمل", "", '<img src="file:///etc/passwd" onerror="x">', "&&<>"]],
        "acknowledgements": [], "hasAcknowledgements": False,
    }


def serialize(obj):
    return json.dumps(obj, ensure_ascii=False).encode("utf8")


class FixedTemplateTests(unittest.TestCase):
    def test_literal_markup_and_bidi_are_escaped(self):
        parsed = decode(serialize(example()))
        html = make_html(parsed)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", html)
        self.assertIn("&lt;img src=&quot;file:///etc/passwd&quot;", html)
        self.assertNotIn("<img ", html)
        self.assertNotIn("<script>", html)
        self.assertIn('<bdi dir="ltr"', html)
        self.assertIn('سجل رقم 1', html)

    def test_rejects_invalid_and_extra_fields(self):
        for edit in [
            lambda d: d.update(schemaVersion=2),
            lambda d: d.update(actorId="private"),
            lambda d: d.pop("details"),
            lambda d: d.update(hasAcknowledgements="no"),
            lambda d: d.update(details=[["one"]]),
            lambda d: d.update(details=[["x"]*8]*251),
            lambda d: d.update(details=[["x"*151]*8]),
            lambda d: d.update(summary=[["bad"]]),
            lambda d: d.update(title="X"*4001),
            lambda d: d.update(acknowledgements=[["a","b","c"]]),
            lambda d: d.update(title="\ud800"),
        ]:
            with self.subTest(edit=edit):
                value = example()
                edit(value)
                with self.assertRaises(InvalidPdfInput):
                    decode(serialize(value))

    def test_rejects_bad_bytes(self):
        for payload in (b"", b"\xff", b"{", b"x"*(512_001)):
            with self.subTest(length=len(payload)):
                with self.assertRaises(InvalidPdfInput):
                    decode(payload)

    def test_acknowledgement_document(self):
        value = example()
        value["hasAcknowledgements"] = True
        value["acknowledgements"] = [["ALT08_ACK_001", "2026-11-06T12:00:00Z", "تعميم"]]
        parsed = decode(serialize(value))
        self.assertIn("إقرار رقم 1", make_html(parsed))

if __name__ == "__main__":
    unittest.main()
