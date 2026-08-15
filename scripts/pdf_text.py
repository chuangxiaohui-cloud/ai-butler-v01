#!/usr/bin/env python3
"""Extract text from a PDF using PyMuPDF; OCR scanned pages with RapidOCR/PaddleOCR."""

import json
import hashlib
import os
import pathlib
import sys

_ocr_engines: dict[str, object] = {}
_ocr_errors: dict[str, str] = {}
OCR_CACHE_DIR = pathlib.Path(os.environ.get("PDF_OCR_CACHE_DIR", "data/ocr-cache"))


def prune_ocr_cache(max_files: int) -> None:
    if max_files <= 0:
        return
    try:
        files = sorted(
            OCR_CACHE_DIR.glob("v1-*.txt"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for old in files[max_files:]:
            old.unlink()
    except Exception:
        pass


def page_text(page) -> str:
    lines: list[str] = []
    for block in page.get_text("rawdict")["blocks"]:
        for line in block.get("lines", []):
            parts: list[str] = []
            for span in line.get("spans", []):
                parts.append("".join(ch.get("c", "") for ch in span.get("chars", [])))
            lines.append("".join(parts))
    return "\n".join(lines)


def ocr_engine_name() -> str:
    return os.environ.get("PDF_OCR_ENGINE", "rapid").strip().lower() or "rapid"


def get_ocr_engine(engine: str):
    global _ocr_engines, _ocr_errors
    if engine in _ocr_engines:
        return _ocr_engines[engine]
    if os.environ.get("PDF_OCR") == "0":
        _ocr_errors[engine] = "disabled by PDF_OCR=0"
        return None
    try:
        if engine == "paddle":
            os.environ.setdefault("PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT", "False")
            from paddleocr import PaddleOCR

            _ocr_engines[engine] = PaddleOCR(lang="ch")
        else:
            from rapidocr_onnxruntime import RapidOCR

            _ocr_engines[engine] = RapidOCR()
    except Exception as exc:
        _ocr_errors[engine] = f"{engine} unavailable: {exc}"
        _ocr_engines[engine] = None
    return _ocr_engines[engine]


def extract_texts_from_result(engine_name: str, result) -> list[str]:
    texts: list[str] = []
    if engine_name == "paddle":
        items = result if isinstance(result, list) else [result]
        for item in items:
            rec = None
            if isinstance(item, dict):
                rec = item.get("rec_texts") or item.get("texts")
            else:
                rec = getattr(item, "rec_texts", None) or getattr(item, "texts", None)
            if isinstance(rec, (list, tuple)):
                texts.extend(str(t) for t in rec if t)
    else:
        rows = result[0] if isinstance(result, tuple) else result
        if isinstance(rows, list):
            texts.extend(
                str(item[1]) for item in rows if len(item) > 1 and item[1]
            )
    return texts


def ocr_page(page, engine: str | None = None) -> str:
    engine_name = engine or ocr_engine_name()
    engine_obj = get_ocr_engine(engine_name)
    if engine_obj is None:
        return ""
    try:
        import fitz
        import numpy as np

        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        digest = hashlib.sha256(pix.samples).hexdigest()
        cache_file = OCR_CACHE_DIR / f"v1-{engine_name}-{digest}.txt"
        if cache_file.exists():
            return cache_file.read_text(encoding="utf-8").strip()
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if engine_name == "paddle":
            result = engine_obj.predict(img)
            if not result:
                return ""
        else:
            result = engine_obj(img)
    except Exception:
        return ""
    text = "\n".join(extract_texts_from_result(engine_name, result))
    if text.strip():
        try:
            OCR_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(text, encoding="utf-8")
            prune_ocr_cache(int(os.environ.get("PDF_OCR_CACHE_MAX_FILES", "200")))
        except Exception:
            pass
    return text


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

    engine_name = ocr_engine_name()
    ocr_engine_available = max_ocr_pages > 0 and get_ocr_engine(engine_name) is not None
    result = {
        "ok": True,
        "text": "\n".join(parts),
        "scanned": image_pages > 0 or ocr_pages > 0,
        "ocr": ocr_pages > 0,
        "ocrAvailable": ocr_engine_available,
        "ocrEngine": engine_name,
        "ocrMaxPages": max_ocr_pages,
        "ocrSkippedPages": ocr_skipped_pages,
        "ocrError": _ocr_errors.get(engine_name),
        "pageCount": doc.page_count,
        "textPages": text_pages,
    }
    doc.close()
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
