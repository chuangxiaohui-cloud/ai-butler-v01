"""Read 365IPC_TOTAL_BOM_0307.xls via Excel COM and dump normalized rows."""

import json
import pathlib
import sys

import win32com.client as win32


def cell(value):
    if value is None:
        return ""
    text = str(value).strip()
    return text


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else r"M:\202608111\365IPC_TOTAL_BOM_0307.xls"
    output = sys.argv[2] if len(sys.argv) > 2 else "data/bom-reference.json"
    app = win32.Dispatch("Excel.Application")
    app.Visible = False
    app.DisplayAlerts = False
    wb = None
    try:
        wb = app.Workbooks.Open(
            path,
            ReadOnly=True,
            UpdateLinks=0,
        )
        result = {"ok": True, "sheets": []}
        for ws in wb.Worksheets:
            used = ws.UsedRange
            values = used.Value
            rows = []
            for row in values:
                if not row:
                    continue
                item = cell(row[0] if len(row) > 0 else "")
                refdes = cell(row[2] if len(row) > 2 else "")
                if not item and not refdes:
                    continue
                rows.append({
                    "item": item,
                    "qty": cell(row[1] if len(row) > 1 else ""),
                    "refdes": refdes,
                    "value": cell(row[3] if len(row) > 3 else ""),
                    "footprint": cell(row[4] if len(row) > 4 else ""),
                    "manufacturer": cell(row[5] if len(row) > 5 else ""),
                })
            result["sheets"].append({
                "name": ws.Name,
                "rowCount": len(rows),
                "rows": rows,
            })
        pathlib.Path(output).parent.mkdir(exist_ok=True)
        pathlib.Path(output).write_text(
            json.dumps(result, ensure_ascii=False),
            encoding="utf-8",
        )
        print(json.dumps({
            "ok": True,
            "sheets": [
                {"name": sheet["name"], "rowCount": sheet["rowCount"]}
                for sheet in result["sheets"]
            ],
            "file": output,
        }, ensure_ascii=False))
    finally:
        if wb is not None:
            wb.Close(False)
        app.Quit()


if __name__ == "__main__":
    sys.exit(main())
