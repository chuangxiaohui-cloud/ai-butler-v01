import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  compareBoms,
  compressImage,
  compressPdf,
  convertDocToPdf,
  convertImage,
  createPptx,
  encryptPdf,
  extractFilePath,
  extractFilePaths,
  mergePdfs,
  ocrTable,
  ocrText,
  parseInputArgs,
  readDocSummary,
  readPdfTextSummary,
  readTableSummary,
  writeDocx,
  type RunPythonFn,
} from './file-readers.js';

test('parseInputArgs: 首行即路径 + 后续行参数（多行输入）', () => {
  const parsed = parseInputArgs('M:\\a\\b.pdf\n关键词A\n关键词B\n');
  assert.equal(parsed.path, 'M:\\a\\b.pdf');
  assert.deepEqual(parsed.args, ['关键词A', '关键词B']);
});

test('parseInputArgs: 单行「路径 关键词」', () => {
  const parsed = parseInputArgs('M:\\a\\b.pdf DM365 LENS');
  assert.equal(parsed.path, 'M:\\a\\b.pdf');
  assert.deepEqual(parsed.args, ['DM365', 'LENS']);
});

test('parseInputArgs: 自然语言 query 含触发词也能提取路径（E243 直连输入）', () => {
  const parsed = parseInputArgs('帮我 PDF 速读 M:\\a\\b.pdf 并找关键词');
  assert.equal(parsed.path, 'M:\\a\\b.pdf');
  assert.deepEqual(parsed.args, ['帮我', 'PDF', '速读', '并找关键词']);
});

test('parseInputArgs: 引号包裹的含空格路径', () => {
  const parsed = parseInputArgs('"M:\\a b\\file.pdf" DM365');
  assert.equal(parsed.path, 'M:\\a b\\file.pdf');
  assert.deepEqual(parsed.args, ['DM365']);
});

test('parseInputArgs: 词数有界（防超长输入）', () => {
  const tokens = ['M:\\x.pdf', ...Array.from({ length: 40 }, (_, i) => `k${i}`)];
  const parsed = parseInputArgs(tokens.join(' '), 5);
  assert.equal(parsed.path, 'M:\\x.pdf');
  assert.equal(parsed.args.length, 5);
});

test('parseInputArgs: 无路径 → 抛错归因', () => {
  assert.throws(() => parseInputArgs('帮我读一下这个文档'), /未找到文件路径/);
});

test('extractFilePath: Windows / UNC / POSIX 形态', () => {
  assert.equal(extractFilePath('看 C:\\x\\y.pdf 内容'), 'C:\\x\\y.pdf');
  assert.equal(extractFilePath('读 M:/x/y.pdf'), 'M:/x/y.pdf');
  assert.equal(extractFilePath('看 \\\\nas\\share\\y.pdf'), '\\\\nas\\share\\y.pdf');
  assert.equal(extractFilePath('看 /home/user/y.pdf'), '/home/user/y.pdf');
  assert.equal(extractFilePath('没有路径'), null);
});

test('readPdfTextSummary: txt 摘要 + 关键词命中（复用 parseDocumentFile）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'file-readers-'));
  try {
    const file = join(dir, 'sample.txt');
    writeFileSync(file, 'hello\nworld', 'utf-8');
    const summary = await readPdfTextSummary(file, ['hello', 'missing']);
    assert.equal(summary.ok, true);
    assert.equal(summary.chars, 11);
    assert.equal(summary.lines, 2);
    assert.equal(summary.preview, 'hello\nworld');
    assert.deepEqual(summary.hits, [
      { keyword: 'hello', found: true },
      { keyword: 'missing', found: false },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readPdfTextSummary: 文件不存在 → ok:false 归因', async () => {
  const summary = await readPdfTextSummary('Z:\\no-such\\file.pdf');
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /ENOENT|no such/i);
});

test('readTableSummary: 注入 fake run 成功链（表头/行数/关键词命中行数）', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.ok(script.includes('office_xls_read.py'));
    assert.deepEqual(args, ['M:\\bom.xls']);
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        headers: ['item', 'qty', 'refdes'],
        rows: [
          ['R1', '2', 'R1,R2'],
          ['C1', '1', 'C1'],
          ['R1', '3', 'R3'],
        ],
      }),
      stderr: '',
    };
  };
  const summary = await readTableSummary('M:\\bom.xls', ['R1', '电阻'], run);
  assert.equal(summary.ok, true);
  assert.equal(summary.rowCount, 3);
  assert.equal(summary.previewRows.length, 3);
  assert.deepEqual(summary.hits, [
    { keyword: 'R1', rows: 2 },
    { keyword: '电阻', rows: 0 },
  ]);
});

