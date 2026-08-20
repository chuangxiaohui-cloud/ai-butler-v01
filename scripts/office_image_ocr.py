"""Extract text from an image using Pillow + RapidOCR/PaddleOCR (mirror pdf_text.py engine)."""

import json
import os
import pathlib
import sys
import tempfile

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ENGINE = os.environ.get("PDF_OCR_ENGINE", "rapid").strip().lower() or "rapid"


def get_engine():
    """返回 (engine, error)；PDF_OCR=0 或引擎缺失时 engine 为 None。"""
    if os.environ.get("PDF_OCR") == "0":
        return None, "OCR 已被 PDF_OCR=0 关闭"
    try:
        if ENGINE == "paddle":
            from paddleocr import PaddleOCR

            return PaddleOCR(lang="ch"), None
        from rapidocr_onnxruntime import RapidOCR

        return RapidOCR(), None
    except Exception as exc:
        return (
            None,
            f"OCR 引擎未安装：{exc}；请运行 `python -m pip install rapidocr_onnxruntime`（或 PDF_OCR_ENGINE=paddle 时安装 paddleocr）后重试",
        )


def fail(error: str) -> int:
    print(json.dumps({"ok": False, "error": error}, ensure_ascii=False))
    print(error, file=sys.stderr)
    return 1


def extract_texts(result) -> list[str]:
    if ENGINE == "paddle":
        items = result if isinstance(result, list) else [result]
        texts: list[str] = []
        for item in items:
            rec = None
            if isinstance(item, dict):
                rec = item.get("rec_texts") or item.get("texts")
            else:
                rec = getattr(item, "rec_texts", None) or getattr(item, "texts", None)
            if isinstance(rec, (list, tuple)):
                texts.extend(str(t) for t in rec if t)
        return texts
    rows = result[0] if isinstance(result, tuple) else result
    if isinstance(rows, list):
        return [str(item[1]) for item in rows if len(item) > 1 and item[1]]
    return []


def main() -> int:
    if len(sys.argv) < 2:
        return fail("usage: office_image_ocr.py <input-image> [output-txt]")
    src, out_txt = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else None)
    try:
        import numpy as np
        from PIL import Image

        ext = os.path.splitext(src)[1].lower()
        if ext in (".heic", ".heif"):
            from office_image_convert import decode_heic

            with tempfile.TemporaryDirectory() as td:
                tmp = os.path.join(td, "decoded.png")
                err = decode_heic(src, tmp)
                if err:
                    return fail(err)
                img = Image.open(tmp)
                img.load()
        else:
            img = Image.open(src)
            img.load()
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        arr = np.asarray(img)
        engine, err = get_engine()
        if engine is None:
            return fail(err or "OCR 引擎不可用")
        result = engine(arr)
        lines = extract_texts(result)
        text = "\n".join(lines)
        if out_txt:
            pathlib.Path(out_txt).write_text(text, encoding="utf-8")
        print(json.dumps({"ok": True, "text": text, "lines": lines, "chars": len(text)}, ensure_ascii=False))
        return 0
    except Exception as exc:
        return fail(f"图片 OCR 失败：{exc}")


if __name__ == "__main__":
    sys.exit(main())
