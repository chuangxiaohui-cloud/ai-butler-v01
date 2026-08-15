import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { createContentWriterSkill } from './index.js';

test('content-writer: 生成 PRD 时注入规格先行工作流', async () => {
  const skill = createContentWriterSkill();
  let prompt = '';
  const out = await skill.execute(
    {
      query: '帮我写一份库存管理功能的 PRD',
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
    },
    {
      callVLM: async () => '',
      complete: {
        complete: async (messages) => {
          prompt = messages[0]?.content ?? '';
          return '# 库存管理 PRD\n\n## 目标\n管理库存。';
        },
      },
    },
  );
  const result = out.result as string;
  assert.ok(result.includes('# 库存管理 PRD'));
  assert.ok(result.includes('库存管理'));
  assert.ok(prompt.includes('规格先行'));
  assert.ok(prompt.includes('待确认问题'));
});

test('content-writer: 无 LLM 时诚实提示', async () => {
  const skill = createContentWriterSkill();
  const out = await skill.execute(
    {
      query: '帮我写一份 PRD',
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
    },
    { callVLM: async () => '' },
  );
  const result = out.result as string;
  assert.equal(result, '文本 LLM 未接入，暂时无法生成文档。');
});
