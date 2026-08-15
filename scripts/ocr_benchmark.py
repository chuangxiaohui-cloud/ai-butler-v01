#!/usr/bin/env python3
"""Compare RapidOCR and PaddleOCR on one scanned PDF page."""

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

KEYWORDS = ["TPS5430", "5.5V", "500kHz"]


def run_engine(pdf: Path, engine: str) -> dict:
    cache_dir = tempfile.mkdtemp(prefix=f"ocr-{engine}-")
    env = {
        **os.environ,
        "PDF_OCR_ENGINE": engine,
        "PDF_OCR_MAX_PAGES": "1",
        "PDF_OCR_CACHE_DIR": cache_dir,
    }
    start = time.perf_counter()
    proc = subprocess.run(
        [sys.executable, "scripts/pdf_text.py", str(pdf)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        timeout=600,
    )
    elapsed = round(time.perf_counter() - start, 2)
    if proc.returncode != 0:
        return {"engine": engine, "ok": False, "error": proc.stderr[-500:], "elapsedSec": elapsed}
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        return {"engine": engine, "ok": False, "error": f"bad json: {exc}", "elapsedSec": elapsed}
    text = data.get("text", "")
    return {
        "engine": engine,
        "ok": data.get("ok", False),
        "chars": len(text),
        "elapsedSec": elapsed,
        "keywords": {keyword: (keyword in text) for keyword in KEYWORDS},
    }


def main() -> int:
    if len(sys.argv) < 2:
        print("用法: python scripts/ocr_benchmark.py <pdf>")
        return 2
    pdf = Path(sys.argv[1])
    results = [run_engine(pdf, engine) for engine in ("rapid", "paddle")]
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