test('readTableSummary: python 失败 → ok:false 透出错误', async () => {
  const run: RunPythonFn = async () => ({ ok: false, status: 1, stdout: '', stderr: 'xls 读取失败' });
  const summary = await readTableSummary('M:\\bom.xls', [], run);
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /xls 读取失败/);
});

test('compressPdf: 注入 fake run 成功链（含 max_kb 追加参数）', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.ok(script.includes('office_pdf_compress.py'));
    assert.deepEqual(args, ['M:\\in.pdf', 'M:\\out.pdf', '800']);
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        path: 'M:\\out.pdf',
        pages: 12,
        size_before: 5_000_000,
        size_after: 3_000_000,
        method: 'pymupdf',
      }),
      stderr: '',
    };
  };
  const summary = await compressPdf('M:\\in.pdf', 'M:\\out.pdf', 800, run);
  assert.equal(summary.ok, true);
  assert.equal(summary.outputPath, 'M:\\out.pdf');
  assert.equal(summary.pages, 12);
  assert.equal(summary.sizeBefore, 5_000_000);
  assert.equal(summary.sizeAfter, 3_000_000);
  assert.equal(summary.method, 'pymupdf');
});

test('compressPdf: 无 max_kb 不追加参数；失败透出归因', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.deepEqual(args, ['M:\\in.pdf', 'M:\\out.pdf']);
    return { ok: false, status: 1, stdout: '', stderr: 'PDF 压缩失败：x' };
  };
  const summary = await compressPdf('M:\\in.pdf', 'M:\\out.pdf', null, run);
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /PDF 压缩失败/);
});
test('extractFilePaths: 多路径提取 + 去重保序 + 引号路径剔除', () => {
  const text = '合并 M:\\a\\1.pdf 和 "M:\\b c\\2.pdf" 以及 M:\\a\\1.pdf 与 /home/x/3.pdf';
  const paths = extractFilePaths(text);
  assert.deepEqual(paths, ['M:\\a\\1.pdf', 'M:\\b c\\2.pdf', '/home/x/3.pdf']);
});

test('extractFilePaths: 数量有界', () => {
  const text = Array.from({ length: 6 }, (_, i) => `M:\\x\\${i}.pdf`).join(' ');
  assert.equal(extractFilePaths(text, 3).length, 3);
});

test('mergePdfs: 注入 fake run 成功链（output + files + pages）', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.ok(script.includes('office_pdf_merge.py'));
    assert.deepEqual(args, ['M:\\out.pdf', 'M:\\a.pdf', 'M:\\b.pdf']);
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({ ok: true, path: 'M:\\out.pdf', files: 2, pages: 10 }),
      stderr: '',
    };
  };
  const summary = await mergePdfs(['M:\\a.pdf', 'M:\\b.pdf'], 'M:\\out.pdf', run);
  assert.equal(summary.ok, true);
  assert.equal(summary.outputPath, 'M:\\out.pdf');
  assert.equal(summary.files, 2);
  assert.equal(summary.pages, 10);
});

test('mergePdfs: 输入不足 2 个 → 拒绝归因', async () => {
  const run: RunPythonFn = async () => {
    throw new Error('不应调用 python');
  };
  const summary = await mergePdfs(['M:\\a.pdf'], 'M:\\out.pdf', run);
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /至少需要 2 个/);
});

