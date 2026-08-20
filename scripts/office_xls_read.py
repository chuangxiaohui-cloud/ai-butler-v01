"""Read an .xls first sheet into JSON rows via Excel COM or xlrd."""

import json
import sys

sys.stdout.reconfigure(encoding="utf-8")


def read_via_com(path):
    import win32com.client as win32

    app = win32.Dispatch("Excel.Application")
    app.Visible = False
    app.DisplayAlerts = False
    wb = None
    try:
        wb = app.Workbooks.Open(path, ReadOnly=True, UpdateLinks=0)
        ws = wb.Worksheets(1)
        values = ws.UsedRange.Value
        rows = []
        for row in values:
            if not row:
                continue
            rows.append([
                "" if cell is None else str(cell).strip()
                for cell in row
            ])
        return rows
    finally:
        if wb is not None:
            wb.Close(False)
        app.Quit()


def read_via_xlrd(path):
    import xlrd

    book = xlrd.open_workbook(path)
    sheet = book.sheet_by_index(0)
    rows = []
    for r in range(min(sheet.nrows, 2000)):
        rows.append([
            "" if sheet.cell_value(r, c) is None else str(sheet.cell_value(r, c)).strip()
            for c in range(sheet.ncols)
        ])
    return rows


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "usage: office_xls_read.py <input>"}))
        sys.exit(1)
    path = sys.argv[1]
    last_error = None
    for reader in (read_via_com, read_via_xlrd):
        try:
            rows = reader(path)
            print(json.dumps({
                "ok": True,
                "headers": rows[0] if rows else [],
                "rows": rows,
            }, ensure_ascii=False))
            return
        except Exception as exc:
            last_error = exc
    print(json.dumps({
        "ok": False,
        "error": f"xls 读取失败（需要本机 Excel 或 xlrd）：{last_error}",
    }, ensure_ascii=False))
    sys.exit(1)


if __name__ == "__main__":
    main()
