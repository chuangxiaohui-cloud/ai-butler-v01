#!/usr/bin/env python3
"""Extract the text layer from a PDF read on stdin using PyMuPDF (fitz)."""

import json
import pathlib
import sys


def page_text(page) -> str:
    lines: list[str] = []
    for block in page.get_text("rawdict")["blocks"]:
        for line in block.get("lines", []):
            parts: list[str] = []
            for span in line.get("spans", []):
                parts.append("".join(ch.get("c", "") for ch in span.get("chars", [])))
            lines.append("".join(parts))
    return "\n".join(lines)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    data = pathlib.Path(arg).read_bytes() if arg else sys.stdin.buffer.read()
    if not data:
        print(json.dumps({"ok": False, "error": "empty input"}))
        return 1
    try:
        import fitz
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"pymupdf unavailable: {exc}"}))
        return 2
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"open failed: {exc}"}))
        return 3

    parts: list[str] = []
    text_pages = 0
    image_pages = 0
    for page in doc:
        text = page_text(page)
        if text.strip():
            text_pages += 1
            parts.append(text)
        elif page.get_images(full=True):
            image_pages += 1

    result = {
        "ok": True,
        "text": "\n".join(parts),
        "scanned": image_pages > 0,
        "pageCount": doc.page_count,
        "textPages": text_pages,
    }
    doc.close()
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