test('mergePdfs: python 失败 → ok:false 透出', async () => {
  const run: RunPythonFn = async () => ({ ok: false, status: 1, stdout: '', stderr: 'PDF 合并失败：x' });
  const summary = await mergePdfs(['M:\\a.pdf', 'M:\\b.pdf'], 'M:\\out.pdf', run);
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /PDF 合并失败/);
});

test('encryptPdf: 注入 fake run 成功链（含密码参数）', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.ok(script.includes('office_pdf_encrypt.py'));
    assert.deepEqual(args, ['M:\\in.pdf', 'M:\\out.pdf', 'abc123']);
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({ ok: true, path: 'M:\\out.pdf', pages: 6, password: 'abc123' }),
      stderr: '',
    };
  };
  const summary = await encryptPdf('M:\\in.pdf', 'M:\\out.pdf', 'abc123', run);
  assert.equal(summary.ok, true);
  assert.equal(summary.pages, 6);
  assert.equal(summary.password, 'abc123');
});

test('encryptPdf: 无密码时不追加参数；失败透出', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.deepEqual(args, ['M:\\in.pdf', 'M:\\out.pdf']);
    return { ok: false, status: 1, stdout: '', stderr: 'PDF 加密失败：x' };
  };
  const summary = await encryptPdf('M:\\in.pdf', 'M:\\out.pdf', null, run);
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /PDF 加密失败/);
});

test('convertImage: 注入 fake run 成功链（webp）', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.ok(script.includes('office_image_convert.py'));
    assert.deepEqual(args, ['M:\\in.png', 'M:\\out.webp', 'webp']);
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({ ok: true, path: 'M:\\out.webp', format: 'webp', width: 800, height: 600, size: 12345 }),
      stderr: '',
    };
  };
  const summary = await convertImage('M:\\in.png', 'M:\\out.webp', 'webp', run);
  assert.equal(summary.ok, true);
  assert.equal(summary.format, 'webp');
  assert.equal(summary.width, 800);
  assert.equal(summary.height, 600);
});

test('convertImage: 不支持的格式 → 拒绝且不调 python', async () => {
  const run: RunPythonFn = async () => {
    throw new Error('不应调用 python');
  };
  const summary = await convertImage('M:\\in.png', 'M:\\out.xyz', 'xyz', run);
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /不支持的图片格式/);
});


test('ocrTable: 注入 fake run 成功链（--table + 输出 csv）', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.ok(script.includes('office_image_ocr.py'));
    assert.deepEqual(args, ['--table', 'M:\\table.png', 'M:\\out.csv']);
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        rows: 3,
        cols: 4,
        csv: 'a,b,c,d\n1,2,3,4\n',
        grid: [
          ['a', 'b', 'c', 'd'],
          ['1', '2', '3', '4'],
        ],
        warnings: [{ type: 'merge', message: '疑似合并区' }],
      }),
      stderr: '',
    };
  };
  const summary = await ocrTable('M:\\table.png', 'M:\\out.csv', run);
  assert.equal(summary.ok, true);
  assert.equal(summary.rows, 3);
  assert.equal(summary.cols, 4);
  assert.equal(summary.outputPath, 'M:\\out.csv');
  assert.equal(summary.warnings.length, 1);
});

test('ocrTable: 不传输出时不追加参数；python 失败透出归因', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.deepEqual(args, ['--table', 'M:\\table.pdf']);
    return { ok: false, status: 1, stdout: '', stderr: '表格识别失败：x' };
  };
  const summary = await ocrTable('M:\\table.pdf', null, run);
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /表格识别失败/);
});

