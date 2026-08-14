import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createColorRecognitionSkill } from '../../src/skills/color-recognition/index.js';
import { toDisplayText } from '../../src/skills/registry.js';
import { fakePng } from './fixtures/fake-files.js';

const skill = createColorRecognitionSkill();

function imageInput(fileName: string) {
  return {
    query: '有哪些颜色',
    attachmentSignals: [
      { type: 'image', mimeType: 'image/png', sizeBytes: 8, fileName },
    ],
    rawFiles: [fakePng(fileName)],
    memory: null,
  };
}

test('INT-003 L1：奥运国旗图返回语义颜色', async () => {
  const out = await skill.execute(
    imageInput('olympic_flags.png'),
    { callVLM: async () => '图中有多国国旗，主要颜色为红、白、蓝、黄、绿。' },
  );
  assert.equal(out.confidence, 0.85);
  const text = toDisplayText(out.result);
  assert.ok(text.includes('红'));
  assert.ok(text.includes('蓝'));
});

test('INT-003 L2：主色调返回有效 HEX', async () => {
  const out = await skill.execute(
    {
      ...imageInput('product_screenshot.png'),
      query: '提取5个主色',
    },
    {
      callVLM: async (input) =>
        input.prompt.includes('JSON')
          ? '{"colors":[{"name":"红色","hex":"#E60012"},{"name":"蓝色","hex":"#005BAC"},{"name":"白色","hex":"#FFFFFF"},{"name":"黄色","hex":"#FFD700"},{"name":"绿色","hex":"#00A650"}]}'
          : '图中有多国国旗，主要颜色为红、白、蓝、黄、绿。',
    },
  );
  const result = out.result as {
    palette?: Array<{ name: string; hex: string }>;
  };
  assert.equal(result.palette?.length, 5);
  assert.ok(result.palette!.every((c) => /^#[0-9A-F]{6}$/.test(c.hex)));
});
