"""Compress/optimize a PDF.

策略：
1. 无损优化：PyMuPDF garbage/deflate；缺失时回退 pypdf 去重。
2. 若指定 max_kb 且无损未达标、且可用 PyMuPDF：按递减 DPI 重渲染页面
   （JPEG 重编码），直到达标或降到最低 DPI；重渲染后文字不可选择。
"""

import json
import os
import shutil
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")

RENDER_DPIS = (120, 90, 60)


def lossless_compress(src: str, dst: str) -> dict:
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(src)
        pages = doc.page_count
        doc.save(dst, garbage=4, deflate=True, clean=True)
        doc.close()
        return {"method": "pymupdf", "pages": pages}
    except ImportError:
        from pypdf import PdfReader, PdfWriter

        reader = PdfReader(src)
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.compress_identical_objects()
        with open(dst, "wb") as out:
            writer.write(out)
        return {"method": "pypdf", "pages": len(reader.pages)}


def render_compress(src: str, dst: str, max_kb: int) -> dict:
    """按递减 DPI 重渲染页面并重建 PDF；返回实际 DPI 与是否达标。"""
    import fitz

    doc = fitz.open(src)
    used_dpi = RENDER_DPIS[-1]
    met = False
    try:
        for dpi in RENDER_DPIS:
            new = fitz.open()
            tmp_dir = tempfile.mkdtemp(prefix="pdf-compress-")
            try:
                for page in doc:
                    pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csRGB)
                    jpg = os.path.join(tmp_dir, f"p{len(new)}.jpg")
                    pix.save(jpg, jpg_quality=50)
                    np = new.new_page(width=page.rect.width, height=page.rect.height)
                    np.insert_image(np.rect, filename=jpg)
                new.save(dst, garbage=4, deflate=True)
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            used_dpi = dpi
            if os.path.getsize(dst) <= max_kb * 1024:
                met = True
                break
        return {"render": True, "dpi": used_dpi, "pages": doc.page_count, "met": met}
    finally:
        doc.close()


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({
            "ok": False,
            "error": "usage: office_pdf_compress.py <input.pdf> <output.pdf> [max_kb]",
        }, ensure_ascii=False))
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    max_kb = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 0
    try:
        size_before = os.path.getsize(src)
        info = lossless_compress(src, dst)
        size_after = os.path.getsize(dst)

        result = {
            "ok": True,
            "path": dst,
            "pages": info["pages"],
            "size_before": size_before,
            "size_after": size_after,
            "method": info["method"],
        }
        if max_kb > 0 and size_after > max_kb * 1024 and info["method"] == "pymupdf":
            render = render_compress(src, dst, max_kb)
            result.update(render)
            size_after = os.path.getsize(dst)
            result["size_after"] = size_after
            result["note"] = (
                f"已按 DPI {render['dpi']} 重渲染页面并做 JPEG 重编码，"
                "文字将不可选择；仅在你指定体积目标时执行。"
            )
            if not render["met"]:
                result["target_not_met"] = True
        elif max_kb > 0 and size_after > max_kb * 1024:
            result["target_not_met"] = True
            result["note"] = "图片型 PDF 的降采样需要 PyMuPDF，当前环境仅完成无损优化。"

        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"PDF 压缩失败：{exc}"}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
