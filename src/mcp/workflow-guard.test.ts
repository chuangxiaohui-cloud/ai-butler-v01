import test from 'node:test';
import assert from 'node:assert/strict';

import { PARAMS } from '../config/params.js';
import { checkRevisionLoop } from './workflow-guard.js';

test('跨节点修订轮数未达上限时允许进入下一轮', () => {
  assert.deepEqual(checkRevisionLoop(PARAMS.subAgentRevisionCycleLimit - 1), {
    allowed: true,
    completedCycles: PARAMS.subAgentRevisionCycleLimit - 1,
    limit: PARAMS.subAgentRevisionCycleLimit,
  });
});

test('达到上限时熔断并要求携带串口日志与最近 diff 人工接管', () => {
  const result = checkRevisionLoop(PARAMS.subAgentRevisionCycleLimit);
  assert.equal(result.allowed, false);
  assert.deepEqual(result.handoff?.requiredEvidence, ['serial_log', 'recent_diff']);
});

test('拒绝无效的已完成轮数', () => {
  assert.throws(() => checkRevisionLoop(-1), /非负整数/);
});
