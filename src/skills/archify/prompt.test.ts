import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { defaultVendorDir } from './render.js';
import {
  ARCHIFY_TYPE_LABEL,
  buildGenerationPrompt,
  buildRepairPrompt,
  buildRescuePrompt,
  buildSemanticRepairPrompt,
  parseModelJson,
} from './prompt.js';

const vendorDir = defaultVendorDir();

test('prompt: E352 生成提示含类型/质量/schema/示例/用户描述', () => {
  for (const type of ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle'] as const) {
    const prompt = buildGenerationPrompt('订单系统画一张系统架构图', type, { vendorDir });
    assert.ok(prompt.includes(ARCHIFY_TYPE_LABEL[type]), type);
    assert.ok(prompt.includes('showcase'), type);
    assert.ok(prompt.includes('"diagram_type"') || prompt.includes('diagram_type'), type);
    assert.ok(prompt.includes('用户描述：'), type);
    assert.ok(prompt.includes('订单系统画一张系统架构图'), type);
  }
});

test('prompt: E352 修复提示携带诊断与上一版候选', () => {
  const candidate = '{"schema_version":1}';
  const prompt = buildRepairPrompt(
    '画一个流程',
    'workflow',
    candidate,
    [
      {
        code: 'layout/constraint',
        severity: 'error',
        message: 'Label 撞组件',
        subject: { id: 'n1' },
        evidence: {},
        supportedFixes: ['labelDy +24'],
      },
    ],
    { vendorDir },
  );
  assert.ok(prompt.includes('layout/constraint'));
  assert.ok(prompt.includes('labelDy +24'));
  assert.ok(prompt.includes(candidate));
});

test('prompt: E352 parseModelJson 剥围栏/think/夹带文字', () => {
  const raw = '先说明一下\n```json\n{"meta":{"title":"t"},"a":1}\n```\n完';
  assert.deepEqual(parseModelJson(raw), { meta: { title: 't' }, a: 1 });
  const think = '<think>我在思考</think>{"x":1}';
  assert.deepEqual(parseModelJson(think), { x: 1 });
  assert.throws(() => parseModelJson('不是 JSON'));
});

test('prompt: E355 L1 短描述也带架构补全与假设/单图型纪律', () => {
  const arch = buildGenerationPrompt('画个订单系统', 'architecture', { vendorDir });
  assert.ok(arch.includes('架构补全与假设（内容层）'), '补全小节');
  assert.ok(arch.includes('以「假设」开头'), '假设纪律');
  assert.ok(arch.includes('只画本提示指定的一种图型'), '单图型纪律');
  assert.ok(arch.includes('API 网关'), '架构常用件展开');
  const wf = buildGenerationPrompt('画个发布流程', 'workflow', { vendorDir });
  assert.ok(wf.includes('构建→测试→发布'), '流程完整闭环');
  assert.ok(arch.includes('资深系统架构师兼 Archify 图表作者'), '角色');
});

test('prompt: E357 架构图单图规模/连线纪律（防密集布局不过 showcase 校验）', () => {
  const arch = buildGenerationPrompt('画个订单系统', 'architecture', { vendorDir });
  assert.ok(arch.includes('单图规模纪律'), '规模纪律小节');
  assert.ok(arch.includes('组件 ≤8、连线 ≤8'), '组件/连线上限');
  assert.ok(arch.includes('留空列/空行当走线通道'), '走线通道');
  assert.ok(arch.includes('同一通道画两条走向相反的线'), '反向双线禁令');
  assert.ok(arch.includes('variant: dashed'), '回程/异步用 dashed');
  assert.ok(arch.includes('可单独成图'), '多余常用件进 cards');
  const wf = buildGenerationPrompt('画个发布流程', 'workflow', { vendorDir });
  assert.ok(wf.includes('构建→测试→发布'), '流程闭环仍在');
});

test('prompt: E363 架构图生成提示带领域分层泳道方法论/两段式节点/8 上限', () => {
  const arch = buildGenerationPrompt('画个订单系统', 'architecture', { vendorDir });
  assert.ok(arch.includes('领域分层方法论'), '领域分层方法论小节');
  assert.ok(arch.includes('层泳道用 boundaries 表达'), '层泳道=region 泳道');
  assert.ok(arch.includes('下游消费者层'), 'Web 领域层候选');
  assert.ok(arch.includes('嵌入式·RTOS'), '嵌入式领域层候选');
  assert.ok(arch.includes('sublabel=实现/选型'), '节点两段式 sublabel');
  assert.ok(arch.includes('动作 + 协议/原语'), '边 label 交互机制');
  assert.ok(arch.includes('组件 ≤8、连线 ≤8'), '规模上限 8');
});

test('prompt: E356 救场提示携带错误与上一版输出', () => {
  const prompt = buildRescuePrompt('画个发布流程', 'workflow', '{broken,"x":1}', "Expected ',' or ']'", { vendorDir });
  assert.ok(prompt.includes("Expected ',' or ']'"));
  assert.ok(prompt.includes('{broken,"x":1}'));
  assert.ok(prompt.includes('重新输出'));
  assert.ok(prompt.includes('不要 Markdown 代码块'));
});

test('prompt: E360 架构图生成提示带拓扑铁律/命名规约；语义修复提示携带问题清单', () => {
  const arch = buildGenerationPrompt('画个订单系统', 'architecture', { vendorDir });
  assert.ok(arch.includes('拓扑铁律'), '拓扑铁律小节');
  assert.ok(arch.includes('严禁 A 服务直连 B 服务的库'), '数据库归属');
  assert.ok(arch.includes('order-svc ↔ order-db'), '服务-库同前缀命名规约');
  assert.ok(arch.includes('异步归服务/MQ'), '异步边不落库');
  assert.ok(arch.includes('叶子检查'), '叶子检查');
  const prompt = buildSemanticRepairPrompt(
    '画个订单系统',
    'architecture',
    '{"a":1}',
    ['订单服务没有连自己的库', '虚线回调指向数据库'],
    { vendorDir },
  );
  assert.ok(prompt.includes('拓扑铁律'));
  assert.ok(prompt.includes('订单服务没有连自己的库'));
  assert.ok(prompt.includes('虚线回调指向数据库'));
  assert.ok(prompt.includes('{"a":1}'));
});
test('prompt: E362 反平行双线铁律 + 多下游错走廊（防同对节点两条反向线）', () => {
  const arch = buildGenerationPrompt('画个订单系统', 'architecture', { vendorDir });
  assert.ok(arch.includes('反平行铁律'), '反平行铁律小节');
  assert.ok(arch.includes('发布事件/支付回调'), '往返语义合并范例');
  assert.ok(arch.includes('禁止保留两条方向互反的连线'), '禁止反平行双线');
  assert.ok(arch.includes('多下游错走廊'), '多下游错走廊纪律');
});
