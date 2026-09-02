import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildAnnualSummary,
  buildMeetingInvitation,
  buildMeetingMinutes,
  buildPrdTemplate,
  buildPurchaseRequest,
  buildQuotation,
  buildNoticeAnnouncement,
  buildMonthlyReport,
  buildQuarterlyReport,
  buildInterfaceContract,
  buildMilestoneReview,
  buildTechSelection,
  buildUserStory,
  contractMacroToken,
  quarterLabel,
  todayLabel,
  writeTemplateDocx,
  type TemplateDocxSummary,
} from './templates.js';
import type { PythonRunResult, RunPythonFn } from './file-readers.js';

test('templates: 月度汇报模板结构（标题+五章节）', () => {
  const text = buildMonthlyReport('2026年8月', '2026年8月27日');
  assert.ok(text.includes('# 2026年8月（2026年8月27日）'));
  for (const section of ['本月概述', '关键成果', '数据与指标', '风险与问题', '下月计划']) {
    assert.ok(text.includes(`## ${section}`), `缺少章节：${section}`);
  }
});

test('templates: 会议纪要模板结构（标题+五章节+会议信息字段）', () => {
  const text = buildMeetingMinutes('项目评审会', '2026年8月27日');
  assert.ok(text.includes('# 项目评审会（2026年8月27日）'));
  for (const section of ['会议信息', '议题', '讨论记录', '决议与行动项', '待办与负责人']) {
    assert.ok(text.includes(`## ${section}`), `缺少章节：${section}`);
  }
  for (const field of ['时间', '地点', '参会人', '主持人']) {
    assert.ok(text.includes(`- ${field}：`), `缺少会议信息字段：${field}`);
  }
});

test('templates: 季度汇报模板结构（标题+五章节）', () => {
  const text = buildQuarterlyReport('2026年第3季度', '2026年8月27日');
  assert.ok(text.includes('# 2026年第3季度（2026年8月27日）'));
  for (const section of ['季度概述', '关键成果', '数据与指标', '风险与问题', '下季度计划']) {
    assert.ok(text.includes(`## ${section}`), `缺少章节：${section}`);
  }
});

test('templates: 年度总结模板结构（标题+五章节）', () => {
  const text = buildAnnualSummary('2026年度总结', '2026年8月27日');
  assert.ok(text.includes('# 2026年度总结（2026年8月27日）'));
  for (const section of ['年度概述', '重大成果', '关键数据', '经验与风险', '来年展望']) {
    assert.ok(text.includes(`## ${section}`), `缺少章节：${section}`);
  }
});

test('templates: 会议邀请函模板结构（标题+四章节+会议/确认字段）', () => {
  const text = buildMeetingInvitation('产品评审邀请函', '2026年8月27日');
  assert.ok(text.includes('# 产品评审邀请函（2026年8月27日）'));
  for (const section of ['会议信息', '议程安排', '参会确认', '备注']) {
    assert.ok(text.includes(`## ${section}`), `缺少章节：${section}`);
  }
  for (const field of ['时间', '地点', '参会人', '议题', '请于', '确认方式']) {
    assert.ok(text.includes(`- ${field}：`), `缺少字段：${field}`);
  }
});

test('templates: 通知公告模板结构（标题+五章节+时间地点/落款字段）', () => {
  const text = buildNoticeAnnouncement('放假通知', '2026年8月27日');
  assert.ok(text.includes('# 放假通知（2026年8月27日）'));
  for (const section of ['通知对象', '通知事项', '时间与地点', '注意事项', '落款']) {
    assert.ok(text.includes(`## ${section}`), `缺少章节：${section}`);
  }
  for (const field of ['时间', '地点', '发布单位', '发布日期']) {
    assert.ok(text.includes(`- ${field}：`), `缺少字段：${field}`);
  }
});

test('templates: PRD 模板结构（标题+六章节+证据链，§2.1 产品经理写 PRD + §9.1）', () => {
  const text = buildPrdTemplate('智能家居网关 PRD', '2026年9月1日');
  assert.ok(text.includes('# 智能家居网关 PRD（2026年9月1日）'));
  for (const section of ['背景与目标', '用户与场景', '功能需求', '非功能需求', '验收标准', '里程碑与排期', '证据链']) {
    assert.ok(text.includes(`## ${section}`), `缺少章节：${section}`);
  }
});

test('templates: PRD 证据链强制 [Evidence: URL/Path]（E310）', () => {
  const text = buildPrdTemplate('智能家居网关 PRD', '2026年9月1日');
  assert.match(text, /\[Evidence: URL\/Path\]/);
  assert.ok((text.match(/\[Evidence: \]/g) ?? []).length >= 5, '每个章节应有 Evidence 占位');
  assert.ok(text.includes('[hard]'));
  assert.ok(text.includes('[soft]'));
});

