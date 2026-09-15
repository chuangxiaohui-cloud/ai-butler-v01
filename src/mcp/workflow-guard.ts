/** E401：跨节点自动修订循环总闸，不替代单次工具重试或每次烧录的人工确认。 */

import { PARAMS } from '../config/params.js';

export interface RevisionLoopDecision {
  allowed: boolean;
  completedCycles: number;
  limit: number;
  handoff?: {
    required: true;
    reason: 'revision_cycle_limit_reached';
    requiredEvidence: ['serial_log', 'recent_diff'];
  };
}

/** 在进入下一轮“构建→烧录→验证→修订”前调用；completedCycles 是已经完成的整轮数。 */
export function checkRevisionLoop(completedCycles: number): RevisionLoopDecision {
  if (!Number.isInteger(completedCycles) || completedCycles < 0) {
    throw new TypeError('completedCycles 必须是非负整数');
  }

  const limit = PARAMS.subAgentRevisionCycleLimit;
  if (completedCycles < limit) return { allowed: true, completedCycles, limit };

  return {
    allowed: false,
    completedCycles,
    limit,
    handoff: {
      required: true,
      reason: 'revision_cycle_limit_reached',
      requiredEvidence: ['serial_log', 'recent_diff'],
    },
  };
}
