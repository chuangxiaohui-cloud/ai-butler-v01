import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as multimodal from '../../src/agent/multimodal-preprocessor.js';
import { preprocessUserMessage, toDataUrl } from '../../src/agent/multimodal-preprocessor.js';
import { fakePng } from './fixtures/fake-files.js';

test('INT-005：多模态预处理零 VLM 成本（D3 后无 maybeFastDescribe 入口）', async () => {
  // D3（架构审计 2026-08-23）：maybeFastDescribe 整条链路无任何调用方，已删除；
  // 预处理只产轻量信号，不再导出任何会调 VLM 的入口。
  assert.equal('maybeFastDescribe' in multimodal, false);
  const processed = preprocessUserMessage('这是什么', [fakePng('shot.png')]);
  assert.equal(processed.attachmentSignals[0].type, 'image');
  assert.equal(processed.rawFiles.length, 1);
});

test('preprocess：图片只产轻量信号，不解内容', async () => {
  const processed = preprocessUserMessage('这是什么', [fakePng('shot.png')]);
  assert.equal(processed.attachmentSignals[0].type, 'image');
  assert.equal(processed.attachmentSignals[0].fileName, 'shot.png');
  assert.equal(processed.rawFiles.length, 1);
});

test('toDataUrl：输出 data URL 契约', async () => {
  const url = await toDataUrl(fakePng('shot.png'));
  assert.ok(url.startsWith('data:image/png;base64,'));
});