test('compareBoms: 注入 fake run 成功链（四类差异解析）', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.ok(script.includes('office_bom_compare.py'));
    assert.deepEqual(args, ['M:\\a.xls', 'M:\\b.xlsx']);
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        key_column_a: 'REF.DES.',
        key_column_b: 'REF.DES.',
        rows_a: 398,
        rows_b: 13,
        common: 12,
        only_a_count: 385,
        only_b_count: 1,
        changed_count: 1,
        only_in_a: ['C10', 'C11'],
        only_in_b: ['NEW1'],
        changed: [{ key: 'C1', fields: [{ field: 'VALUE', before: '0.1uF/16V', after: '0.22uF/25V' }] }],
      }),
      stderr: '',
    };
  };
  const summary = await compareBoms('M:\\a.xls', 'M:\\b.xlsx', null, run);
  assert.equal(summary.ok, true);
  assert.equal(summary.common, 12);
  assert.equal(summary.changedCount, 1);
  assert.deepEqual(summary.onlyInB, ['NEW1']);
  assert.equal(summary.changed[0].fields[0].field, 'VALUE');
});

test('compareBoms: key-hint 追加参数；python 失败透出', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.deepEqual(args, ['M:\\a.xls', 'M:\\b.xls', '位号']);
    return { ok: false, status: 1, stdout: '', stderr: 'BOM 对比失败：x' };
  };
  const summary = await compareBoms('M:\\a.xls', 'M:\\b.xls', '位号', run);
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /BOM 对比失败/);
});

test('convertDocToPdf: 注入 fake run 成功链（docx → pdf）', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.ok(script.includes('office_docx_to_pdf.py'));
    assert.deepEqual(args, ['M:\\a.docx', 'M:\\out.pdf']);
    return { ok: true, status: 0, stdout: JSON.stringify({ ok: true, path: 'M:\\out.pdf' }), stderr: '' };
  };
  const summary = await convertDocToPdf('M:\\a.docx', 'M:\\out.pdf', run);
  assert.equal(summary.ok, true);
  assert.equal(summary.outputPath, 'M:\\out.pdf');
});

test('convertDocToPdf: python 失败透出归因', async () => {
  const run: RunPythonFn = async () => ({ ok: false, status: 1, stdout: '', stderr: 'Word→PDF 失败：x' });
  const summary = await convertDocToPdf('M:\\a.docx', 'M:\\out.pdf', run);
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /Word→PDF 失败/);
});

test('readDocSummary: docx 走 python-docx 读取 + 关键词命中', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.ok(script.includes('office_docx_read.py'));
    assert.deepEqual(args, ['M:\\a.docx']);
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({ ok: true, text: 'hello DM365\nworld', chars: 17, lines: 2 }),
      stderr: '',
    };
  };
  const summary = await readDocSummary('M:\\a.docx', ['DM365', 'missing'], run);
  assert.equal(summary.ok, true);
  assert.equal(summary.lines, 2);
  assert.deepEqual(summary.hits, [
    { keyword: 'DM365', found: true },
    { keyword: 'missing', found: false },
  ]);
});

test('readDocSummary: doc 走 Word COM；失败透出归因', async () => {
  const run: RunPythonFn = async (script) => {
    assert.ok(script.includes('office_doc_read.py'));
    return { ok: false, status: 1, stdout: '', stderr: 'doc 读取失败（需要本机 Word）' };
  };
  const summary = await readDocSummary('M:\\old.doc', [], run);
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /doc 读取失败/);
});

test('writeDocx: 注入 fake run 成功链（txt → docx）', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.ok(script.includes('office_docx_write.py'));
    assert.deepEqual(args, ['M:\\a.txt', 'M:\\out.docx']);
    return { ok: true, status: 0, stdout: JSON.stringify({ ok: true, path: 'M:\\out.docx' }), stderr: '' };
  };
  const summary = await writeDocx('M:\\a.txt', 'M:\\out.docx', run);
  assert.equal(summary.ok, true);
  assert.equal(summary.outputPath, 'M:\\out.docx');
});

test('writeDocx: python 失败透出归因', async () => {
  const run: RunPythonFn = async () => ({ ok: false, status: 1, stdout: '', stderr: 'docx 生成失败：x' });
  const summary = await writeDocx('M:\\a.txt', 'M:\\out.docx', run);
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /docx 生成失败/);
});

