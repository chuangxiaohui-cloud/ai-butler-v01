"""Extract text / table structure from image(s) using Pillow + RapidOCR/PaddleOCR.

单图：   office_image_ocr.py <input-image> [output-txt]
批量：   office_image_ocr.py --batch <output-txt> <img1> [img2 ...]   # E167
表格：   office_image_ocr.py --table <input-image> [out-csv]          # E168
"""

import csv
import difflib
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



def _merge_near_edges(edges: list[int]) -> list[float]:
    """E186：合并相距 ≤5px 的网格线候选边（同一条线被打碎的两段）。"""
    if not edges:
        return []
    merged: list[float] = []
    cluster = [edges[0]]
    for e in edges[1:]:
        if e - cluster[-1] <= 5:
            cluster.append(e)
        else:
            merged.append(sum(cluster) / len(cluster))
            cluster = [e]
    merged.append(sum(cluster) / len(cluster))
    return merged


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
    # E186：200dpi 渲染页细线被透字抑制打成碎片时，同一条线会裂成相距几像素的两条伪边
    #（如 1362/1365），产生幻影空行/列；相邻边 ≤5px 视为同一条线合并（真实表列宽 ≥15px）。
    return _merge_near_edges(xs), _merge_near_edges(ys)


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
        # E184：阶段 B0——第 1 行锚点的垂直组标签向下扩展（左上角标签，如整行标题下的
        # “产品 A1:A3”）。锚点在行 0、直接下方同列为空时向下扩展到同列连续空格底部；
        # 守卫：同列下方（扩展区外）必须有内容（避免空表尾/末行缺值），且扩展区行其它
        # 列至少有一个非数字子标签（表头带证据，避免把数字数据行的缺值格当标签）。
        for c in range(cols):
            if not cell_items[0][c] or (0, c) in covered:
                continue
            if rows > 1 and cell_items[1][c]:
                continue
            r1 = 0
            while r1 + 1 < rows and not cell_items[r1 + 1][c] and (r1 + 1, c) not in covered:
                r1 += 1
            if r1 == 0:
                continue
            text = " ".join(
                it["text"] for it in sorted(cell_items[0][c], key=lambda i: i["cy"])
            ).strip()
            if re.search(r"^[0-9][0-9.,%()\-+]*\s*$", text):
                continue
            if not any(cell_items[rr][c] for rr in range(r1 + 1, rows)):
                continue
            # 扩展区行其它列至少有一个非数字子标签；若全是数字说明是数据行（缺值），不合并
            sub_label = any(
                not re.search(r"^[0-9][0-9.,%()\-+]*\s*$", it["text"])
                for rr in range(1, r1 + 1)
                for cc in range(cols)
                if cc != c
                for it in cell_items[rr][cc]
            )
            if not sub_label:
                continue
            # E184：扫描件透字残影守卫——锚点文本若在表内其它格重复出现（如透字把
            # “上海”残影印到左上角空槽，或与真实文本合并成“上海京”），视为噪声不合并
            # （真实垂直标签文本只出现一次）；用子串匹配覆盖残影与真实文本粘连的场景。
            other_texts = [
                " ".join(it2["text"] for it2 in sorted(cell_items[rr2][cc2], key=lambda i: i["cy"]))
                for rr2 in range(rows)
                for cc2 in range(cols)
                if (rr2, cc2) != (0, c) and cell_items[rr2][cc2]
            ]
            if any(text in ot for ot in other_texts):
                continue
            # E184：右边缘守卫——扩展区行（1..r1）至少有一格在锚点列右侧，否则是
            # 右缘表头列下方恰好缺值（如“项目 A1:B2 + 数量 C1”的 C2 空槽），不合并。
            if not any(
                cell_items[rr][cc]
                for rr in range(1, r1 + 1)
                for cc in range(c + 1, cols)
            ):
                continue
            conflict = any(
                (rr, c) in covered or cell_items[rr][c] for rr in range(1, r1 + 1)
            )
            if conflict:
                continue
            merges.append(
                {"row": 0, "col": c, "rowSpan": r1 + 1, "colSpan": 1, "text": text}
            )
            for rr in range(0, r1 + 1):
                covered.add((rr, c))

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
                if hr + 1 >= rows:
                    continue
                if not any(cell_items[rr][c] for rr in range(hr + 1, rows)):
                    # E183：角落（第 1 列）垂直标签可延伸到表身底部——下方同列无数据、
                    # 但下方其它列有数据时仍视为表头行标签（如整行标题下的“产品”）。
                    if c != 0 or not any(
                        cell_items[rr][cc]
                        for rr in range(hr + 1, rows)
                        for cc in range(cols)
                    ):
                        continue
                text = " ".join(
                    it["text"]
                    for it in sorted(cell_items[hr][c], key=lambda i: i["cy"])
                ).strip()
                if re.search(r"^[0-9][0-9.,%()\-+]*\s*$", text):
                    continue
                r_top = hr - 1
                # E183：向上扩展遇到被其它合并覆盖的格子（如整行标题/水平组头）也停止——
                # 覆盖格在 cell_items 里可能为空（标题文字落在其它列），不停止会穿过
                # 标题行把标题并入垂直标签或触发伪冲突。
                while (
                    r_top - 1 >= 0
                    and not cell_items[r_top - 1][c]
                    and (r_top - 1, c) not in covered
                ):
                    r_top -= 1
                # E181：垂直扩展被上方普通格截断（如透字残影占据角落/空槽）→ 诚实
                # 提示，不产生截断的伪合并；上方格若已被整行标题/水平组头覆盖
                # （covered）则视为合法设计（标题行下的垂直组标签），继续正常扩展。
                if r_top > 0 and (r_top - 1, c) not in covered:
                    warnings.append(
                        {
                            "type": "merged_conflict",
                            "row": r_top - 1,
                            "col": c,
                            "detail": "第" + str(r_top) + "行第" + str(c + 1) + "列疑似跨"
                            + str(hr - r_top + 2) + "行垂直合并，但上方同列有其它文本"
                            + "（可能为透字/水印噪声），无法自动还原",
                        }
                    )
                    # 本应属于垂直标签的槽位标为 covered，避免后续水平启发式把空槽
                    # 误并入其它锚点（如“华东”跨到垂直标签列）。
                    for rr in range(r_top, hr + 1):
                        covered.add((rr, c))
                    continue
                c1 = c
                while c1 + 1 < cols:
                    if any(cell_items[rr][c1 + 1] for rr in range(r_top, hr + 1)):
                        break
                    if any((rr, c1 + 1) in covered for rr in range(r_top, hr + 1)):
                        break
                    if not any(cell_items[rr][c1 + 1] for rr in range(hr + 1, rows)):
                        break
                    c1 += 1
                # E183：扩展后仍为单格（上下左右均被内容包围）不是合并，直接跳过。
                if hr - r_top + 1 <= 1 and c1 - c + 1 <= 1:
                    continue
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
            vert_cols = {
                cc
                for m in merges
                if m["rowSpan"] > 1
                and m["colSpan"] == 1
                and m["row"] <= hr < m["row"] + m["rowSpan"]
                for cc in range(m["col"], m["col"] + m["colSpan"])
            }
            row_filled = sum(
                1
                for cc, its in enumerate(cell_items[hr])
                if its and cc not in vert_cols
            )
            if row_filled >= max_filled:
                continue
            empty_runs: list[tuple[int, int]] = []
            c = 0
            while c < cols:
                if c in vert_cols or cell_items[hr][c]:
                    c += 1
                    continue
                start = c
                while c < cols and c not in vert_cols and not cell_items[hr][c]:
                    c += 1
                empty_runs.append((start, c - 1))
            gap_pattern = len(empty_runs) + 1 >= row_filled
            # E184：嵌套多层表头——锚点全部为非数字标签且空隙全部为单格时，即使锚点
            # 数比空隙数多（空隙模式检查不成立）也继续，逐空隙并入最近锚点（如
            # “上半年 | 空 | 下半年 | 空 | 上半年 | 下半年”的嵌套表头行）；数字数据行
            # （缺值）锚点含数字，不满足条件，保持不误并。
            nested_header = (
                row_filled >= 2
                and bool(empty_runs)
                and all(s == e for s, e in empty_runs)
                and all(
                    not re.search(r"^[0-9][0-9.,%()\-+]*\s*$", it["text"])
                    for cc, its in enumerate(cell_items[hr])
                    if its and cc not in vert_cols
                    for it in its
                )
            )
            if not gap_pattern and not nested_header:
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
                    if end == cols - 1:
                        continue  # E186：整行空格（矮表/分隔空行）无可并锚点，跳过防越界
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
                    # E183：内部空区间归属用槽位中心（col_cx）而非文本中心——
                    # 文本中心受 OCR 框宽度/字形影响，会把对称空区间误分给相邻锚点；
                    # 槽位中心对称时平局归左侧锚点。
                    run_cx = 0.5 * (col_cx[start - 1] + col_cx[end])
                    l_cx = col_cx[left]
                    r_cx = col_cx[right]
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

