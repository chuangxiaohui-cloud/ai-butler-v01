import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { listProjectFiles, readHtmlArtifactRaw, readTextFilePreview, readXmindFilePreview } from './files.js';

import { buildXmindBuffer, createNode, type MindNode } from '../skills/pm-xmind/format.js';

/** E346：MindNode 树只比较标题结构，忽略每次生成不同的 id */
function mindShape(node: MindNode | undefined): unknown {
  if (!node) return null;
  const shape: { title: string; children?: unknown[] } = { title: node.title };
  if (node.children.length > 0) shape.children = node.children.map(mindShape);
  return shape;
}

test('files: 只扫描沙箱根目录，跳过 node_modules', () => {
  const dir = mkdtempSync(join(tmpdir(), 'files-'));
  try {
    mkdirSync(join(dir, 'projects', 'p1'), { recursive: true });
    mkdirSync(join(dir, 'outputs'), { recursive: true });
    mkdirSync(join(dir, 'data', 'datasheets'), { recursive: true });
    mkdirSync(join(dir, 'projects', 'node_modules'), { recursive: true });
    writeFileSync(join(dir, 'projects', 'p1', 'a.kicad_sch'), 'x');
    writeFileSync(join(dir, 'outputs', 'preview.html'), '<html></html>');
    writeFileSync(join(dir, 'data', 'datasheets', 'b.pdf'), 'y');
    writeFileSync(join(dir, 'projects', 'node_modules', 'skip.txt'), 'z');
    writeFileSync(join(dir, 'outside.txt'), 'no');

    const files = listProjectFiles(dir, 50, 3);
    const paths = files.map((f) => f.path);
    assert.ok(paths.includes('projects/p1/a.kicad_sch'));
    assert.ok(paths.includes('data/datasheets/b.pdf'));
    assert.ok(paths.includes('outputs/preview.html'));
    assert.ok(!paths.some((p) => p.includes('node_modules')));
    assert.ok(!paths.some((p) => p.includes('outside.txt')));
    assert.equal(files.find((f) => f.path === 'projects/p1/a.kicad_sch')?.kind, '原理图/PCB');
    assert.equal(files.find((f) => f.path === 'outputs/preview.html')?.kind, 'HTML 预览');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('files: 剔除编辑器/Office 临时文件（E335，与 project-watcher 同口径）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'files-tmp-'));
  try {
    mkdirSync(join(dir, 'projects', 'p1'), { recursive: true });
    mkdirSync(join(dir, 'sandbox'), { recursive: true });
    writeFileSync(join(dir, 'projects', 'p1', 'a.kicad_sch'), 'x');
    writeFileSync(join(dir, 'projects', 'p1', '~$a.docx'), 'office temp');
    writeFileSync(join(dir, 'projects', 'p1', 'a.tmp'), 'temp');
    writeFileSync(join(dir, 'projects', 'p1', 'x.swp'), 'vim');
    writeFileSync(join(dir, 'projects', 'p1', '.~lock.b.docx#'), 'lock');
    writeFileSync(join(dir, 'sandbox', 'keep.pdf'), 'y');
    writeFileSync(join(dir, 'sandbox', '~$keep.pdf'), 'temp2');

    const files = listProjectFiles(dir, 50, 3);
    const paths = files.map((f) => f.path);
    assert.ok(paths.includes('projects/p1/a.kicad_sch'));
    assert.ok(paths.includes('sandbox/keep.pdf'));
    assert.ok(!paths.includes('projects/p1/~$a.docx'));
    assert.ok(!paths.includes('projects/p1/a.tmp'));
    assert.ok(!paths.includes('projects/p1/x.swp'));
    assert.ok(!paths.includes('projects/p1/.~lock.b.docx#'));
    assert.ok(!paths.includes('sandbox/~$keep.pdf'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('files: E337 只读预览——文本返回/超长截断/二进制拒绝/路径防护', () => {
  const dir = mkdtempSync(join(tmpdir(), 'files-preview-'));
  try {
    mkdirSync(join(dir, 'projects', 'p1'), { recursive: true });
    mkdirSync(join(dir, 'outputs'), { recursive: true });
    writeFileSync(join(dir, 'projects', 'p1', 'a.kicad_sch'), 'sheet 1\nsheet 2\n');
    writeFileSync(join(dir, 'projects', 'p1', 'long.txt'), 'abcdefghijklmnop');
    writeFileSync(join(dir, 'projects', 'p1', 'empty.md'), '');
    writeFileSync(join(dir, 'outputs', 'binary.bin'), Buffer.from([0x00, 0x01, 0xff]));

    const ok = readTextFilePreview(dir, 'projects/p1/a.kicad_sch', 4096);
    assert.deepEqual(ok, {
      ok: true,
      path: 'projects/p1/a.kicad_sch',
      size: 16,
      preview: 'sheet 1\nsheet 2\n',
      truncated: false,
    });
    const truncated = readTextFilePreview(dir, 'projects/p1/long.txt', 8);
    assert.equal(truncated.ok, true);
    if (truncated.ok) {
      assert.equal(truncated.preview, 'abcdefgh');
      assert.equal(truncated.truncated, true);
      assert.equal(truncated.size, 16);
    }
    const empty = readTextFilePreview(dir, 'projects/p1/empty.md', 8);
    assert.deepEqual(empty, { ok: true, path: 'projects/p1/empty.md', size: 0, preview: '', truncated: false });

    const binary = readTextFilePreview(dir, 'outputs/binary.bin', 4096);
    assert.deepEqual(binary, { ok: false, error: 'binary' });
    const missing = readTextFilePreview(dir, 'projects/p1/nope.txt', 4096);
    assert.deepEqual(missing, { ok: false, error: 'not_found' });
    const dirResult = readTextFilePreview(dir, 'projects/p1', 4096);
    assert.deepEqual(dirResult, { ok: false, error: 'not_file' });

    const bad: string[] = [
      '',
      '../secret.txt',
      'projects/../../secret.txt',
      'a/b.txt',
      '..\\secret.txt',
      '/abs.txt',
      'projects/./a.txt',
    ];
    for (const rel of bad) {
      assert.deepEqual(readTextFilePreview(dir, rel, 4096), { ok: false, error: 'bad_path' }, rel);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('files: E345 .xmind 预览——合法读回大纲/超大拒绝/损坏 415/路径防护', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'files-xmind-'));
  try {
    mkdirSync(join(dir, 'projects', 'p1'), { recursive: true });
    const root = createNode('硬件项目', [
      createNode('系统设计', [createNode('需求分析'), createNode('总体方案')]),
      createNode('硬件设计'),
    ]);
    const buf = await buildXmindBuffer(root);
    const rel = 'projects/p1/plan.xmind';
    writeFileSync(join(dir, 'projects', 'p1', 'plan.xmind'), buf);

    const ok = await readXmindFilePreview(dir, rel, 4096);
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.path, rel);
      assert.equal(ok.size, buf.length);
      assert.equal(ok.preview, '硬件项目\n1 系统设计\n1.1 需求分析\n1.2 总体方案\n2 硬件设计');
      assert.equal(ok.truncated, false);
      assert.deepEqual(mindShape(ok.tree), {
        title: '硬件项目',
        children: [
          { title: '系统设计', children: [{ title: '需求分析' }, { title: '总体方案' }] },
          { title: '硬件设计' },
        ],
      });
    }

    // E348：绝对路径（AI 回复内嵌产物路径）在沙箱根内同样放行，根外仍拒绝
    const okAbs = await readXmindFilePreview(dir, join(dir, 'projects', 'p1', 'plan.xmind'), 4096);
    assert.equal(okAbs.ok, true);
    if (okAbs.ok) {
      assert.equal(okAbs.preview, '硬件项目\n1 系统设计\n1.1 需求分析\n1.2 总体方案\n2 硬件设计');
    }
    assert.deepEqual(
      await readXmindFilePreview(dir, join(dir, 'other', 'x.xmind'), 4096),
      { ok: false, error: 'bad_path' },
    );

    // 超过 maxBytes：zip 需整体解包，不截断展示，直接拒绝
    const tooLarge = await readXmindFilePreview(dir, rel, buf.length - 1);
    assert.deepEqual(tooLarge, { ok: false, error: 'too_large' });

    // 损坏 zip / 非 zip → 不可读
    writeFileSync(join(dir, 'projects', 'p1', 'bad.xmind'), 'not a zip');
    assert.deepEqual(await readXmindFilePreview(dir, 'projects/p1/bad.xmind', 4096), {
      ok: false,
      error: 'bad_xmind',
    });

    // 不存在 → not_found；目录 → not_file；非法路径 → bad_path
    assert.deepEqual(await readXmindFilePreview(dir, 'projects/p1/nope.xmind', 4096), {
      ok: false,
      error: 'not_found',
    });
    assert.deepEqual(await readXmindFilePreview(dir, 'projects/p1', 4096), {
      ok: false,
      error: 'not_file',
    });
    for (const relBad of ['../x.xmind', 'etc/passwd.xmind', '/abs.xmind', 'projects/./a.xmind']) {
      assert.deepEqual(
        await readXmindFilePreview(dir, relBad, 4096),
        { ok: false, error: 'bad_path' },
        relBad,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('files: E354 HTML 整文件只读回读——仅 .html/.htm + 同 preview 防穿越', () => {
  const dir = mkdtempSync(join(tmpdir(), 'files-raw-'));
  try {
    mkdirSync(join(dir, 'outputs'), { recursive: true });
    mkdirSync(join(dir, 'projects', 'p1'), { recursive: true });
    const html = '<html><body>hi</body></html>';
    writeFileSync(join(dir, 'outputs', 'a.html'), html);
    writeFileSync(join(dir, 'outputs', 'b.htm'), '<p>legacy</p>');
    writeFileSync(join(dir, 'outputs', 'c.txt'), 'plain text');

    const ok = readHtmlArtifactRaw(dir, 'outputs/a.html');
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.path, 'outputs/a.html');
      assert.equal(ok.size, html.length);
      assert.equal(ok.buffer.toString('utf8'), html);
    }
    assert.equal(readHtmlArtifactRaw(dir, 'outputs/b.htm').ok, true);

    assert.deepEqual(readHtmlArtifactRaw(dir, 'outputs/c.txt'), { ok: false, error: 'not_html' });
    assert.deepEqual(readHtmlArtifactRaw(dir, 'outputs/missing.html'), { ok: false, error: 'not_found' });
    assert.deepEqual(readHtmlArtifactRaw(dir, 'outputs'), { ok: false, error: 'not_html' });
    writeFileSync(join(dir, 'outputs', 'big.html'), '<html>big</html>');
assert.deepEqual(readHtmlArtifactRaw(dir, 'outputs/big.html', 4), { ok: false, error: 'too_large' });
    for (const rel of ['../a.html', 'etc/a.html', '/abs.html', 'projects/./a.html']) {
      assert.deepEqual(readHtmlArtifactRaw(dir, rel), { ok: false, error: 'bad_path' }, rel);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
