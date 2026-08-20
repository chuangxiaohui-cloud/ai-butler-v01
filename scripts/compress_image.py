"""Compress an image to a max KB using Pillow; HEIC/HEIF 尽力解码后压缩。"""

import json
import os
import sys

try:
    from PIL import Image, ImageOps
except Exception as exc:  # pragma: no cover
    print(json.dumps({"ok": False, "error": f"Pillow unavailable: {exc}"}))
    sys.exit(1)


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "usage: compress_image.py <input> <output> [max_kb]"}))
        sys.exit(1)

    src = sys.argv[1]
    dst = sys.argv[2]
    max_kb = int(sys.argv[3]) if len(sys.argv) > 3 else 200
    tmp_png = None

    try:
        ext = os.path.splitext(src)[1].lower()
        if ext in (".heic", ".heif"):
            from office_image_convert import decode_heic

            tmp_png = dst + ".tmp.png"
            err = decode_heic(src, tmp_png)
            if err:
                print(json.dumps({"ok": False, "error": err}, ensure_ascii=False))
                sys.exit(1)
            img = Image.open(tmp_png)
        else:
            img = Image.open(src)
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGBA")
            background = Image.new("RGB", img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[-1])
            img = background
        else:
            img = img.convert("RGB")

        max_dim = 1600
        if max(img.size) > max_dim:
            ratio = max_dim / max(img.size)
            img = img.resize((int(img.width * ratio), int(img.height * ratio)), Image.LANCZOS)

        quality = 85
        while quality >= 20:
            img.save(dst, "JPEG", quality=quality, optimize=True)
            if os.path.getsize(dst) <= max_kb * 1024:
                break
            quality -= 10

        size = os.path.getsize(dst)
        if size > max_kb * 1024:
            ratio = 0.85
            while size > max_kb * 1024 and min(img.size) > 16:
                img = img.resize(
                    (max(1, int(img.width * ratio)), max(1, int(img.height * ratio))),
                    Image.LANCZOS,
                )
                img.save(dst, "JPEG", quality=40, optimize=True)
                size = os.path.getsize(dst)

        print(json.dumps({
            "ok": True,
            "path": dst,
            "size": os.path.getsize(dst),
            "width": img.width,
            "height": img.height,
        }))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)
    finally:
        if tmp_png and os.path.exists(tmp_png):
            try:
                os.remove(tmp_png)
            except OSError:
                pass


if __name__ == "__main__":
    main()
