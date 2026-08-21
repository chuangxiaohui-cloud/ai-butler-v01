"""Extract text / table structure from image(s) using Pillow + RapidOCR/PaddleOCR.

单图：   office_image_ocr.py <input-image> [output-txt]
批量：   office_image_ocr.py --batch <output-txt> <img1> [img2 ...]   # E167
表格：   office_image_ocr.py --table <input-image> [out-csv]          # E168
"""

import csv
import io
import json
import math
import os
import pathlib
import re
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
    """E168/E172/E173：按坐标聚类重建网格 → (grid, rows, cols, cell_items, col_cx, row_anchors)。

    cell_items[row][col] = [item, ...] 保留每个文本块的原始 bbox（TSR 原始数据）；
    col_cx / row_anchors 用于 E173 合并单元格还原的槽位计算。"""
    if not items:
        return [], 0, 0, [], [], []
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
    return grid, len(rows), len(col_cx), cell_items, col_cx, [r["anchor"] for r in rows]



def detect_table_lines(arr):
    """E174：检测表格网格线 → ([x_edges...], [y_edges...])；无网格返回 None。

    双条件检线：整行/列暗像素占比 > 0.3 且最大连续暗 run > 图像宽/高的 0.25
    （避免密集文字行误判为网格线）；相邻候选线合并为一条（取中位）。"""
    import numpy as np

    if arr.ndim == 3:
        gray = np.asarray(arr, dtype=np.float32).mean(axis=2)
    else:
        gray = np.asarray(arr, dtype=np.float32)
    h, w = gray.shape
    dark = gray < 160.0

    def max_run(line) -> int:
        best = cur = 0
        for v in line:
            if v:
                cur += 1
                best = max(best, cur)
            else:
                cur = 0
        return best

    def scan(mask2d, limit):
        n = mask2d.shape[0]
        out: list[int] = []
        i = 0
        while i < n:
            if float(mask2d[i].sum()) / limit > 0.3 and max_run(mask2d[i]) > 0.25 * limit:
                j = i
                while (
                    j < n
                    and float(mask2d[j].sum()) / limit > 0.3
                    and max_run(mask2d[j]) > 0.25 * limit
                ):
                    j += 1
                out.append((i + j - 1) // 2)
                i = j
            else:
                i += 1
        return out

    ys = scan(dark, w)
    xs = scan(dark.T, h)
    if len(ys) < 2 or len(xs) < 2:
        return None
    return xs, ys


def reconstruct_grid(items, x_edges, y_edges):
    """E174：按网格线重建 → (grid, rows, cols, cell_items, col_cx, row_anchors)。

    文本按中心落入网格单元，行列结构由网格线直接确定；bbox 跨多格的文本块仍落
    首个单元，由 detect_merges 槽位法依据原始 bbox 补判合并。"""
    xs, ys = sorted(x_edges), sorted(y_edges)
    col_cx = [0.5 * (xs[i] + xs[i + 1]) for i in range(len(xs) - 1)]
    row_anchors = [0.5 * (ys[i] + ys[i + 1]) for i in range(len(ys) - 1)]
    n_rows, n_cols = len(row_anchors), len(col_cx)
    cell_items: list[list[list[dict]]] = [
        [[] for _ in range(n_cols)] for _ in range(n_rows)
    ]
    for it in items:
        ci = min(range(n_cols), key=lambda i: abs(col_cx[i] - it["cx"]))
        ri = min(range(n_rows), key=lambda i: abs(row_anchors[i] - it["cy"]))
        cell_items[ri][ci].append(it)
    grid = [
        [
            " ".join(it["text"] for it in sorted(cells, key=lambda i: i["cy"])).strip()
            for cells in row
        ]
        for row in cell_items
    ]
    return grid, n_rows, n_cols, cell_items, col_cx, row_anchors

def _slot_bounds(centers: list[float]) -> list[float]:
    """相邻中心取中点 → 槽位边界（首尾边界由 bbox 自身决定）。"""
    return [0.5 * (centers[i] + centers[i + 1]) for i in range(len(centers) - 1)]


def _slot_overlaps(x0: float, x1: float, bounds: list[float]) -> list[tuple[float, float]]:
    """返回每个槽位的 (重叠长度, 槽宽)，用于 E173 合并跨度判定。"""
    n = len(bounds) + 1
    out: list[tuple[float, float]] = []
    for i in range(n):
        b_lo = bounds[i - 1] if i > 0 else None
        b_hi = bounds[i] if i < n - 1 else None
        slot_x0 = b_lo if b_lo is not None else float("-inf")
        slot_x1 = b_hi if b_hi is not None else float("inf")
        over = min(x1, slot_x1) - max(x0, slot_x0)
        out.append((max(over, 0.0), slot_x1 - slot_x0))
    return out


def detect_merges(
    cell_items: list[list[list[dict]]],
    col_cx: list[float],
    row_anchors: list[float],
    grid_bounds: tuple[list[float], list[float]] | None = None,
) -> tuple[list[dict], list[dict]]:
    """E173：几何法合并单元格还原 → (merges, warnings)。

    merges: [{row, col, rowSpan, colSpan, text}]——bbox 正重叠覆盖多个列槽位（或强重叠
    覆盖多个行槽位）且覆盖区内其它格为空时判定为合并；覆盖区有真实内容且重叠显著 →
    进 warnings 如实提示（不强行合并）。"""
    merges: list[dict] = []
    warnings: list[dict] = []
    covered: set[tuple] = set()
    rows = len(cell_items)
    cols = len(cell_items[0]) if rows else 0
    if rows == 0 or cols == 0:
        return merges, warnings
    if grid_bounds is not None:
        col_bounds, row_bounds = grid_bounds
    else:
        col_bounds = _slot_bounds(col_cx)
        row_bounds = _slot_bounds(row_anchors)

    for r, row in enumerate(cell_items):
        for c, its in enumerate(row):
            if not its or (r, c) in covered:
                continue
            bb = _bbox_of(its)
            x_ov = _slot_overlaps(bb["x"], bb["x"] + bb["w"], col_bounds)
            y_ov = _slot_overlaps(bb["y"], bb["y"] + bb["h"], row_bounds)
            x_pos = [i for i, (ov, _sw) in enumerate(x_ov) if ov > 0]
            y_strong = [i for i, (ov, sw) in enumerate(y_ov) if ov > 0.3 * min(bb["h"], sw)]
            y_pos = [i for i, (ov, _sw) in enumerate(y_ov) if ov > 0]
            x_strong = [i for i, (ov, sw) in enumerate(x_ov) if ov > 0.3 * min(bb["w"], sw)]
            if len(x_pos) <= 1 and len(y_pos) <= 1:
                continue
            c0, c1 = x_pos[0], x_pos[-1]
            if len(y_strong) > 1:
                r0, r1 = y_strong[0], y_strong[-1]
            else:
                r0, r1 = r, r
            if c1 == c0 and r1 == r0:
                continue  # bbox 未真正跨多格（如文本底边越过网格线几像素），不是合并
            # 冲突校验：覆盖区内除锚点外必须为空，否则不强行合并
            conflict = False
            for rr in range(r0, r1 + 1):
                for cc in range(c0, c1 + 1):
                    if (rr, cc) == (r, c):
                        continue
                    if cell_items[rr][cc]:
                        conflict = True
            if conflict:
                if len(x_strong) > 1 or len(y_strong) > 1:
                    warnings.append(
                        {
                            "type": "merged_conflict",
                            "row": r0,
                            "col": c0,
                            "detail": "第" + str(r0 + 1) + "行第" + str(c0 + 1) + "列疑似跨"
                            + str(c1 - c0 + 1) + "列/跨" + str(r1 - r0 + 1) + "行合并，"
                            + "但覆盖区内有其它文本，无法自动还原",
                        }
                    )
                continue
            text = " ".join(it["text"] for it in sorted(its, key=lambda i: i["cy"])).strip()
            merges.append(
                {
                    "row": r0,
                    "col": c0,
                    "rowSpan": r1 - r0 + 1,
                    "colSpan": c1 - c0 + 1,
                    "text": text,
                }
            )
            for rr in range(r0, r1 + 1):
                for cc in range(c0, c1 + 1):
                    covered.add((rr, cc))
    # E175：顶部表头行启发式——两级分组（“华东/华北”各跨 2 列）与整行居中标题。
    # 条件：该行窄于数据行、行内空区间呈组间空隙模式（空隙数 + 1 >= 填充数）、
    # 空区间下方确有内容；内部区间并入距中点更近的锚点，边缘区间并入唯一侧锚点
    # （下方无内容的表尾空格仍跳过，避免误并）。
    # E175/E176：顶部表头行启发式——整行居中标题、垂直组标签/角落合并、组间空隙。
    # 阶段 A：整行居中标题（单文本、居中、两侧下方有内容 → 合并整行，替换槽位法
    #   水平部分合并、保留跨行合并）。
    # 阶段 B：垂直组标签/角落合并（L 形表头）——锚点上方同列为空、下方同列有数据时，
    #   向上扩展到连续空格顶部，再向右扩展同行空格（要求整列矩形全空且扩展列下方
    #   有数据），得到 rowSpan × colSpan 矩形；纯数字锚点视为数据行跳过。
    # 阶段 C：组间空隙水平启发式（空隙数 + 1 >= 填充数、空区间下方有数据；逐空区间
    #   跳过 covered，避免与角落合并冲突）。
    if rows > 1:
        max_filled = max(sum(1 for its in row if its) for row in cell_items)
        band = min(2, rows)
        band_v = min(3, rows)  # E177：垂直组标签/角落合并可向上扩展到第 3 行
        # 阶段 A：整行居中标题
        for hr in range(band):
            row_filled = sum(1 for its in cell_items[hr] if its)
            if row_filled >= max_filled:
                continue
            if row_filled == 1 and cols > 1:
                only_c = next(c for c in range(cols) if cell_items[hr][c])
                vert_merge = any(
                    m["rowSpan"] > 1
                    and m["row"] <= hr < m["row"] + m["rowSpan"]
                    and m["col"] <= only_c < m["col"] + m["colSpan"]
                    for m in merges
                )
                if not vert_merge:
                    bb = _bbox_of(cell_items[hr][only_c])
                    cx = bb["x"] + bb["w"] / 2
                    row_cx = 0.5 * (col_bounds[0] + col_bounds[-1])
                    row_w = col_bounds[-1] - col_bounds[0]
                    if abs(cx - row_cx) < 0.15 * row_w:
                        left_ok = any(
                            cell_items[rr][cc]
                            for rr in range(hr + 1, rows)
                            for cc in range(0, only_c)
                        )
                        right_ok = any(
                            cell_items[rr][cc]
                            for rr in range(hr + 1, rows)
                            for cc in range(only_c + 1, cols)
                        )
                        if left_ok and right_ok:
                            merges = [
                                m
                                for m in merges
                                if not (
                                    m["row"] <= hr < m["row"] + m["rowSpan"]
                                    and m["rowSpan"] == 1
                                )
                            ]
                            for cc in range(cols):
                                covered.discard((hr, cc))
                            for m in merges:
                                if m["row"] <= hr < m["row"] + m["rowSpan"]:
                                    for cc in range(m["col"], m["col"] + m["colSpan"]):
                                        covered.add((hr, cc))
                            text = " ".join(
                                it["text"]
                                for it in sorted(cell_items[hr][only_c], key=lambda i: i["cy"])
                            ).strip()
                            merges.append(
                                {"row": hr, "col": 0, "rowSpan": 1, "colSpan": cols, "text": text}
                            )
                            for cc in range(cols):
                                covered.add((hr, cc))
                            continue
        # 阶段 B：垂直组标签 / 角落合并（L 形表头）
        for hr in range(1, band_v):
            for c in range(cols):
                if not cell_items[hr][c]:
                    continue
                if (hr, c) in covered or (hr - 1, c) in covered:
                    continue
                # 上方同列格若在同行水平组头向右延伸的覆盖范围内（其左侧同行有锚点），
                # 该格归水平组头所有，垂直组标签不成立（如两级表头“华东 A1:B1”下的“杭州”）。
                l = c - 1
                while l >= 0 and not cell_items[hr - 1][l]:
                    l -= 1
                if l >= 0:
                    continue
                if cell_items[hr - 1][c]:
                    continue
                    continue
                if hr + 1 >= rows:
                    continue
                if not any(cell_items[rr][c] for rr in range(hr + 1, rows)):
                    continue
                text = " ".join(
                    it["text"]
                    for it in sorted(cell_items[hr][c], key=lambda i: i["cy"])
                ).strip()
                if re.search(r"^[0-9][0-9.,%()\-+]*\s*$", text):
                    continue
                r_top = hr - 1
                while r_top - 1 >= 0 and not cell_items[r_top - 1][c]:
                    r_top -= 1
                c1 = c
                while c1 + 1 < cols:
                    if any(cell_items[rr][c1 + 1] for rr in range(r_top, hr + 1)):
                        break
                    if any((rr, c1 + 1) in covered for rr in range(r_top, hr + 1)):
                        break
                    if not any(cell_items[rr][c1 + 1] for rr in range(hr + 1, rows)):
                        break
                    c1 += 1
                conflict = False
                for rr in range(r_top, hr + 1):
                    for cc in range(c, c1 + 1):
                        if (rr, cc) == (hr, c):
                            continue
                        if (rr, cc) in covered or cell_items[rr][cc]:
                            conflict = True
                if conflict:
                    continue
                merges.append(
                    {
                        "row": r_top,
                        "col": c,
                        "rowSpan": hr - r_top + 1,
                        "colSpan": c1 - c + 1,
                        "text": text,
                    }
                )
                for rr in range(r_top, hr + 1):
                    for cc in range(c, c1 + 1):
                        covered.add((rr, cc))
        # 阶段 C：组间空隙水平启发式
        for hr in range(band):
            row_filled = sum(1 for its in cell_items[hr] if its)
            if row_filled >= max_filled:
                continue
            empty_runs: list[tuple[int, int]] = []
            c = 0
            while c < cols:
                if cell_items[hr][c]:
                    c += 1
                    continue
                start = c
                while c < cols and not cell_items[hr][c]:
                    c += 1
                empty_runs.append((start, c - 1))
            if len(empty_runs) + 1 < row_filled:
                continue
            for start, end in empty_runs:
                if any((hr, cc) in covered for cc in range(start, end + 1)):
                    continue
                below_filled = any(
                    cell_items[rr][cc]
                    for rr in range(hr + 1, rows)
                    for cc in range(start, end + 1)
                )
                if not below_filled:
                    continue
                if start == 0:
                    # 左边缘空区间：下方有数据时并入右侧锚点（表头延伸到左表边）
                    anchor_c, c0, c1 = end + 1, start, end + 1
                elif end == cols - 1:
                    # 右边缘空区间：下方有数据时并入左侧锚点（组头延伸到表尾，如“华北”跨末两列）
                    anchor_c, c0, c1 = start - 1, start - 1, end
                else:
                    # 内部空区间：按距中点更近的分组锚点（如“华东”跨第 1、2 列）
                    left, right = start - 1, end + 1
                    if not cell_items[hr][left] or not cell_items[hr][right]:
                        continue
                    run_cx = 0.5 * (col_bounds[start - 1] + col_bounds[end])
                    l_bb = _bbox_of(cell_items[hr][left])
                    r_bb = _bbox_of(cell_items[hr][right])
                    l_cx = l_bb["x"] + l_bb["w"] / 2
                    r_cx = r_bb["x"] + r_bb["w"] / 2
                    if abs(l_cx - run_cx) <= abs(r_cx - run_cx):
                        anchor_c, c0, c1 = left, left, end
                    else:
                        anchor_c, c0, c1 = right, start, right
                if (hr, anchor_c) in covered:
                    continue
                text = " ".join(
                    it["text"] for it in sorted(cell_items[hr][anchor_c], key=lambda i: i["cy"])
                ).strip()
                merges.append(
                    {"row": hr, "col": c0, "rowSpan": 1, "colSpan": c1 - c0 + 1, "text": text}
                )
                for cc in range(c0, c1 + 1):
                    covered.add((hr, cc))
    merges.sort(key=lambda m: (m["row"], m["col"]))
    return merges, warnings




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



def deskew_image(arr):
    """E178：估计并纠正轻微倾斜（±5°）的表格图，返回 (纠正后数组, 角度)。
    用 Hough 直线检测近水平网格线的中位角作为倾斜角，|角度| < 0.25° 视为无需纠正。
    cv2 缺失时回退原图（表格模式退化为文本聚类路径，不抛错）。"""
    try:
        import cv2
    except ImportError:
        return arr, 0.0

    import math

    import numpy as np

    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY) if arr.ndim == 3 else arr
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    min_len = max(60, int(0.3 * min(gray.shape[:2])))
    segs = cv2.HoughLinesP(bw, 1, math.pi / 720, threshold=80, minLineLength=min_len, maxLineGap=8)
    angles: list[float] = []
    if segs is not None:
        for x1, y1, x2, y2 in segs[:, 0]:
            ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
            if abs(ang) < 45:
                angles.append(ang)
    if not angles:
        return arr, 0.0
    angle = float(np.median(angles))
    if abs(angle) < 0.25:
        return arr, 0.0
    h, w = gray.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    corrected = cv2.warpAffine(
        arr, matrix, (w, h), flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255),
    )
    return corrected, angle

