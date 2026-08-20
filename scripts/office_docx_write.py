"""Write a plain-text file into a .docx."""

import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

try:
    import docx
except Exception as exc:  # pragma: no cover
    print(json.dumps({"ok": False, "error": f"python-docx unavailable: {exc}"}))
    sys.exit(1)


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "usage: office_docx_write.py <input.txt> <output.docx>"}))
        sys.exit(1)
    try:
        text = open(sys.argv[1], encoding="utf-8").read()
        document = docx.Document()
        for paragraph in text.split("\n"):
            if paragraph.strip():
                document.add_paragraph(paragraph.strip())
        document.save(sys.argv[2])
        print(json.dumps({"ok": True, "path": sys.argv[2]}))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
