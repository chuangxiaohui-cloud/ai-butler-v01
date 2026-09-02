import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  classifyEventPriority,
  parseEventsInput,
  renderNotificationDigest,
  type HubEvent,
} from './notification-hub.js';

const base: HubEvent = { role: '项目经理', kind: 'progress', title: '进度更新', detail: 'A 模块完成' };

test('notification-hub: 紧急优先级——老板风险裁决/项目经理阻塞（E314）', () => {
  assert.equal(classifyEventPriority({ ...base, role: '老板', kind: 'risk_decision', title: '请裁决打样费 100 元' }), 'urgent');
  assert.equal(classifyEventPriority({ ...base, role: '项目经理', kind: 'blocking_report', title: 'Keil 编译失败，任务阻塞' }), 'urgent');
});

test('notification-hub: 普通优先级——PRD 完成/选型建议（E314）', () => {
  assert.equal(classifyEventPriority({ ...base, role: '产品经理', kind: 'prd_done', title: 'PRD 已完成' }), 'normal');
  assert.equal(classifyEventPriority({ ...base, role: '系统架构师', kind: 'tech_selection', title: '芯片选型建议' }), 'normal');
});

test('notification-hub: 低优先级——日常进度（E314）', () => {
  assert.equal(classifyEventPriority(base), 'low');
});

test('notification-hub: E315 自动写入事件——escalation 紧急 / low_confidence 普通', () => {
  assert.equal(classifyEventPriority({ ...base, role: '秘书', kind: 'escalation', title: '连续失败升级' }), 'urgent');
  assert.equal(classifyEventPriority({ ...base, role: '秘书', kind: 'low_confidence', title: '低置信答复' }), 'normal');
});

test('notification-hub: E316 角色 Skill 输出事件 → 普通级（用户故事/接口契约）', () => {
  assert.equal(classifyEventPriority({ ...base, role: '产品经理', kind: 'user_story_done', title: '用户故事已生成' }), 'normal');
  assert.equal(classifyEventPriority({ ...base, role: '系统架构师', kind: 'interface_contract', title: '接口契约已生成' }), 'normal');
  assert.equal(classifyEventPriority({ ...base, role: '项目经理', kind: 'milestone_review', title: '里程碑复盘已生成' }), 'normal');
});

test('notification-hub: 摘要按优先级分组渲染（§11.3 秘书日报）', () => {
  const digest = renderNotificationDigest(
    [
      { ...base, role: '老板', kind: 'risk_decision', title: '请裁决', ts: '09:00' },
      { ...base, role: '产品经理', kind: 'prd_done', title: 'PRD 完成' },
      { ...base, role: '项目经理', kind: 'progress', title: '日常进度' },
    ],
    '2026年9月1日',
  );
  assert.ok(digest.startsWith('# 通知汇总（2026年9月1日）'));
  assert.ok(digest.includes('## 🔴 紧急（1）'));
  assert.ok(digest.includes('## 🟡 普通（1）'));
  assert.ok(digest.includes('## 🟢 低（1）'));
  assert.ok(digest.includes('[老板] 请裁决'));
  assert.ok(digest.includes('[产品经理] PRD 完成'));
});

test('notification-hub: 空事件输出占位（E314）', () => {
  const digest = renderNotificationDigest([], '2026年9月1日');
  assert.ok(digest.includes('暂无待处理通知'));
});

test('notification-hub: 输入解析 JSON 数组（E251 @input）', () => {
  const events = parseEventsInput('[{"role":"老板","kind":"risk_decision","title":"请裁决"},{"role":"秘书","kind":"progress","title":"日报"}]');
  assert.equal(events.length, 2);
  assert.equal(events[0].role, '老板');
  assert.deepEqual(parseEventsInput('不是 JSON 文本'), []);
});