def suppress_faint_ink(arr, threshold: float = 85.0):
    """E181：扫描件透字/水印抑制——保留相对局部背景对比度足够高的暗墨，
    低对比度残影（透字、水印、折痕阴影）置白，避免残影文本污染合并判断。
    返回与输入等尺寸的 RGB 数组；numpy/PIL 缺失时回退原图。"""
    try:
        import numpy as np
        from PIL import Image, ImageFilter

        img = Image.fromarray(arr)
        gray = np.asarray(img.convert("L")).astype(np.float32)
        # E185：200dpi 渲染页（min 边 >1000px）网格线约 5-6px 粗，固定 5px 模糊会把
        # AA 边缘列打成碎片、网格线检测分裂出伪列；按图像尺寸放大模糊半径。
        min_side = min(gray.shape)
        radius = 5 if min_side <= 1000 else max(6, min_side // 100)
        blur = np.asarray(
            img.convert("L").filter(ImageFilter.GaussianBlur(radius))
        ).astype(np.float32)
        mask = (blur - gray) > threshold
        out = np.where(mask, 0, 255).astype(np.uint8)
        return np.stack([out] * 3, axis=-1)
    except Exception:
        return arr


def run_ocr(engine, src: str):
    """解码 + 识别，返回 (items, error)；失败时 error 非空。"""
    try:
        arr = load_image(src) if isinstance(src, str) else src
        result = engine(arr)
        return extract_boxes(result), None
    except Exception as exc:
        return None, f"{os.path.basename(src)}：{exc}"


TABLE_PDF_DPI = 200  # E185：多页 PDF 渲染 DPI

_PAGE_FOOTER_RE = re.compile(r"第\s*\d+\s*页[，,、\s]*共\s*\d+\s*页")


def _filter_page_footer(items, img_height, bottom_ratio=0.9):
    """E199：剔除页脚页码——图片底部 + 强模式「第X页，共Y页」同时满足才剔除。

    页脚/页码落在表格网格内时会被 OCR 当作正文追加（E186 遗留，真实样本 OCRtest.png
    复现：`第1页，共1页` 被归入末行第 7 列）。只处理带强模式的页码，无模式页脚
    （公司名/地址等）如实保留为正文，避免误伤贴底表格数据。
    返回 (kept, removed)。"""
    kept, removed = [], []
    for it in items:
        bottom = it["y"] + it["h"]
        if bottom > img_height * bottom_ratio and _PAGE_FOOTER_RE.search(it["text"]):
            removed.append(it)
        else:
            kept.append(it)
    return kept, removed



# ---------- E200/E201：表格 OCR 识别率后处理 ----------
# 代码形单元格：字母+数字+短横线混合（如 XTE-VAIS-FR118 / SN2024-001）
_CODE_CELL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]{3,}$")
_CODE_HEADER_RE = re.compile(
    r"编号|编码|料号|物料编码|零件编号|物料编号|Item|Code|NO\.|No\.", re.IGNORECASE
)
# 小字字形混淆集（E200 实测 8↔S/B；O↔0、l↔1 为常见形近；仅数字相邻槽位生效）
_CODE_DIGIT_CONFUSION = {
    "S": "8", "s": "8", "B": "8", "b": "8",
    "O": "0", "o": "0", "l": "1",
}
_BOOST_SCALE = 2  # E200：预处理通道放大倍数（2x 整数放大，实测编号列 0%→84%）


