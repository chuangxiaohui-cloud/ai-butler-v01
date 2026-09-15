import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { PARAMS } from '../../config/params.js';
import type { RawFileLike, SkillDeps } from '../deps.js';
import type { SkillInput } from '../registry.js';
import { createColorRecognitionSkill } from './index.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function pngFile(name = 'color.png'): RawFileLike {
  return {
    name,
    type: 'image/png',
    size: PNG.length,
    arrayBuffer: async () =>
      PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength) as ArrayBuffer,
  };
}

function input(query: string, rawFiles: RawFileLike[] = []): SkillInput {
  return { query, attachmentSignals: [], rawFiles, memory: null };
}

test('color-recognition: 无图片附件返回 need_image 兜底 0.2', async () => {
  const skill = createColorRecognitionSkill();
  const out = await skill.execute(input('这是什么颜色？'), { callVLM: async () => '' });
  assert.equal(out.confidence, 0.2);
  const result = out.result as { error?: string };
  assert.equal(result.error, 'need_image');
});

test('color-recognition: 主色/调色板路径按 [P-152] 预算调 VLM 并解析 JSON', async () => {
  const calls: Array<{ maxTokens?: number }> = [];
  const deps: SkillDeps = {
    callVLM: async (_input, options) => {
      calls.push(options ?? {});
      return '{"colors":[{"name":"蓝色","hex":"#005BAC"}]}';
    },
  };
  const skill = createColorRecognitionSkill();
  const out = await skill.execute(input('提取这张图片的主色', [pngFile()]), deps);
  assert.equal(out.confidence, 0.85);
  const result = out.result as { semantic?: string[]; palette?: Array<{ hex: string }> };
  assert.deepEqual(result.semantic, ['蓝色']);
  assert.equal(result.palette?.[0]?.hex, '#005BAC');
  assert.equal(calls[0].maxTokens, PARAMS.vlmImageMaxTokens, '必须按 [P-152] 预算调用');
});

test('color-recognition: 语义色名路径按 [P-152] 预算调 VLM 并解析色名', async () => {
  const calls: Array<{ maxTokens?: number }> = [];
  const deps: SkillDeps = {
    callVLM: async (_input, options) => {
      calls.push(options ?? {});
      return '图片以蓝色、白色为主色调。';
    },
  };
  const skill = createColorRecognitionSkill();
  const out = await skill.execute(input('这张图是什么颜色', [pngFile()]), deps);
  assert.equal(out.confidence, 0.85);
  const result = out.result as { semantic?: string[] };
  assert.ok(result.semantic?.includes('蓝'), JSON.stringify(result));
  assert.ok(result.semantic?.includes('白'), JSON.stringify(result));
  assert.equal(calls[0].maxTokens, PARAMS.vlmImageMaxTokens, '必须按 [P-152] 预算调用');
});
