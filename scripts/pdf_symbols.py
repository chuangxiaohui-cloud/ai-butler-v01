#!/usr/bin/env python3
"""Extract words and candidate symbol bounding boxes from a PDF page."""

import json
import pathlib
import re
import sys

DESIGNATOR_RE = re.compile(r"^(R|C|L|D|Q|U|Y|J|X|F|T|K|SW|CON|TP)\d{1,4}$", re.I)


def rect_gap(a, b):
    dx = max(0.0, max(a[0], b[0]) - min(a[2], b[2]))
    dy = max(0.0, max(a[1], b[1]) - min(a[3], b[3]))
    return max(dx, dy)


def cluster_rects(rects, max_gap):
    n = len(rects)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(n):
        for j in range(i + 1, n):
            if rect_gap(rects[i], rects[j]) <= max_gap:
                union(i, j)

    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    out = []
    for indices in groups.values():
        box = [
            min(rects[i][0] for i in indices),
            min(rects[i][1] for i in indices),
            max(rects[i][2] for i in indices),
            max(rects[i][3] for i in indices),
        ]
        out.append({
            "x0": round(box[0], 2),
            "y0": round(box[1], 2),
            "x1": round(box[2], 2),
            "y1": round(box[3], 2),
            "count": len(indices),
            "area": round((box[2] - box[0]) * (box[3] - box[1]), 2),
        })
    return out


def word_rect(word):
    return (word[0], word[1], word[2], word[3])


def extract_page(page):
    words = page.get_text("words")
    word_items = [
        {
            "text": w[4],
            "x0": round(w[0], 2),
            "y0": round(w[1], 2),
            "x1": round(w[2], 2),
            "y1": round(w[3], 2),
            "size": round(w[5], 2),
        }
        for w in words
    ]
    text_symbols = cluster_rects([word_rect(w) for w in words], max_gap=8)
    text_symbols = [s for s in text_symbols if s["count"] >= 2]
    for symbol in text_symbols:
        symbol["designators"] = sorted({
            w[4].upper()
            for w in words
            if w[0] >= symbol["x0"]
            and w[1] >= symbol["y0"]
            and w[2] <= symbol["x1"]
            and w[3] <= symbol["y1"]
            and DESIGNATOR_RE.match(w[4])
        })

    drawings = []
    try:
        for drawing in page.get_drawings():
            r = drawing.get("rect")
            if r is not None:
                drawings.append((r.x0, r.y0, r.x1, r.y1))
    except Exception:
        drawings = []
    drawing_symbols = cluster_rects(drawings, max_gap=4)
    drawing_symbols = [
        s
        for s in drawing_symbols
        if 25 <= s["area"] <= 50000
        and (s["x1"] - s["x0"]) <= 200
        and (s["y1"] - s["y0"]) <= 200
    ]

    return {
        "page": page.number + 1,
        "width": round(page.rect.width, 2),
        "height": round(page.rect.height, 2),
        "wordCount": len(word_items),
        "words": word_items,
        "textSymbols": text_symbols,
        "drawingSymbols": drawing_symbols,
    }


def main():
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
    pages = [extract_page(page) for page in doc]
    doc.close()
    print(json.dumps({"ok": True, "pageCount": len(pages), "pages": pages}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
