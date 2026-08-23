import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

import type { RawFileLike } from '../skills/deps.js';
import {
  effectiveMime,
  isImageFile,
  preprocessUserMessage,
  toDataUrl,
  tryNormalizeToPng,
} from './multimodal-preprocessor.js';

const RUNTIME_PYTHON =
  process.env.OFFICE_PYTHON ??
  'C:\\Users\\zhxh\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
process.env.OFFICE_PYTHON = RUNTIME_PYTHON;

function pythonHasPillow(): boolean {
  try {
    const out = execFileSync(
      RUNTIME_PYTHON,
      ['-c', "import importlib.util as u; print('1' if u.find_spec('PIL') else '0')"],
      { encoding: 'utf8' },
    ).trim();
    return out === '1';
  } catch {
    return false;
  }
}

const HAS_PILLOW = pythonHasPillow();

function fakeFile(name: string, type: string, bytes: Uint8Array | string): RawFileLike {
  const u8 = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return {
    name,
    type,
    size: u8.byteLength,
    arrayBuffer: async () =>
      u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer,
  };
}

function pythonImageBase64(kind: 'tiff' | 'avif'): string {
  const out = execFileSync(
    RUNTIME_PYTHON,
    [
      '-c',
      `import base64, io
from PIL import Image
img = Image.new('RGB', (16, 16), (200, 30, 60))
buf = io.BytesIO()
img.save(buf, '${kind.toUpperCase()}')
print(base64.b64encode(buf.getvalue()).decode())`,
    ],
    { encoding: 'utf8' },
  ).trim();
  return out;
}

test('multimodal: octet-stream + heic 扩展名识别为图片', () => {
  const processed = preprocessUserMessage('这张图什么颜色', [
    fakeFile('photo.heic', 'application/octet-stream', new Uint8Array(4)),
  ]);
  assert.equal(processed.attachmentSignals[0]?.type, 'image');
});

test('multimodal: type 为空 + avif 扩展名识别为图片', () => {
  const processed = preprocessUserMessage('描述这张图', [
    fakeFile('shot.avif', '', new Uint8Array(4)),
  ]);
  assert.equal(processed.attachmentSignals[0]?.type, 'image');
});

test('multimodal: isImageFile/effectiveMime 扩展名兜底', () => {
  assert.equal(isImageFile({ name: 'a.tiff', type: '' }), true);
  assert.equal(isImageFile({ name: 'a.webp', type: 'application/octet-stream' }), true);
  assert.equal(isImageFile({ name: 'doc.pdf', type: 'application/octet-stream' }), false);
  assert.equal(effectiveMime({ name: 'a.avif', type: 'application/octet-stream' }), 'image/avif');
  assert.equal(effectiveMime({ name: 'a.png', type: 'image/png' }), 'image/png');
  assert.equal(effectiveMime({ name: 'a.weird', type: '' }), 'application/octet-stream');
});

test('multimodal: toDataUrl PNG 原样透传', async () => {
  const url = await toDataUrl(fakeFile('a.png', 'image/png', new Uint8Array([1, 2, 3])));
  assert.ok(url.startsWith('data:image/png;base64,'));
  assert.ok(url.endsWith(Buffer.from([1, 2, 3]).toString('base64')));
});

test('multimodal: TIFF → PNG 归一化', { skip: !HAS_PILLOW }, async () => {
  const bytes = Buffer.from(pythonImageBase64('tiff'), 'base64');
  const url = await toDataUrl(fakeFile('scan.tiff', 'application/octet-stream', bytes));
  assert.ok(url.startsWith('data:image/png;base64,'));
  assert.ok(url.length > 'data:image/png;base64,'.length + 10);
});

test('multimodal: AVIF → PNG 归一化', { skip: !HAS_PILLOW }, async () => {
  const bytes = Buffer.from(pythonImageBase64('avif'), 'base64');
  const url = await toDataUrl(fakeFile('shot.avif', 'application/octet-stream', bytes));
  assert.ok(url.startsWith('data:image/png;base64,'));
});

test('multimodal: HEIC 解码不可用时诚实降级透传', async () => {
  const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  const url = await toDataUrl(fakeFile('photo.heic', 'application/octet-stream', bytes));
  assert.ok(url.startsWith('data:image/heic;base64,'));
});

test('multimodal: 归一化候选回退——首个候选缺失时用下一个 python（P10）', { skip: !HAS_PILLOW }, async () => {
  const bytes = Buffer.from(pythonImageBase64('tiff'), 'base64');
  const file = fakeFile('scan.tiff', 'application/octet-stream', bytes);
  const png = await tryNormalizeToPng(file, bytes, {
    candidates: ['definitely-missing-python-binary-xyz', RUNTIME_PYTHON],
    timeoutMs: 5000,
  });
  assert.ok(png, '候选回退后应得到 PNG');
  assert.ok(png.length > 8);
});

test('multimodal: 总预算耗尽快速返回 null（P10）', async () => {
  const bytes = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  const file = fakeFile('bad.tiff', 'application/octet-stream', bytes);
  const start = Date.now();
  const png = await tryNormalizeToPng(file, bytes, {
    candidates: [[RUNTIME_PYTHON, '-u', '-c', 'import time; time.sleep(60)']],
    timeoutMs: 150,
  });
  assert.equal(png, null);
  assert.ok(Date.now() - start < 3000, '总预算生效，不无限等待');
});
