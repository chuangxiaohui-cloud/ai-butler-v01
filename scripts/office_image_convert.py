"""Convert an image to a target format using Pillow; HEIC/HEIF 尽力解码后转换。"""

import json
import os
import shutil
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")

SUPPORTED = {"png": "PNG", "jpg": "JPEG", "jpeg": "JPEG", "webp": "WEBP", "bmp": "BMP"}
HEIC_EXTS = (".heic", ".heif")


def decode_heic(src: str, dst_png: str) -> str | None:
    """尝试 pillow-heif / imagecodecs / ffmpeg 解码 HEIC；成功返回 None，失败返回错误信息。"""
    try:
        import pillow_heif

        pillow_heif.register_heif_opener()
        from PIL import Image

        img = Image.open(src)
        img.load()
        img.save(dst_png, "PNG")
        return None
    except Exception:
        pass
    try:
        from PIL import Image

        with Image.open(src) as img:
            img.load()
            img.save(dst_png, "PNG")
        return None
    except Exception:
        pass
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        try:
            proc = subprocess.run(
                [ffmpeg, "-y", "-loglevel", "error", "-i", src, "-frames:v", "1", dst_png],
                capture_output=True,
                timeout=120,
            )
            if proc.returncode == 0 and os.path.exists(dst_png):
                return None
        except Exception:
            pass
    return "HEIC/HEIF 解码需要 pillow-heif、imagecodecs 或带 libheif 的 ffmpeg，当前环境不可用，请先转换为 JPG/PNG。"


def open_image(src: str, tmp_png: str | None):
    """打开图片；HEIC/HEIF 走解码链，其余直接 Pillow（含 tiff/avif）。"""
    from PIL import Image

    ext = os.path.splitext(src)[1].lower()
    if ext in HEIC_EXTS:
        err = decode_heic(src, tmp_png)
        if err:
            return None, err
        return Image.open(tmp_png), None
    return Image.open(src), None


def main() -> None:
    if len(sys.argv) < 4:
        print(json.dumps({
            "ok": False,
            "error": "usage: office_image_convert.py <input> <output> <format>",
        }, ensure_ascii=False))
        sys.exit(1)
    src, dst, fmt = sys.argv[1], sys.argv[2], sys.argv[3].lower()
    if fmt not in SUPPORTED:
        print(json.dumps({
            "ok": False,
            "error": f"不支持的格式：{fmt}（支持 png/jpg/jpeg/webp/bmp）",
        }, ensure_ascii=False))
        sys.exit(1)
    tmp_png = None
    try:
        ext = os.path.splitext(src)[1].lower()
        if ext in HEIC_EXTS:
            tmp_png = dst + ".tmp.png"
        from PIL import Image

        img, err = open_image(src, tmp_png)
        if err:
            print(json.dumps({"ok": False, "error": err}, ensure_ascii=False))
            sys.exit(1)
        if fmt in ("jpg", "jpeg") and img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        elif fmt == "bmp" and img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.save(dst, SUPPORTED[fmt])
        print(json.dumps({
            "ok": True,
            "path": dst,
            "format": fmt,
            "size": os.path.getsize(dst),
            "width": img.width,
            "height": img.height,
        }, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"图片格式转换失败：{exc}"}, ensure_ascii=False))
        sys.exit(1)
    finally:
        if tmp_png and os.path.exists(tmp_png):
            try:
                os.remove(tmp_png)
            except OSError:
                pass


if __name__ == "__main__":
    main()
