"""Extract text / table structure from image(s) using Pillow + RapidOCR/PaddleOCR.

单图：   office_image_ocr.py <input-image> [output-txt]
批量：   office_image_ocr.py --batch <output-txt> <img1> [img2 ...]   # E167
表格：   office_image_ocr.py --table <input-image> [out-csv]          # E168
"""

import csv
import io
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


def extract_boxes(result) -> list[dict]:
    """E168：OCR 结果 → [{text, x, y, w, h, cx, cy}]（坐标框用于表格重建）。"""
    items: list[dict] = []
    if ENGINE == "paddle":
        recs = result if isinstance(result, list) else [result]
        for rec in recs:
            if isinstance(rec, dict):
                texts = rec.get("rec_texts") or rec.get("texts") or []
                boxes = rec.get("rec_boxes") or rec.get("boxes") or []
            else:
                texts = getattr(rec, "rec_texts", None) or getattr(rec, "texts", None) or []
                boxes = getattr(rec, "rec_boxes", None) or getattr(rec, "boxes", None) or []
            for text, box in zip(texts, boxes):
                if not text:
                    continue
                xs = [p[0] for p in box]
                ys = [p[1] for p in box]
                x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
                items.append(
                    {
                        "text": str(text),
                        "x": x0,
                        "y": y0,
                        "w": x1 - x0,
                        "h": y1 - y0,
                        "cx": (x0 + x1) / 2,
                        "cy": (y0 + y1) / 2,
                        "score": None,
                    }
                )
        return items
    rows = result[0] if isinstance(result, tuple) else result
    if isinstance(rows, list):
        for row in rows:
            if len(row) < 2:
                continue
            box, text = row[0], row[1]
            if not text:
                continue
            score = row[2] if len(row) > 2 else None
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
            items.append(
                {
                    "text": str(text),
                    "x": x0,
                    "y": y0,
                    "w": x1 - x0,
                    "h": y1 - y0,
                    "cx": (x0 + x1) / 2,
                    "cy": (y0 + y1) / 2,
                    "score": score,
                }
            )
    return items


def _bbox_of(items: list[dict]) -> dict:
    """合并多个文本块为并集 bbox（供 cells/spans 输出）。"""
    xs = [it["x"] for it in items]
    ys = [it["y"] for it in items]
    x1s = [it["x"] + it["w"] for it in items]
    y1s = [it["y"] + it["h"] for it in items]
    return {
        "x": min(xs),
        "y": min(ys),
        "w": max(x1s) - min(xs),
        "h": max(y1s) - min(ys),
    }


