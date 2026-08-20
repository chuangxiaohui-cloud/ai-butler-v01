"""Encrypt a PDF with a password using pypdf."""

import json
import sys

sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({
            "ok": False,
            "error": "usage: office_pdf_encrypt.py <input.pdf> <output.pdf> [password]",
        }, ensure_ascii=False))
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    password = sys.argv[3] if len(sys.argv) > 3 else "123456"
    try:
        from pypdf import PdfReader, PdfWriter

        reader = PdfReader(src)
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.encrypt(user_password=password, owner_password=password, algorithm="AES-256")
        with open(dst, "wb") as out:
            writer.write(out)
        print(json.dumps({
            "ok": True,
            "path": dst,
            "pages": len(reader.pages),
            "password": password,
        }, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"PDF 加密失败：{exc}"}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