test('createPptx: 注入 fake run 成功链（规格 JSON → pptx）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'file-readers-pptx-'));
  try {
    let specPath = '';
    const run: RunPythonFn = async (script, args) => {
      assert.ok(script.includes('office_pptx_create.py'));
      assert.equal(args.length, 2);
      specPath = args[0];
      const spec = JSON.parse(readFileSync(specPath, 'utf-8'));
      assert.equal(spec.title, '项目周报');
      assert.equal(spec.slides.length, 2);
      assert.deepEqual(spec.slides[0].bullets, ['进展A']);
      return { ok: true, status: 0, stdout: JSON.stringify({ ok: true, path: args[1] }), stderr: '' };
    };
    const output = join(dir, 'out.pptx');
    const summary = await createPptx(
      '项目周报',
      [
        { title: '本周进展', bullets: ['进展A'] },
        { title: '下周计划', bullets: ['计划B'] },
      ],
      output,
      run,
    );
    assert.equal(summary.ok, true);
    assert.equal(summary.slides, 3);
    // 临时规格文件已清理
    assert.equal(existsSync(specPath), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createPptx: python 失败透出 + 临时规格清理', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'file-readers-pptx-'));
  try {
    let specPath = '';
    const run: RunPythonFn = async (script, args) => {
      specPath = args[0];
      return { ok: false, status: 1, stdout: '', stderr: 'PPT 生成失败：x' };
    };
    const summary = await createPptx('标题', [{ title: '页', bullets: ['b'] }], join(dir, 'out.pptx'), run);
    assert.equal(summary.ok, false);
    assert.match(summary.error ?? '', /PPT 生成失败/);
    assert.equal(existsSync(specPath), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('compressImage: 注入 fake run 成功链（含 max_kb）', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.ok(script.includes('compress_image.py'));
    assert.deepEqual(args, ['M:\\in.png', 'M:\\out.jpg', '100']);
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({ ok: true, path: 'M:\\out.jpg', size: 80000, width: 800, height: 600 }),
      stderr: '',
    };
  };
  const summary = await compressImage('M:\\in.png', 'M:\\out.jpg', 100, run);
  assert.equal(summary.ok, true);
  assert.equal(summary.size, 80000);
  assert.equal(summary.width, 800);
});

test('compressImage: 缺省 max_kb 不追加参数；失败透出', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.deepEqual(args, ['M:\\in.png', 'M:\\out.jpg']);
    return { ok: false, status: 1, stdout: '', stderr: '图片压缩失败：x' };
  };
  const summary = await compressImage('M:\\in.png', 'M:\\out.jpg', null, run);
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /图片压缩失败/);
});

test('ocrText: 注入 fake run 成功链（普通 OCR + 关键词命中 + 输出 txt）', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.ok(script.includes('office_image_ocr.py'));
    assert.deepEqual(args, ['M:\\page.png', 'M:\\out.txt']);
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({ ok: true, text: 'hello DM365 world', chars: 17 }),
      stderr: '',
    };
  };
  const summary = await ocrText('M:\\page.png', 'M:\\out.txt', ['DM365', 'missing'], run);
  assert.equal(summary.ok, true);
  assert.equal(summary.chars, 17);
  assert.deepEqual(summary.hits, [
    { keyword: 'DM365', found: true },
    { keyword: 'missing', found: false },
  ]);
});

test('ocrText: 不传输出不追加参数；python 失败透出', async () => {
  const run: RunPythonFn = async (script, args) => {
    assert.deepEqual(args, ['M:\\page.png']);
    return { ok: false, status: 1, stdout: '', stderr: 'OCR 失败：x' };
  };
  const summary = await ocrText('M:\\page.png', null, [], run);
  assert.equal(summary.ok, false);
  assert.match(summary.error ?? '', /OCR 失败/);
});
