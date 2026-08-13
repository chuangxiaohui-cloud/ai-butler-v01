import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTING_TABLE } from '../../src/agent/routing-table.js';
import { ACTION_TYPES, TARGET_DOMAINS } from '../../src/agent/intent-feature.js';

test('路由表 match 取值必须全部落在枚举内（防漂移兜底）', () => {
  for (const rule of ROUTING_TABLE) {
    const match = rule.match as Record<string, unknown>;
    if (match.actionType !== undefined) {
      assert.ok(
        (ACTION_TYPES as readonly string[]).includes(match.actionType as string),
        `${rule.id}: actionType '${String(match.actionType)}' 不在 ACTION_TYPES`,
      );
    }
    if (match.targetDomain !== undefined) {
      assert.ok(
        (TARGET_DOMAINS as readonly string[]).includes(match.targetDomain as string),
        `${rule.id}: targetDomain '${String(match.targetDomain)}' 不在 TARGET_DOMAINS`,
      );
    }
  }
});
