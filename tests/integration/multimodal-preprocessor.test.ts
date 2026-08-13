import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  maybeFastDescribe,
  preprocessUserMessage,
  toDataUrl,
} from '../../src/agent/multimodal-preprocessor.js';
import type { SkillDeps } from '../../src/skills/deps.js';
import { fakePng } from './fixtures/fake-files.js';
import { createMockVLM } from './fixtures/mock-vlm.js';

test('INT-005：传图+纯文字问题 → 零 VLM 调用', async () => {
  const { client, calls } = createMockVLM();
  const deps: SkillDeps = { callVLM: client };
  const processed = preprocessUserMessage('今天天气怎么样', [fakePng()]);
  const desc = await maybeFastDescribe(processed, false, deps);
  assert.equal(desc, undefined);
  assert.equal(calls.length, 0);
});

test('preprocess：图片只产轻量信号，不解内容', async () => {
  const processed = preprocessUserMessage('这是什么', [fakePng('shot.png')]);
  assert.equal(processed.attachmentSignals[0].type, 'image');
  assert.equal(processed.attachmentSignals[0].fileName, 'shot.png');
  assert.equal(processed.rawFiles.length, 1);
});

test('maybeFastDescribe：意图模糊时调用 VLM 并返回 data URL 描述', async () => {
  const { client, calls } = createMockVLM({ reply: '截图：对话界面' });
  const deps: SkillDeps = { callVLM: client };
  const processed = preprocessUserMessage('这个图是什么', [fakePng()]);
  const desc = await maybeFastDescribe(processed, true, deps);
  assert.equal(desc, '截图：对话界面');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].hasImage, true);
});

test('maybeFastDescribe：VLM 失败静默降级', async () => {
  const deps: SkillDeps = {
    callVLM: async () => {
      throw new Error('vlm down');
    },
  };
  const processed = preprocessUserMessage('这个图是什么', [fakePng()]);
  const desc = await maybeFastDescribe(processed, true, deps);
  assert.equal(desc, undefined);
});

test('toDataUrl：输出 data URL 契约', async () => {
  const url = await toDataUrl(fakePng('shot.png'));
  assert.ok(url.startsWith('data:image/png;base64,'));
});
