import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSkillCandidateDraft } from './skill-candidate-draft.js';
import type { SkillCandidateEntry } from './skill-candidate-store.js';

const ACCEPTED: SkillCandidateEntry = {
  id: 'candidate-1',
  userId: 'u1',
  pattern: 'conclusion_first',
  title: '结论优先回复',
  description: '回复开头先给结论或明确建议。',
  sampleCount: 10,
  latestSample: '结论：应优先检查电源。',
  status: 'accepted',
  createdAt: 1,
  updatedAt: 2,
};

test('skill-candidate-draft: accepted 候选生成稳定只读草案', () => {
  const draft = buildSkillCandidateDraft(ACCEPTED);
  assert.equal(draft.name, 'reply-conclusion-first');
  assert.equal(draft.version, '0.1.0');
  assert.equal(draft.scope, 'answer_postprocess');
  assert.equal(draft.installable, true);
  assert.deepEqual(draft.triggers, ['结论优先回复']);
  assert.deepEqual(draft.permissions, ['none']);
  assert.match(draft.skillMarkdown, /先给结论或明确建议/);
  assert.match(draft.skillMarkdown, /样本数：10/);
});

test('skill-candidate-draft: 非确定性执行模式继续阻断启用', () => {
  const draft = buildSkillCandidateDraft({ ...ACCEPTED, pattern: 'structured_steps' });
  assert.equal(draft.installable, false);
  assert.match(draft.installBlocker ?? '', /不可启用/);
});

test('skill-candidate-draft: 未接受候选拒绝生成草案', () => {
  assert.throws(
    () => buildSkillCandidateDraft({ ...ACCEPTED, status: 'proposed' }),
    /仅 accepted 候选可生成草案/,
  );
});