def reconstruct_table(items: list[dict]):
    """E168/E172：按坐标聚类重建网格 → (grid, rows, cols, cell_items)。

    cell_items[row][col] = [item, ...] 保留每个文本块的原始 bbox（TSR 原始数据，
    下期合并单元格还原直接复用，避免重跑 OCR）。"""
    if not items:
        return [], 0, 0, []
    # 列聚类：按 cx 排序，间隙大于阈值则开新列
    by_cx = sorted(items, key=lambda it: it["cx"])
    med_w = sorted(it["w"] for it in items)[len(items) // 2]
    col_gap = max(med_w * 1.2, 24.0)
    cols: list[dict] = []
    for it in by_cx:
        if not cols or it["cx"] - cols[-1]["cx"] > col_gap:
            cols.append({"cx": it["cx"]})
        else:
            c = cols[-1]
            c["cx"] = (c["cx"] + it["cx"]) / 2
    # 行聚类：按 cy 排序，间隙大于阈值则开新行（锚点取首项，避免均值漂移）
    by_cy = sorted(items, key=lambda it: it["cy"])
    med_h = sorted(it["h"] for it in items)[len(items) // 2]
    row_gap = max(med_h * 0.7, 8.0)
    rows: list[dict] = []
    for it in by_cy:
        if not rows or it["cy"] - rows[-1]["anchor"] > row_gap:
            rows.append({"anchor": it["cy"], "items": [it]})
        else:
            rows[-1]["items"].append(it)
    # 网格：每行按列中心就近归位，同格多文本按 y 序拼接；同时保留 cell→items 归属
    col_cx = [c["cx"] for c in cols]
    grid: list[list[str]] = []
    cell_items: list[list[list[dict]]] = []
    for r in rows:
        row_cells: list[list[dict]] = [[] for _ in col_cx]
        for it in sorted(r["items"], key=lambda i: i["cy"]):
            ci = min(range(len(col_cx)), key=lambda i: abs(col_cx[i] - it["cx"]))
            row_cells[ci].append(it)
        grid.append(
            [
                " ".join(it["text"] for it in sorted(cells, key=lambda i: i["cy"])).strip()
                for cells in row_cells
            ]
        )
        cell_items.append(row_cells)
    return grid, len(rows), len(col_cx), cell_items


def detect_merge_warnings(cell_items: list[list[list[dict]]], items: list[dict]) -> list[dict]:
    """E172：启发式疑似合并区域检测（本期仅如实提示，下期做合并还原）。"""
    warnings: list[dict] = []
    seen: set[tuple] = set()

    def add(wtype: str, row: int, col: int, detail: str) -> None:
        key = (wtype, row, col)
        if key in seen:
            return
        seen.add(key)
        warnings.append({"type": wtype, "row": row, "col": col, "detail": detail})

    rows = len(cell_items)
    cols = len(cell_items[0]) if rows else 0
    med_w = sorted(it["w"] for it in items)[len(items) // 2] if items else 0
    med_h = sorted(it["h"] for it in items)[len(items) // 2] if items else 0
    # 1) 同行不同列：文本 bbox 横向重叠 → 疑似跨列合并
    for r, row in enumerate(cell_items):
        placed = [(c, its) for c, its in enumerate(row) if its]
        for i in range(len(placed)):
            c1, its1 = placed[i]
            for c2, its2 in placed[i + 1 :]:
                for a in its1:
                    for b in its2:
                        over = min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"])
                        if over > 0.3 * min(a["w"], b["w"]):
                            add(
                                "merged_col",
                                r,
                                min(c1, c2),
                                "第" + str(r + 1) + "行第" + str(min(c1, c2) + 1) + "列疑似跨列合并"
                                + "（第" + str(c1 + 1) + "列与第" + str(c2 + 1) + "列文本 bbox 横向重叠）",
                            )
                            break
                    else:
                        continue
                    break
    # 2) 同列不同行：文本 bbox 纵向重叠 → 疑似跨行合并
    for c in range(cols):
        placed = [(r, cell_items[r][c]) for r in range(rows) if cell_items[r][c]]
        for i in range(len(placed)):
            r1, its1 = placed[i]
            for r2, its2 in placed[i + 1 :]:
                for a in its1:
                    for b in its2:
                        over = min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"])
                        if over > 0.3 * min(a["h"], b["h"]):
                            add(
                                "merged_row",
                                min(r1, r2),
                                c,
                                "第" + str(min(r1, r2) + 1) + "行第" + str(c + 1) + "列疑似跨行合并"
                                + "（第" + str(r1 + 1) + "行与第" + str(r2 + 1) + "行文本 bbox 纵向重叠）",
                            )
                            break
                    else:
                        continue
                    break
    # 3) 格宽显著大于中位 → 疑似跨列（如长表头）
    if med_w > 0:
        for r, row in enumerate(cell_items):
            for c, its in enumerate(row):
                if not its:
                    continue
                bb = _bbox_of(its)
                if bb["w"] > max(med_w * 1.8, 80):
                    add(
                        "merged_col",
                        r,
                        c,
                        "第" + str(r + 1) + "行第" + str(c + 1) + "列格宽 " + str(int(bb["w"]))
                        + "px 明显大于中位列宽，疑似跨列合并",
                    )
    # 4) 格高显著大于中位 → 疑似跨行
    if med_h > 0:
        for r, row in enumerate(cell_items):
            for c, its in enumerate(row):
                if not its:
                    continue
                bb = _bbox_of(its)
                if bb["h"] > max(med_h * 2.2, 40):
                    add(
                        "merged_row",
                        r,
                        c,
                        "第" + str(r + 1) + "行第" + str(c + 1) + "列格高 " + str(int(bb["h"]))
                        + "px 明显大于中位行高，疑似跨行合并",
                    )
    return warnings



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


def run_ocr(engine, src: str):
    """解码 + 识别，返回 (items, error)；失败时 error 非空。"""
    try:
        arr = load_image(src)
        result = engine(arr)
        return extract_boxes(result), None
    except Exception as exc:
        return None, f"{os.path.basename(src)}：{exc}"


def main() -> int:
    args = sys.argv[1:]
    table_mode = len(args) >= 1 and args[0] == "--table"
    batch = len(args) >= 1 and args[0] == "--batch"
    if table_mode:
        if len(args) < 2:
            return fail("usage: office_image_ocr.py --table <input-image> [out-csv]")
        src, out_csv = args[1], (args[2] if len(args) > 2 else None)
        try:
            engine, err = get_engine()
            if engine is None:
                return fail(err or "OCR 引擎不可用")
            items, run_err = run_ocr(engine, src)
            if run_err:
                return fail(run_err)
            grid, rows, cols, cell_items = reconstruct_table(items or [])
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerows(grid)
            csv_text = buf.getvalue()
            if out_csv:
                with open(out_csv, "w", encoding="utf-8", newline="") as fh:
                    fh.write(csv_text)
            # E172：TSR 原始数据——cells/spans 保留行列归属与 bbox，下期合并还原直接复用
            cells = [
                {
                    "row": r,
                    "col": c,
                    "text": " ".join(
                        it["text"] for it in sorted(its, key=lambda i: i["cy"])
                    ).strip(),
                    "bbox": _bbox_of(its),
                }
                for r, row in enumerate(cell_items)
                for c, its in enumerate(row)
                if its
            ]
            spans = [
                {
                    "row": r,
                    "col": c,
                    "text": it["text"],
                    "bbox": {"x": it["x"], "y": it["y"], "w": it["w"], "h": it["h"]},
                    "score": it.get("score"),
                }
                for r, row in enumerate(cell_items)
                for c, its in enumerate(row)
                for it in its
            ]
            warnings = detect_merge_warnings(cell_items, items or [])
            print(
                json.dumps(
                    {
                        "ok": True,
                        "csv": csv_text,
                        "rows": rows,
                        "cols": cols,
                        "grid": grid,
                        "cells": cells,
                        "spans": spans,
                        "warnings": warnings,
                    },
                    ensure_ascii=False,
                )
            )
            return 0
        except Exception as exc:
            return fail(f"表格识别失败：{exc}")
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
            items, run_err = run_ocr(engine, src)
            if run_err:
                errors.append(run_err)
                continue
            text = "\n".join(it["text"] for it in items)
            images.append({"file": name, "text": text, "chars": len(text)})
            if text:
                sections.append(f"=== {name} ===\n{text}")

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