test('templates: 用户故事模板 Markdown + YAML Frontmatter（E310）', () => {
  const text = buildUserStory('网关告警推送', '2026年9月1日');
  assert.ok(text.startsWith('---\nid: user_story_001'));
  for (const key of [
    'title: 网关告警推送',
    'status: todo',
    'priority: P0',
    'type: user_story',
    'created_at: 2026年9月1日',
  ]) {
    assert.ok(text.includes(key), `缺少 frontmatter：${key}`);
  }
  for (const section of ['用户故事', '验收标准（AC）', '任务拆解（供项目经理读取）', '证据链']) {
    assert.ok(text.includes(`## ${section}`), `缺少章节：${section}`);
  }
  assert.ok(text.includes('- [ ] AC1：'));
  assert.ok(text.includes('作为<角色>，我想要<功能>，以便<价值>。'));
});

test('templates: 接口契约 C Header（机器可读，E311）', () => {
  const text = buildInterfaceContract('STM32 BLE 模块', '2026年9月1日');
  assert.ok(text.includes('#ifndef __STM32_BLE_CONTRACT_H'));
  assert.ok(text.includes('#define STM32_BLE_CONTRACT_VERSION (1u)'));
  assert.ok(text.includes('#include <stdint.h>'));
  assert.ok(text.includes('typedef struct {'));
  assert.ok(text.includes('} STM32_BLEFrame_t;'));
  assert.ok(text.includes('int STM32_BLE_init(void);'));
  assert.ok(text.includes('2026年9月1日'));
  assert.ok(text.includes('#endif /* __STM32_BLE_CONTRACT_H */'));
});

test('templates: 接口契约 JSON Schema（机器可读，E311）', () => {
  const text = buildInterfaceContract('设备上报', '2026年9月1日', 'json-schema');
  assert.ok(text.includes('"$schema": "http://json-schema.org/draft-07/schema#"'));
  assert.ok(text.includes('"type": "object"'));
  assert.ok(text.includes('"properties"'));
  assert.ok(text.includes('"required": ["cmd", "length", "payload"]'));
  assert.ok(text.includes('设备上报 接口契约（机器可读）'));
});

test('templates: 契约宏 token 标题转 ASCII 安全标识（E311）', () => {
  assert.equal(contractMacroToken('STM32 vs ESP32'), 'STM32_VS_ESP32');
  assert.equal(contractMacroToken('智能家居网关'), 'CONTRACT');
  assert.equal(contractMacroToken('A-B_C'), 'A_B_C');
});

test('templates: 里程碑复盘模板 Markdown + YAML Frontmatter（E312）', () => {
  const text = buildMilestoneReview('智能网关里程碑', '2026年9月1日');
  assert.ok(text.startsWith('---\nid: milestone_review_001'));
  for (const key of [
    'type: milestone_review',
    'milestone: 智能网关里程碑',
    'status: done',
    'created_at: 2026年9月1日',
  ]) {
    assert.ok(text.includes(key), `缺少 frontmatter：${key}`);
  }
  for (const section of [
    '里程碑信息',
    '完成情况',
    '验收结果',
    '问题与风险',
    '经验沉淀（L2 项目记忆）',
    '后续行动',
  ]) {
    assert.ok(text.includes(`## ${section}`), `缺少章节：${section}`);
  }
  assert.ok(text.includes('触发方式：自动触发（plan-validation 检测到全部子任务 Done）'));
  assert.ok(!text.includes('undefined'));
});

test('templates: 技术选型对比模板结构（标题+五章节+候选/维度/决策字段）', () => {
  const text = buildTechSelection('STM32 vs ESP32', '2026年9月1日');
  assert.ok(text.includes('# STM32 vs ESP32（2026年9月1日）'));
  for (const section of ['选型背景', '候选方案', '对比维度', '评分与结论', '决策记录']) {
    assert.ok(text.includes(`## ${section}`), `缺少章节：${section}`);
  }
  for (const field of ['方案A', '方案B', '方案C', '性能', '成本', '生态', '风险', '团队熟悉度', '决策人', '决策日期', '备选再评估条件']) {
    assert.ok(text.includes(`- ${field}：`), `缺少字段：${field}`);
  }
});

