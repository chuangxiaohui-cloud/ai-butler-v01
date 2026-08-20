"""Normalize a .docx font/line spacing and save a copy."""

import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

try:
    import docx
    from docx.shared import Pt
    from docx.oxml.ns import qn
except Exception as exc:  # pragma: no cover
    print(json.dumps({"ok": False, "error": f"python-docx unavailable: {exc}"}))
    sys.exit(1)


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "usage: office_docx_format.py <input> <output>"}))
        sys.exit(1)
    try:
        document = docx.Document(sys.argv[1])
        normal = document.styles["Normal"]
        normal.font.name = "Calibri"
        normal.font.size = Pt(11)
        normal.element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
        for paragraph in document.paragraphs:
            paragraph.paragraph_format.line_spacing = 1.15
            for run in paragraph.runs:
                run.font.name = "Calibri"
                run._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
        document.save(sys.argv[2])
        print(json.dumps({"ok": True, "path": sys.argv[2]}))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