def run_ocr(engine, src: str):
    """解码 + 识别，返回 (items, error)；失败时 error 非空。"""
    try:
        arr = load_image(src) if isinstance(src, str) else src
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
            arr_src = load_image(src)
            corrected, _skew = deskew_image(arr_src)
            items, run_err = run_ocr(engine, corrected)
            if run_err:
                return fail(run_err)
            items = items or []
            # E174：优先网格线重建（行列结构精确），无网格回退文本聚类
            grid_lines = detect_table_lines(corrected)
            if grid_lines:
                x_edges, y_edges = grid_lines
                grid, rows, cols, cell_items, col_cx, row_anchors = reconstruct_grid(
                    items, x_edges, y_edges
                )
                merges, warnings = detect_merges(
                    cell_items, col_cx, row_anchors, (x_edges[1:-1], y_edges[1:-1])
                )
            else:
                grid, rows, cols, cell_items, col_cx, row_anchors = reconstruct_table(items)
                merges, warnings = detect_merges(cell_items, col_cx, row_anchors)
            # E173：合并区文本重排到锚点格（grid/cells 同步；spans 保留原始 bbox 与 score）
            for m in merges:
                mrow, mcol = m["row"], m["col"]
                anchor_items: list[dict] = []
                for rr in range(mrow, mrow + m["rowSpan"]):
                    for cc in range(mcol, mcol + m["colSpan"]):
                        if (rr, cc) != (mrow, mcol):
                            anchor_items.extend(cell_items[rr][cc])
                            cell_items[rr][cc] = []
                cell_items[mrow][mcol].extend(anchor_items)
                cell_items[mrow][mcol] = sorted(
                    cell_items[mrow][mcol], key=lambda i: i["cy"]
                )
            grid = [
                [
                    " ".join(it["text"] for it in sorted(cells, key=lambda i: i["cy"])).strip()
                    for cells in row
                ]
                for row in cell_items
            ]
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerows(grid)
            csv_text = buf.getvalue()
            if out_csv:
                with open(out_csv, "w", encoding="utf-8", newline="") as fh:
                    fh.write(csv_text)
            # E172：TSR 原始数据——cells/spans 保留行列归属与 bbox；merges 为还原结果
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
                        "merges": merges,
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