test('templates: PRD/技术选型 标题日期参数化', () => {
  const p = buildPrdTemplate('PRD', '2026年9月1日');
  const t = buildTechSelection('技术选型', '2026年9月1日');
  const u = buildUserStory('用户故事', '2026年9月1日');
  assert.ok(p.startsWith('# PRD（2026年9月1日）'));
  assert.ok(t.startsWith('# 技术选型（2026年9月1日）'));
  assert.ok(u.includes('title: 用户故事'));
  assert.ok(!p.includes('undefined'));
  assert.ok(!t.includes('undefined'));
  assert.ok(!u.includes('undefined'));
});

test('templates: 会议邀请函/通知公告 标题日期参数化', () => {
  const m = buildMeetingInvitation('会议邀请函', '2026年8月27日');
  const n = buildNoticeAnnouncement('通知公告', '2026年8月27日');
  assert.ok(m.startsWith('# 会议邀请函（2026年8月27日）'));
  assert.ok(n.startsWith('# 通知公告（2026年8月27日）'));
  assert.ok(!m.includes('undefined'));
  assert.ok(!n.includes('undefined'));
});

test('templates: 报价单模板结构（标题+四章节+报价字段）', () => {
  const text = buildQuotation('电源模块报价', '2026年8月27日');
  assert.ok(text.includes('# 电源模块报价（2026年8月27日）'));
  for (const section of ['报价信息', '报价明细', '商务条款', '备注']) {
    assert.ok(text.includes(`## ${section}`), `缺少章节：${section}`);
  }
  for (const field of ['客户', '报价日期', '有效期至', '编号', '品名', '规格', '数量', '单价', '金额']) {
    assert.ok(text.includes(`- ${field}：`), `缺少字段：${field}`);
  }
});

test('templates: 采购申请模板结构（标题+五章节+申请/明细字段）', () => {
  const text = buildPurchaseRequest('物料采购申请', '2026年8月27日');
  assert.ok(text.includes('# 物料采购申请（2026年8月27日）'));
  for (const section of ['申请信息', '采购明细', '预算与供应商', '审批意见', '备注']) {
    assert.ok(text.includes(`## ${section}`), `缺少章节：${section}`);
  }
  for (const field of ['申请人', '部门', '申请日期', '编号', '品名', '规格', '数量', '用途', '预算金额', '建议供应商', '审批人', '审批意见']) {
    assert.ok(text.includes(`- ${field}：`), `缺少字段：${field}`);
  }
});

test('templates: 报价单/采购申请 标题日期参数化', () => {
  const q = buildQuotation('报价单', '2026年8月27日');
  const p = buildPurchaseRequest('采购申请', '2026年8月27日');
  assert.ok(q.startsWith('# 报价单（2026年8月27日）'));
  assert.ok(p.startsWith('# 采购申请（2026年8月27日）'));
  assert.ok(!q.includes('undefined'));
  assert.ok(!p.includes('undefined'));
});

test('templates: quarterLabel 推算（8月 → 第3季度）', () => {
  assert.equal(quarterLabel(new Date('2026-08-27T10:00:00+08:00')), '2026年第3季度');
  assert.equal(quarterLabel(new Date('2026-01-05T10:00:00+08:00')), '2026年第1季度');
});test('templates: todayLabel 格式', () => {
  assert.equal(todayLabel(new Date('2026-08-27T10:00:00+08:00')), '2026年8月27日');
});

test('templates: writeTemplateDocx 成功链（注入 fake run）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'template-skill-'));
  try {
    const run: RunPythonFn = async (script, args): Promise<PythonRunResult> => {
      assert.ok(args[0].endsWith('-模板.txt'));
      assert.ok(args[1].endsWith('.docx'));
      const txt = readFileSync(args[0], 'utf-8');
      assert.ok(txt.includes('## 下月计划'));
      return { ok: true, status: 0, stdout: JSON.stringify({ ok: true, path: args[1] }), stderr: '' };
    };
    const output = join(dir, '月度汇报.docx');
    const summary: TemplateDocxSummary = await writeTemplateDocx(
      buildMonthlyReport('2026年8月', todayLabel()),
      output,
      run,
    );
    assert.equal(summary.ok, true);
    assert.equal(summary.outputPath, output);
    assert.ok(summary.template !== undefined && summary.template.includes('## 本月概述'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('templates: writeTemplateDocx 失败归因透出', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'template-skill-fail-'));
  try {
    const run: RunPythonFn = async (): Promise<PythonRunResult> => ({
      ok: false,
      status: 1,
      stdout: '',
      stderr: 'boom',
      error: 'boom',
    });
    const output = join(dir, 'bad.docx');
    const summary = await writeTemplateDocx(buildMonthlyReport('2026年8月', todayLabel()), output, run);
    assert.equal(summary.ok, false);
    assert.ok(summary.error !== undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
