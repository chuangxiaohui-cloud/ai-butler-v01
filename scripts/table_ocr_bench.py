#!/usr/bin/env python3
"""表格 OCR 真值对比（bench:B-20260823-02）

用法:
  python scripts/table_ocr_bench.py <image> <gt.json> [--out <out.csv>]

- GT JSON 口径同 data/exp-paddle-gt.json：{行号: [编号, 名称, 型号, 数量, 单位, 备注]}
- 对齐：按编号精确匹配；编号为空的续行并入上一锚行（空格 join）。
- 判定：编号精确；名称/型号/数量/单位 精确 或 difflib 相似度 >= 0.85。
- 输出：逐列 对/总数 + 错例明细（JSON 到 stdout）。
"""
from __future__ import annotations

import difflib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

RATIO_THRESHOLD = 0.85
COLUMNS = ["名称", "型号", "数量", "单位", "备注"]


def run_table_ocr(image: Path, out_csv: Path) -> list[list[str]]:
    proc = subprocess.run(
        [sys.executable, "scripts/office_image_ocr.py", "--table", str(image), str(out_csv)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=900,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-1000:] or "table OCR failed")
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"bad json: {exc}") from exc
    if not payload.get("ok"):
        raise RuntimeError(f"table OCR not ok: {payload}")
    rows: list[list[str]] = []
    header = payload["grid"][0]
    code_idx = next((i for i, h in enumerate(header) if "编号" in h), 1)
    for r in payload["grid"][1:]:
        if len(r) <= code_idx:
            continue
        rows.append(r)
    return rows


def match_row(csv_rows: list[list[str]], code_idx: int, code: str, start: int) -> tuple[int, list[str]]:
    """从 start 起找编号==code 的行；返回 (锚行下标, 锚行+后续空编号续行合并文本)。"""
    for i in range(start, len(csv_rows)):
        if csv_rows[i][code_idx].strip() == code:
            merged: list[str] = []
            for c in range(len(csv_rows[i])):
                cell = csv_rows[i][c]
                j = i + 1
                while j < len(csv_rows) and not csv_rows[j][code_idx].strip():
                    extra = csv_rows[j][c].strip()
                    if extra:
                        cell = (cell + " " + extra).strip()
                    j += 1
                merged.append(cell)
            return i, merged
    return -1, []


def cell_ok(got: str, want: str) -> bool:
    got = (got or "").strip()
    want = (want or "").strip()
    if want == "":
        return got == ""
    if got == want:
        return True
    if len(got) >= 2 and len(want) >= 2:
        return difflib.SequenceMatcher(None, got, want).ratio() >= RATIO_THRESHOLD
    return False


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        print("用法: python scripts/table_ocr_bench.py <image> <gt.json> [--out <csv>]", file=sys.stderr)
        return 2
    image = Path(args[0])
    gt_path = Path(args[1])
    gt = json.loads(gt_path.read_text(encoding="utf-8"))
    out_csv = Path(args[2]) if "--out" in sys.argv else None
    if out_csv is None:
        fd = tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", encoding="utf-8")
        out_csv = Path(fd.name)
        fd.close()
    csv_rows = run_table_ocr(image, out_csv)
    # 表头定位编号列
    header = None
    with open(out_csv, encoding="utf-8") as fh:
        first = fh.readline().strip()
    if first:
        header = first.split(",")
    code_idx = next((i for i, h in enumerate(header or []) if "编号" in h), 1)

    code_ok = total = 0
    col_stat = {c: [0, 0] for c in COLUMNS}  # [对, 总数(该列 GT 非空)]
    mismatches: list[dict] = []
    cursor = 0
    for _k, row in gt.items():
        if len(row) < 5:
            continue
        code, name, model, qty, unit, note = (list(row) + [""] * 6)[:6]
        idx, merged = match_row(csv_rows, code_idx, code, cursor)
        if idx < 0:
            mismatches.append({"编号": code, "列": "编号", "GT": code, "OCR": "(未找到)"})
            continue
        cursor = idx + 1
        total += 1
        if merged[code_idx].strip() == code:
            code_ok += 1
        else:
            mismatches.append({"编号": code, "列": "编号", "GT": code, "OCR": merged[code_idx]})
        for col_name, want, col_idx in zip(COLUMNS, [name, model, qty, unit, note], range(2, 7)):
            got = merged[col_idx] if len(merged) > col_idx else ""
            col_stat[col_name][1] += 1
            if cell_ok(got, want):
                col_stat[col_name][0] += 1
            else:
                mismatches.append({"编号": code, "列": col_name, "GT": want, "OCR": got})
    print(json.dumps({
        "对齐": {"总数": total, "编号命中": code_ok},
        "逐列": {c: {"对": col_stat[c][0], "总": col_stat[c][1]} for c in COLUMNS},
        "错例": mismatches,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
