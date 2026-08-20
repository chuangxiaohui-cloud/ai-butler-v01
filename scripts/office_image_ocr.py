"""Extract text from image(s) using Pillow + RapidOCR/PaddleOCR (mirror pdf_text.py engine).

单图：office_image_ocr.py <input-image> [output-txt]
批量：office_image_ocr.py --batch <output-txt> <img1> [img2 ...]   # E167
"""

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


def load_image(src: str):
    """解码单张图片为 RGB/L 数组；HEIC/HEIF 复用既有解码链。"""
    import numpy as np
    from PIL import Image

    ext = os.path.splitext(src)[1].lower()
    if ext in (".heic", ".heif"):
        from office_image_convert import decode_heic

        with tempfile.TemporaryDirectory() as td:
            tmp = os.path.join(td, "decoded.png")
            err = decode_heic(src, tmp)
            if err:
                raise RuntimeError(err)
            img = Image.open(tmp)
            img.load()
    else:
        img = Image.open(src)
        img.load()
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    return np.asarray(img)


def main() -> int:
    args = sys.argv[1:]
    batch = len(args) >= 1 and args[0] == "--batch"
    if batch:
        if len(args) < 3:
            return fail("usage: office_image_ocr.py --batch <output-txt> <img1> [img2 ...]")
        out_txt, srcs = args[1], args[2:]
    elif len(args) < 1:
        return fail("usage: office_image_ocr.py <input-image> [output-txt]")
    else:
        src, out_txt = args[0], (args[1] if len(args) > 1 else None)
        srcs = [src]

    try:
        engine, err = get_engine()
        if engine is None:
            return fail(err or "OCR 引擎不可用")

        images: list[dict] = []
        errors: list[str] = []
        sections: list[str] = []
        for src in srcs:
            name = os.path.basename(src)
            try:
                arr = load_image(src)
                result = engine(arr)
                text = "\n".join(extract_texts(result))
                images.append({"file": name, "text": text, "chars": len(text)})
                if text:
                    sections.append(f"=== {name} ===\n{text}")
            except Exception as exc:
                errors.append(f"{name}：{exc}")

        if not batch and not images:
            return fail(errors[0] if errors else "图片 OCR 失败")

        text = "\n\n".join(sections)
        if out_txt:
            pathlib.Path(out_txt).write_text(text, encoding="utf-8")
        print(
            json.dumps(
                {"ok": True, "text": text, "chars": len(text), "images": images, "errors": errors},
                ensure_ascii=False,
            )
        )
        return 0
    except Exception as exc:
        return fail(f"图片 OCR 失败：{exc}")


if __name__ == "__main__":
    sys.exit(main())
