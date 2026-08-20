"""Merge multiple PDF files into one using pypdf."""

import json
import sys

sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
    if len(sys.argv) < 4:
        print(json.dumps({
            "ok": False,
            "error": "usage: office_pdf_merge.py <output.pdf> <input1.pdf> [input2.pdf ...]",
        }, ensure_ascii=False))
        sys.exit(1)
    dst = sys.argv[1]
    sources = sys.argv[2:]
    try:
        from pypdf import PdfReader, PdfWriter

        writer = PdfWriter()
        total = 0
        for src in sources:
            reader = PdfReader(src)
            for page in reader.pages:
                writer.add_page(page)
            total += len(reader.pages)
        with open(dst, "wb") as out:
            writer.write(out)
        print(json.dumps({
            "ok": True,
            "path": dst,
            "files": len(sources),
            "pages": total,
        }, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"PDF 合并失败：{exc}"}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
