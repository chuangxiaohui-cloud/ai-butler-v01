import assert from 'node:assert/strict';
import test from 'node:test';

import { AnswerPostprocessRuntime } from './answer-postprocess.js';

test('answer-postprocess: 规则按注册顺序执行并记录实际生效 Skill', () => {
  const runtime = new AnswerPostprocessRuntime([
    { name: 'prefix', apply: (answer) => `结论：${answer}` },
    { name: 'suffix', apply: (answer) => `${answer}\n依据见证据。` },
  ]);
  assert.deepEqual(runtime.apply('先检查电源。', { query: '怎么排查', userId: 'u1' }), {
    answer: '结论：先检查电源。\n依据见证据。',
    appliedSkillNames: ['prefix', 'suffix'],
  });
});

test('answer-postprocess: 异常、空输出与未改动规则不破坏回答', () => {
  const runtime = new AnswerPostprocessRuntime([
    { name: 'throws', apply: () => { throw new Error('boom'); } },
    { name: 'empty', apply: () => '  ' },
    { name: 'same', apply: (answer) => answer },
  ]);
  assert.deepEqual(runtime.apply('原回答', { query: '问题', userId: 'u1' }), {
    answer: '原回答',
    appliedSkillNames: [],
  });
});
