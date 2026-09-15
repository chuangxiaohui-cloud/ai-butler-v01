import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { PARAMS } from '../../config/params.js';
import type { RawFileLike, SkillDeps } from '../deps.js';
import type { SkillInput } from '../registry.js';
import { createImageAnalysisSkill } from './index.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function pngFile(name = 'shot.png'): RawFileLike {
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

test('image-analysis: 无图片附件返回 need_image 兜底 0.2', async () => {
  const skill = createImageAnalysisSkill();
  const out = await skill.execute(input('分析图片内容？'), { callVLM: async () => '' });
  assert.equal(out.confidence, 0.2);
  const result = out.result as { error?: string };
  assert.equal(result.error, 'need_image');
});

test('image-analysis: 成功路径按 [P-152] 预算调 VLM 并返回描述', async () => {
  const calls: Array<{ maxTokens?: number }> = [];
  const deps: SkillDeps = {
    callVLM: async (_input, options) => {
      calls.push(options ?? {});
      return '图片是 MCU 封面。';
    },
  };
  const skill = createImageAnalysisSkill();
  const out = await skill.execute(input('分析图片内容？', [pngFile()]), deps);
  assert.equal(out.confidence, 0.85);
  const result = out.result as { description?: string };
  assert.equal(result.description, '图片是 MCU 封面。');
  assert.equal(calls[0].maxTokens, PARAMS.vlmImageMaxTokens, '必须按 [P-152] 预算调用');
});

test('image-analysis: VLM 抛错时兜底 0.2 并带原始错误', async () => {
  const deps: SkillDeps = {
    callVLM: async () => {
      throw new Error('VLM HTTP 400: boom');
    },
  };
  const skill = createImageAnalysisSkill();
  const out = await skill.execute(input('分析图片内容？', [pngFile()]), deps);
  assert.equal(out.confidence, 0.2);
  const result = out.result as { error?: string };
  assert.ok(result.error?.includes('VLM HTTP 400'), result.error);
});
