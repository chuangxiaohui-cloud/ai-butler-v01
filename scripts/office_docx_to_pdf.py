"""Convert a .doc/.docx file to PDF via Word COM."""

import json
import sys

sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "usage: office_docx_to_pdf.py <input> <output.pdf>"}))
        sys.exit(1)
    try:
        import win32com.client as win32

        app = win32.Dispatch("Word.Application")
        app.Visible = False
        app.DisplayAlerts = 0
        doc = None
        try:
            doc = app.Documents.Open(sys.argv[1], ReadOnly=True)
            doc.ExportAsFixedFormat(
                OutputFileName=sys.argv[2],
                ExportFormat=17,
                OpenAfterExport=False,
            )
            print(json.dumps({"ok": True, "path": sys.argv[2]}, ensure_ascii=False))
        finally:
            try:
                if doc is not None:
                    doc.Close(False)
            except Exception:
                pass
            try:
                app.Quit()
            except Exception:
                pass
    except Exception as exc:
        print(json.dumps({
            "ok": False,
            "error": f"docx→PDF 失败（需要本机 Word）：{exc}",
        }, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
