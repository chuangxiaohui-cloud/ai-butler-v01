"""Convert a .doc/.docx file to PDF via Word COM, with pure-python fallback.

优先 Word COM（格式保真）；Word/WPS COM 不可用时回退 python-docx + reportlab
文本保真转 PDF（段落/标题/表格网格，CJK 用 STSong-Light，样式简化为字号/粗体，多页分页）。
"""

import json
import sys

sys.stdout.reconfigure(encoding="utf-8")


def convert_via_com(src, out):
    import win32com.client as win32

    app = win32.Dispatch("Word.Application")
    app.Visible = False
    app.DisplayAlerts = 0
    doc = None
    try:
        doc = app.Documents.Open(src, ReadOnly=True)
        doc.ExportAsFixedFormat(
            OutputFileName=out,
            ExportFormat=17,
            OpenAfterExport=False,
        )
        return "word"
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


def convert_via_reportlab(src, out):
    """文本保真转 PDF：段落（标题字号放大）＋表格网格；CJK 经 STSong-Light。"""
    import docx
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfgen import canvas

    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    document = docx.Document(src)
    page_w, page_h = A4
    margin = 18 * mm
    usable = page_w - 2 * margin

    c = canvas.Canvas(out, pagesize=A4)
    y = page_h - margin

    def new_page():
        nonlocal y
        c.showPage()
        y = page_h - margin

    def draw_text(text, size, bold):
        nonlocal y
        c.setFont("STSong-Light", size)
        if bold:
            c.setFillColorRGB(0.1, 0.1, 0.1)
        else:
            c.setFillColorRGB(0, 0, 0)
        while text:
            # 按可用宽度折行（CJK 逐字，ASCII 逐词）
            width = pdfmetrics.stringWidth(text, "STSong-Light", size)
            if width <= usable:
                chunk, text = text, ""
            else:
                cut = max(1, int(len(text) * usable / width))
                while cut < len(text) and pdfmetrics.stringWidth(text[:cut], "STSong-Light", size) > usable:
                    cut -= 1
                if cut >= len(text):
                    cut = len(text) - 1
                chunk, text = text[:cut], text[cut:]
            if y < margin:
                new_page()
            c.drawString(margin, y, chunk)
            y -= size * 1.6

    for para in document.paragraphs:
        text = para.text.strip()
        if not text:
            y -= 3
            continue
        name = para.style.name or ""
        if name.startswith("Heading 1"):
            draw_text(text, 16, True)
        elif name.startswith("Heading"):
            draw_text(text, 13, True)
        else:
            draw_text(text, 11, False)
        y -= 4

    for table in document.tables:
        if not table.rows:
            continue
        col_w = usable / max(len(table.columns), 1)
        for row in table.rows:
            cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
            row_h = 10
            if y < margin + row_h:
                new_page()
            for i, cell_text in enumerate(cells):
                c.setFont("STSong-Light", 9)
                c.rect(margin + i * col_w, y - 2, col_w, row_h + 4)
                c.drawString(margin + i * col_w + 2, y + 2, cell_text[: int(col_w / 3)])
            y -= row_h + 4
    c.showPage()
    c.save()
    return "reportlab"


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "usage: office_docx_to_pdf.py <input> <output.pdf>"}))
        sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    try:
        return print(json.dumps({"ok": True, "path": out, "method": convert_via_com(src, out)}, ensure_ascii=False))
    except Exception as exc:
        try:
            method = convert_via_reportlab(src, out)
            print(json.dumps({
                "ok": True,
                "path": out,
                "method": method,
                "warning": "Word COM 不可用，已用 python-docx+reportlab 文本保真转换（样式简化）",
            }, ensure_ascii=False))
            return 0
        except Exception as exc2:
            print(json.dumps({
                "ok": False,
                "error": f"docx→PDF 失败：Word COM 不可用（{exc}）；纯 python 兜底也失败（{exc2}）",
            }, ensure_ascii=False))
            sys.exit(1)


if __name__ == "__main__":
    main()