def preprocess_ocr_input(arr, scale: int = _BOOST_SCALE):
    """E200：表格 OCR 标准预处理——灰度 → 自动对比度 → scale× LANCZOS 放大 → 锐化。

    实测（OCRtest.png，RapidOCR）：编号列 7px 小字准确率 0% → 84%；中文列放大后略降，
    故由 `_fuse_items` 按列择优（代码列取本通道，其余列取灰度通道）。"""
    from PIL import Image, ImageFilter, ImageOps
    import numpy as np

    img = Image.fromarray(arr).convert("L")
    img = ImageOps.autocontrast(img)
    img = img.resize((img.width * scale, img.height * scale), Image.LANCZOS)
    img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=2))
    return np.asarray(img.convert("RGB"))


def _normalize_scale(items, scale: float):
    """E200：把放大通道的 bbox 坐标按 scale 归一化回原图坐标系。"""
    out = []
    for it in items or []:
        it = dict(it)
        for key in ("x", "y", "w", "h", "cx", "cy"):
            if key in it:
                it[key] = it[key] / scale
        out.append(it)
    return out


def _cluster_columns(items):
    """E200：按文本块 cx 聚类列中心（与 reconstruct_table 同规则，提取复用）。"""
    if not items:
        return []
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
    return cols


def _code_column_ranges(items, boost_items):
    """E200：识别代码列 x 区间——列内 ≥60% 单元格为代码形，或表头命中编号/编码关键词。

    用灰度文本通道 + 2x 预处理通道共同判定（预处理通道的代码文本更准）。"""
    if not items:
        return []
    all_items = list(items) + list(boost_items)
    cols = _cluster_columns(all_items)
    if not cols:
        return []
    widths = sorted(it["w"] for it in all_items if it.get("w"))
    half = max(widths[len(widths) // 2] if widths else 40.0, 40.0)
    centers = [c["cx"] for c in cols]
    ranges = []
    for i, center in enumerate(centers):
        x0 = (centers[i - 1] + center) / 2 if i > 0 else center - half
        x1 = (center + centers[i + 1]) / 2 if i + 1 < len(centers) else center + half
        col_items = [it for it in all_items if x0 <= it["cx"] < x1]
        texts = [it["text"].strip() for it in col_items if it["text"].strip()]
        if not texts:
            continue
        top = sorted(col_items, key=lambda it: it["cy"])[:2]
        if any(_CODE_HEADER_RE.search(it["text"]) for it in top):
            ranges.append((x0, x1))
            continue
        hit = sum(1 for t in texts if _CODE_CELL_RE.match(t))
        if hit / len(texts) >= 0.6:
            ranges.append((x0, x1))
    return ranges


def _in_code_col(it, code_ranges):
    return any(x0 <= it["cx"] < x1 for x0, x1 in code_ranges)


def _fuse_items(base_items, boost_items, code_ranges):
    """E200：双通道融合——代码列取预处理通道（小字增益），其余列取原图通道。

    预处理通道未检出的代码行保留原图文本（前缀可能带字形混淆，交给模式纠正收尾）。"""
    boost = [it for it in boost_items if _in_code_col(it, code_ranges)]

    def covered_by_boost(it):
        return any(abs(b["cy"] - it["cy"]) < 12 for b in boost)

    base = [
        it
        for it in base_items
        if not _in_code_col(it, code_ranges) or not covered_by_boost(it)
    ]
    return base + boost


def _fuse_text_by_position(base_items, gray_items, code_ranges):
    """E200：非代码列文本通道融合——用灰度通道（保留 AA 小字）同位置文本替换
    cleaned 通道的文本，保留 cleaned 的 bbox/结构。灰度通道独有的文本块
    （如 E181 抑制掉的透字/水印残影）不引入，避免污染合并判断。"""
    gray = [it for it in gray_items if not _in_code_col(it, code_ranges)]
    out = []
    for it in base_items:
        if _in_code_col(it, code_ranges):
            out.append(it)
            continue
        best, best_d = None, None
        for g in gray:
            d_cy = abs(g["cy"] - it["cy"])
            if d_cy < 9 and abs(g["cx"] - it["cx"]) < 30:
                if best is None or d_cy < best_d:
                    best, best_d = g, d_cy
        if best is not None:
            it = dict(it)
            it["text"] = best["text"]
            it["score"] = best.get("score", it.get("score"))
        out.append(it)
    return out


def _fill_missing_cells(base_items, gray_items, code_ranges, y_edges=None):
    """E200：灰度通道补框——仅限检测到编号列的表格（数据行以编号框为锚）。

    cleaned 通道二值化会把小字格整格漏检（OCRtest.png 名称/型号列缺 ~20 格），
    灰度通道可检出但会引入 E181 已抑制的透字/水印假框；故只补「所在行已有编号框」
    的灰度为有数据行，透字图（无编号列）整体不补框，回归 E181 语义。
    补入的 bbox 按 y_edges 行边界裁剪，防止跨行 bbox 被 detect_merges 阶段 C
    误判为跨行合并嫌疑（OCRtest.png 实测：7px 小字框高 22px 越过行界 → 3 条伪
    merged_conflict）。"""
    if not code_ranges:
        return base_items
    code_rows = [
        it["cy"]
        for it in base_items
        if _in_code_col(it, code_ranges) and it["text"].strip()
    ]
    bands = (
        [(y_edges[i], y_edges[i + 1]) for i in range(len(y_edges) - 1)]
        if len(y_edges) >= 2
        else []
    )

    def clip(g):
        if not bands:
            return g
        g = dict(g)
        best, best_d = None, None
        for b0, b1 in bands:
            d = abs(0.5 * (b0 + b1) - g["cy"])
            if best is None or d < best_d:
                best, best_d = (b0, b1), d
        b0, b1 = best
        y0 = max(g["y"], b0)
        y1 = min(g["y"] + g["h"], b1)
        if y1 - y0 >= 4:  # 裁剪后仍足够高才保留
            g["y"], g["h"] = y0, y1 - y0
            g["cy"] = g["y"] + g["h"] / 2
        return g

    out = list(base_items)
    for g in gray_items:
        if _in_code_col(g, code_ranges):
            continue
        if not any(abs(c - g["cy"]) < 9 for c in code_rows):
            continue
        if any(
            abs(b["cy"] - g["cy"]) < 9 and abs(b["cx"] - g["cx"]) < 30
            for b in base_items
        ):
            continue
        out.append(clip(g))
    return out


def _near_digit(text: str, i: int) -> bool:
    return (i > 0 and text[i - 1].isdigit()) or (
        i + 1 < len(text) and text[i + 1].isdigit()
    )


def correct_code_cell(text: str) -> str:
    """E200：编号列模式纠正——代码形单元格内，把与数字相邻的混淆字符按字形映射纠正。

    前缀字母段（如 XTE）不纠正，避免误伤；数字槽的 S/B/O/l 换回 8/0/1。
    实测剩余编号错误（FR11S/FR407-1S/FR40S 等 8↔S）全部落在本规则内。"""
    t = (text or "").strip()
    if not _CODE_CELL_RE.match(t) or not re.search(r"[0-9]", t):
        return text
    out = list(t)
    for i, ch in enumerate(out):
        if ch in _CODE_DIGIT_CONFUSION and _near_digit(t, i):
            out[i] = _CODE_DIGIT_CONFUSION[ch]
    corrected = "".join(out)
    return corrected if corrected != t else text


def load_ocr_dict(path: str) -> dict:
    """E201：加载词典 {分类: {规范值: [OCR 变体, ...]}} → 展开为 {变体: 规范值}；缺失/损坏返回 {}。"""
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception:
        return {}
    out: dict = {}
    for _category, entries in data.items():
        if not isinstance(entries, dict):
            continue
        for canonical, variants in entries.items():
            for v in variants if isinstance(variants, list) else [variants]:
                if isinstance(v, str) and str(v) != str(canonical):
                    out[v] = str(canonical)
    return out


def _default_ocr_dict():
    """E201：默认词典路径 data/ocr-dict.json（git 忽略的运行时词典，存在才启用）。"""
    root = pathlib.Path(__file__).resolve().parent.parent
    p = root / "data" / "ocr-dict.json"
    return load_ocr_dict(str(p)) if p.exists() else {}


def correct_dict_cell(text: str, ocr_dict: dict, ratio_threshold: float = 0.78) -> str:
    """E201：词典纠正——精确命中变体直接替换；长文本（≥4 字符）按相似度阈值模糊替换。

    短文本不做模糊替换，避免「块/个/条」等单字单位被误改。"""
    t = (text or "").strip()
    if not t or not ocr_dict:
        return text
    if t in ocr_dict:
        return ocr_dict[t]
    if len(t) < 4:
        return text
    best, best_ratio = None, 0.0
    for variant, canonical in ocr_dict.items():
        r = difflib.SequenceMatcher(None, t, variant).ratio()
        if r > best_ratio:
            best, best_ratio = variant, r
    if best is not None and best_ratio >= ratio_threshold and ocr_dict[best] != t:
        return ocr_dict[best]
    return text


def selftest_main() -> int:
    """E200/E201 纯函数自检：不依赖 OCR 引擎，供 TS 单测调用。"""
    flat = {}
    for _cat, entries in {
        "型号": {
            "固态硬盘-MSATA接口": ["固态硬盘-WSATA楼口", "固态硬盘-WBATA楼口"],
            "64G,宜鼎SSD": ["64G,宣外SSD"],
            "G070VW01 V.0": ["GO70VT01 V. 0", "GO70VT01 V.0"],
        }
    }.items():
        for canonical, variants in entries.items():
            for v in variants:
                flat[v] = canonical
    cases = [
        ("FR11S→FR118", correct_code_cell("XTE-VAIS-FR11S"), "XTE-VAIS-FR118"),
        ("FR407-1S→FR407-18", correct_code_cell("XTE-VAIS-FR407-1S"), "XTE-VAIS-FR407-18"),
        ("FR40S→FR408", correct_code_cell("XTE-VAIS-FR40S"), "XTE-VAIS-FR408"),
        ("已正确编号不动", correct_code_cell("XTE-VAIS-FR101"), "XTE-VAIS-FR101"),
        ("前缀字母段不纠", correct_code_cell("XTB-VAIS-FR101"), "XTB-VAIS-FR101"),
        ("数字槽B→8", correct_code_cell("XTE-VAIS-FR1B0"), "XTE-VAIS-FR180"),
        ("非代码形不动", correct_code_cell("64G,宜鼎SSD"), "64G,宜鼎SSD"),
        ("短代码不动", correct_code_cell("3*100白色"), "3*100白色"),
        ("中文不动", correct_code_cell("加密狗"), "加密狗"),
        ("词典精确命中", correct_dict_cell("固态硬盘-WSATA楼口", flat), "固态硬盘-MSATA接口"),
        ("词典模糊替换", correct_dict_cell("GO70VT01 V.0", flat), "G070VW01 V.0"),
        ("短文本不模糊替换", correct_dict_cell("块", flat), "块"),
        ("无关文本不动", correct_dict_cell("工控机主板", flat), "工控机主板"),
    ]
    failed = [name for name, got, want in cases if got != want]
    print(json.dumps({"ok": not failed, "total": len(cases), "failed": failed}, ensure_ascii=False))
    return 0 if not failed else 1


def process_table_array(engine, arr, ocr_dict=None):

    """E168..E200：单张图像 → 表格结构 dict。

    含 deskew/透字抑制/OCR/网格重建/detect_merges/合并重排/cells/spans；
    cell_items 保留每格原始 bbox（TSR 数据），供 E185 跨页拼接复用。"""
    corrected, _skew = deskew_image(arr)
    cleaned = suppress_faint_ink(corrected)
    items, run_err = run_ocr(engine, cleaned)
    if run_err:
        raise RuntimeError(run_err)
    items = items or []
    # E199：页脚页码过滤（底部边缘 + 强模式），防页码落格当正文追加
    items, footer_removed = _filter_page_footer(items, cleaned.shape[0])
    # E174：网格线检测提前——E200 补框需按行边界裁剪 bbox（防跨行 bbox 被
    # detect_merges 阶段 C 误判为跨行合并嫌疑），结果复用给 reconstruct_grid。
    grid_lines = detect_table_lines(cleaned)
    y_edges = grid_lines[1] if grid_lines else []
    # E200：三通道文本融合——结构用 cleaned（透字抑制，防假框污染合并判断）；
    # 非代码列文本用灰度通道（保留 AA 小字，E181 实测透字抑制二值化会抹掉 7px 字边缘），
    # 代码列用 2x 放大预处理通道（7px 小字增益）。两通道都取 deskew 后的灰度图 corrected。
    code_ranges: list = []
    if os.environ.get("OCR_TEXT_FUSION", "1") != "0":
        gray_items, gray_err = run_ocr(engine, corrected)
        if gray_err:
            gray_items = []
        boost_items, boost_err = run_ocr(engine, preprocess_ocr_input(corrected))
        if not boost_err:
            boost_items = _normalize_scale(boost_items or [], _BOOST_SCALE)
            code_ranges = _code_column_ranges(gray_items or items, boost_items)
            if gray_items:
                items = _fuse_text_by_position(items, gray_items, code_ranges)
                items = _fill_missing_cells(items, gray_items, code_ranges, y_edges)
            items = _fuse_items(items, boost_items, code_ranges)
    # E200/E201：条目级后处理（网格/单元格构建前，保持 grid/cells/spans 一致）
    code_corrected = dict_corrected = 0
    for it in items:
        if _in_code_col(it, code_ranges):
            new_text = correct_code_cell(it["text"])
            if new_text != it["text"]:
                it["text"] = new_text
                code_corrected += 1
        if ocr_dict:
            new_text = correct_dict_cell(it["text"], ocr_dict)
            if new_text != it["text"]:
                it["text"] = new_text
                dict_corrected += 1
    # E174：优先网格线重建（行列结构精确），无网格回退文本聚类
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
    if footer_removed:
        warnings = list(warnings) + [
            {
                "type": "page_footer",
                "row": -1,
                "col": -1,
                "detail": "已排除页脚页码：" + "、".join(it["text"] for it in footer_removed),
            }
        ]
    if code_corrected:
        warnings = list(warnings) + [
            {
                "type": "code_corrected",
                "row": -1,
                "col": -1,
                "detail": f"已按编号模式纠正 {code_corrected} 处识别结果",
            }
        ]
    if dict_corrected:
        warnings = list(warnings) + [
            {
                "type": "dict_corrected",
                "row": -1,
                "col": -1,
                "detail": f"已按词典纠正 {dict_corrected} 处识别结果",
            }
        ]
    return {
        "grid": grid,
        "rows": rows,
        "cols": cols,
        "cell_items": cell_items,
        "merges": merges,
        "warnings": warnings,
        "cells": cells,
        "spans": spans,
        "pages": 1,
        "page_stitched": False,
        "page_headers": 0,
    }


def render_pdf_pages(src: str):
    """E185：fitz 按 dpi=200 渲染 PDF 每页 → RGB numpy 数组列表。"""
    import fitz
    import numpy as np

    doc = fitz.open(src)
    pages: list = []
    try:
        for page in doc:
            pix = page.get_pixmap(dpi=TABLE_PDF_DPI, colorspace=fitz.csRGB)
            arr = np.frombuffer(pix.samples, dtype=np.uint8)
            arr = arr.reshape(pix.height, pix.width, pix.n)
            if arr.shape[2] == 4:
                arr = arr[:, :, :3]
            pages.append(arr)
    finally:
        doc.close()
    if not pages:
        raise RuntimeError("PDF 无页面")
    return pages


def _row_similar(a: list, b: list) -> bool:
    """E185/E186：两行表头相似度——文本匹配率 ≥70%，或 span 级结构证据。

    结构证据：非空格列位置模式相同（哪些列有内容，源自 TSR span 的行列归属）且至少一个
    非空格格文本一致——OCR 噪声/透字粘连导致表头文本变化但列结构不变的重复表头仍可识别；
    要求至少一个文本锚点，避免稀疏正文行（如“小计|空|空|空|空”）误判为表头。"""
    norm_a = [(x or "").strip() for x in a]
    norm_b = [(x or "").strip() for x in b]
    n = eq = 0
    for x, y in zip(norm_a, norm_b):
        if not x and not y:
            continue
        n += 1
        if x == y:
            eq += 1
    if n == 0:
        return True
    if eq / n >= 0.7:
        return True
    pat_a = [bool(x) for x in norm_a]
    pat_b = [bool(x) for x in norm_b]
    return pat_a == pat_b and eq >= 1


def _common_header_rows(grid_a: list, grid_b: list) -> int:
    """E185：求 grid_b 前部与 grid_a 的公共表头行数（最长公共前缀）。"""
    h = 0
    for ra, rb in zip(grid_a, grid_b):
        if _row_similar(ra, rb):
            h += 1
        else:
            break
    return h


def stitch_table_pages(page_dicts: list[dict]) -> dict:
    """E185：跨页大表拼接——首页表头保留一次，后续页去重表头后正文行顺序追加。

    复用 TSR 已保留的 bbox/span：每页独立 OCR/网格/合并还原，这里只做行级拼接与
    全局行号重排（不重跑识别）。返回与单页同构的 dict，附 pages/page_stitched/
    page_headers 字段。列数不一致或表头无法匹配时诚实告警，不产出错误结构。"""
    if len(page_dicts) == 1:
        page = page_dicts[0]
        return {
            "grid": page["grid"],
            "rows": page["rows"],
            "cols": page["cols"],
            "cell_items": page["cell_items"],
            "merges": page["merges"],
            "warnings": page["warnings"],
            "cells": page["cells"],
            "spans": page["spans"],
            "pages": 1,
            "page_stitched": False,
            "page_headers": 0,
        }
    base = page_dicts[0]
    grid = [list(row) for row in base["grid"]]
    merges = [dict(m) for m in base["merges"]]
    warnings = [dict(w) for w in base["warnings"]]
    cells = [dict(c) for c in base["cells"]]
    spans = [dict(s) for s in base["spans"]]
    cols = base["cols"]
    total_rows = base["rows"]
    stitched = False
    for idx, page in enumerate(page_dicts[1:], start=2):
        h = _common_header_rows(base["grid"], page["grid"])
        if h >= 1:
            body = page["grid"][h:]
            drop_rows = h
            offset = total_rows - h
            stitched = True
        else:
            body = page["grid"]
            drop_rows = 0
            offset = total_rows
            warnings.append(
                {
                    "type": "page_header_mismatch",
                    "page": idx,
                    "detail": f"第 {idx} 页表头与首页不一致，无法自动去重表头，已整页拼接，请人工核对",
                }
            )
        if page["cols"] != cols:
            warnings.append(
                {
                    "type": "page_col_mismatch",
                    "page": idx,
                    "detail": f"第 {idx} 页列数 {page['cols']} 与首页 {cols} 不一致，已按首页列数补齐/截断",
                }
            )
        # E199：后续页的页脚页码告警并入总 warning（页脚已在单页识别时过滤，这里只透出）
        for w in page["warnings"]:
            if w["type"] == "page_footer":
                warnings.append(dict(w))
        # 正文行按首页列数对齐（补齐/截断），并入总表
        for row in body:
            grid.append((list(row) + [""] * cols)[:cols])
        # 合并区重排：后续页表头行（drop_rows）丢弃；正文合并偏移到全局行号
        for m in page["merges"]:
            if m["row"] < drop_rows or m["col"] >= cols:
                continue
            nm = dict(m)
            nm["row"] = m["row"] + offset
            merges.append(nm)
        # cells/spans 重排：表头行丢弃，正文行号全局化（复用 TSR bbox/span）
        for c in page["cells"]:
            if c["row"] < drop_rows or c["col"] >= cols:
                continue
            nc = dict(c)
            nc["row"] = c["row"] + offset
            cells.append(nc)
        for s in page["spans"]:
            if s["row"] < drop_rows or s["col"] >= cols:
                continue
            ns = dict(s)
            ns["row"] = s["row"] + offset
            spans.append(ns)
        total_rows += len(body)
        base = page  # 后续页以当前页为基准继续对表头（分页切片对齐）
    merges.sort(key=lambda m: (m["row"], m["col"]))
    cells.sort(key=lambda c: (c["row"], c["col"]))
    spans.sort(key=lambda s: (s["row"], s["col"]))
    header_h = (
        _common_header_rows(page_dicts[0]["grid"], page_dicts[1]["grid"])
        if len(page_dicts) > 1
        else 0
    )
    return {
        "grid": grid,
        "rows": len(grid),
        "cols": cols,
        "cell_items": None,  # 拼接后不保留 cell_items（grid/cells/spans 已全局化）
        "merges": merges,
        "warnings": warnings,
        "cells": cells,
        "spans": spans,
        "pages": len(page_dicts),
        "page_stitched": stitched,
        "page_headers": header_h,
    }



def main() -> int:
    args = sys.argv[1:]
    if args and args[0] == "--selftest":
        # E200/E201：纯函数自检（不依赖 OCR 引擎），供 TS 单测调用
        return selftest_main()
    table_mode = len(args) >= 1 and args[0] == "--table"
    batch = len(args) >= 1 and args[0] == "--batch"
    if table_mode:
        if len(args) < 2:
            return fail("usage: office_image_ocr.py --table <input-image> [out-csv] [--dict <dict.json>]")
        rest = args[1:]
        dict_path = None
        if "--dict" in rest:
            i = rest.index("--dict")
            if i + 1 < len(rest):
                dict_path = rest[i + 1]
            rest = rest[:i]
        src, out_csv = rest[0], (rest[1] if len(rest) > 1 else None)
        ocr_dict = load_ocr_dict(dict_path) if dict_path else _default_ocr_dict()
        try:
            engine, err = get_engine()
            if engine is None:
                return fail(err or "OCR 引擎不可用")
            ext = os.path.splitext(src)[1].lower()
            if ext == ".pdf":
                # E185：多页 PDF 扫描件——逐页识别后跨页拼接（复用 TSR bbox/span，不重跑整图识别）
                try:
                    page_dicts = [
                        process_table_array(engine, arr, ocr_dict=ocr_dict)
                        for arr in render_pdf_pages(src)
                    ]
                except ImportError:
                    return fail("PDF 表格识别需要 PyMuPDF（fitz），当前环境未安装；请运行 `python -m pip install pymupdf` 后重试")
                page = stitch_table_pages(page_dicts)
            else:
                page = process_table_array(engine, load_image(src), ocr_dict=ocr_dict)
            grid, rows, cols = page["grid"], page["rows"], page["cols"]
            merges, warnings = page["merges"], page["warnings"]
            cells, spans = page["cells"], page["spans"]
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerows(grid)
            csv_text = buf.getvalue()
            if out_csv:
                with open(out_csv, "w", encoding="utf-8", newline="") as fh:
                    fh.write(csv_text)
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
                        "pages": page["pages"],
                        "page_stitched": page["page_stitched"],
                        "page_headers": page["page_headers"],
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
