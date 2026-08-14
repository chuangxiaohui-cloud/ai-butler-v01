import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { createEngineerSkill } from './index.js';

test('engineer: 有 LLM 时生成代码', async () => {
  const skill = createEngineerSkill();
  const out = await skill.execute(
    {
      query: '实现一个登录接口',
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
    },
    {
      callVLM: async () => '',
      complete: {
        complete: async () => '```ts\nfunction login() {}\n```',
      },
    },
  );
  const result = out.result as { answer: string };
  assert.ok(result.answer.includes('login'));
});

test('engineer: 无 LLM 时诚实提示', async () => {
  const skill = createEngineerSkill();
  const out = await skill.execute(
    {
      query: '实现一个登录接口',
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
    },
    { callVLM: async () => '' },
  );
  const result = out.result as { answer: string };
  assert.ok(result.answer.includes('工程师执行器已就绪'));
});

test('engineer: 生成代码前注入工程工作流约束', async () => {
  const skill = createEngineerSkill();
  let prompt = '';
  const out = await skill.execute(
    {
      query: '实现一个登录接口',
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
    },
    {
      callVLM: async () => '',
      complete: {
        complete: async (messages) => {
          prompt = messages[0]?.content ?? '';
          return '```ts\nfunction login() {}\n```';
        },
      },
    },
  );
  const result = out.result as { answer: string };
  assert.ok(result.answer.includes('login'));
  assert.ok(prompt.includes('工程工作流'));
  assert.ok(prompt.includes('增量实现'));
});
