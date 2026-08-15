#!/usr/bin/env python3
"""Extract text from a PDF using PyMuPDF; OCR scanned pages with RapidOCR."""

import json
import os
import pathlib
import sys

_ocr_engine = None
_ocr_error = None


def page_text(page) -> str:
    lines: list[str] = []
    for block in page.get_text("rawdict")["blocks"]:
        for line in block.get("lines", []):
            parts: list[str] = []
            for span in line.get("spans", []):
                parts.append("".join(ch.get("c", "") for ch in span.get("chars", [])))
            lines.append("".join(parts))
    return "\n".join(lines)


def get_ocr_engine():
    global _ocr_engine, _ocr_error
    if _ocr_engine is not None:
        return _ocr_engine
    if os.environ.get("PDF_OCR") == "0":
        _ocr_error = "disabled by PDF_OCR=0"
        return None
    try:
        from rapidocr_onnxruntime import RapidOCR

        _ocr_engine = RapidOCR()
    except Exception as exc:
        _ocr_error = f"rapidocr unavailable: {exc}"
        _ocr_engine = None
    return _ocr_engine


def ocr_page(page) -> str:
    engine = get_ocr_engine()
    if engine is None:
        return ""
    try:
        import fitz
        import numpy as np

        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        result, _ = engine(img)
    except Exception:
        return ""
    if not result:
        return ""
    return "\n".join(item[1] for item in result if len(item) > 1 and item[1])


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
    ocr_pages = 0
    ocr_skipped_pages = 0
    max_ocr_pages = max(0, int(os.environ.get("PDF_OCR_MAX_PAGES", "8")))
    for page in doc:
        text = page_text(page)
        if text.strip():
            text_pages += 1
            parts.append(text)
        elif page.get_images(full=True):
            if max_ocr_pages == 0 or ocr_pages >= max_ocr_pages:
                image_pages += 1
                ocr_skipped_pages += 1
                continue
            ocr_text = ocr_page(page)
            if ocr_text.strip():
                ocr_pages += 1
                text_pages += 1
                parts.append(ocr_text)
            else:
                image_pages += 1

    ocr_engine_available = max_ocr_pages > 0 and get_ocr_engine() is not None
    result = {
        "ok": True,
        "text": "\n".join(parts),
        "scanned": image_pages > 0 or ocr_pages > 0,
        "ocr": ocr_pages > 0,
        "ocrAvailable": ocr_engine_available,
        "ocrMaxPages": max_ocr_pages,
        "ocrSkippedPages": ocr_skipped_pages,
        "ocrError": _ocr_error,
        "pageCount": doc.page_count,
        "textPages": text_pages,
    }
    doc.close()
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
