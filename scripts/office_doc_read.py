"""Read a .doc file into plain text via Word COM."""

import json
import sys

sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "usage: office_doc_read.py <input>"}))
        sys.exit(1)
    try:
        import win32com.client as win32

        app = win32.Dispatch("Word.Application")
        app.Visible = False
        app.DisplayAlerts = 0
        doc = None
        try:
            doc = app.Documents.Open(sys.argv[1], ReadOnly=True)
            text = doc.Content.Text
            print(json.dumps({"ok": True, "text": text}, ensure_ascii=False))
        finally:
            if doc is not None:
                doc.Close(False)
            app.Quit()
    except Exception as exc:
        print(json.dumps({
            "ok": False,
            "error": f"doc 读取失败（需要本机 Word）：{exc}",
        }, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
