/**
 * E260：市场 Skill 高频办公模板（月度汇报 / 会议纪要）
 * 复用 E257 docx-write 的 writeDocx 底座：模板文本 → 沙箱 .txt → office_docx_write.py → .docx。
 * 用户文本只经 E251 input.txt 注入，不进命令行。
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { writeDocx, type RunPythonFn } from './file-readers.js';

export interface TemplateDocxSummary {
  ok: boolean;
  outputPath?: string;
  template?: string;
  error?: string;
}

/** 今日日期（YYYY年M月D日） */
export function todayLabel(now = new Date()): string {
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

/** 月度汇报模板：标题=YYYY年M月，五章节 */
export function buildMonthlyReport(title: string, dateLabel: string): string {
  const lines = [
    `# ${title}（${dateLabel}）`,
    '',
    '## 本月概述',
    '',
    '## 关键成果',
    '',
    '## 数据与指标',
    '',
    '## 风险与问题',
    '',
    '## 下月计划',
    '',
  ];
  return lines.join('\n');
}

/** 会议纪要模板：标题=主题（日期），五章节 */
export function buildMeetingMinutes(title: string, dateLabel: string): string {
  const lines = [
    `# ${title}（${dateLabel}）`,
    '',
    '## 会议信息',
    '- 时间：',
    '- 地点：',
    '- 参会人：',
    '- 主持人：',
    '',
    '## 议题',
    '',
    '## 讨论记录',
    '',
    '## 决议与行动项',
    '',
    '## 待办与负责人',
    '',
  ];
  return lines.join('\n');
}

/** 季度标签：YYYY年第N季度（按日期月份推算） */
export function quarterLabel(now = new Date()): string {
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}年第${quarter}季度`;
}

/** 季度汇报模板：标题=季度标签，五章节 */
export function buildQuarterlyReport(title: string, dateLabel: string): string {
  const lines = [
    `# ${title}（${dateLabel}）`,
    '',
    '## 季度概述',
    '',
    '## 关键成果',
    '',
    '## 数据与指标',
    '',
    '## 风险与问题',
    '',
    '## 下季度计划',
    '',
  ];
  return lines.join('\n');
}

/** 年度总结模板：标题=年份，五章节 */
export function buildAnnualSummary(title: string, dateLabel: string): string {
  const lines = [
    `# ${title}（${dateLabel}）`,
    '',
    '## 年度概述',
    '',
    '## 重大成果',
    '',
    '## 关键数据',
    '',
    '## 经验与风险',
    '',
    '## 来年展望',
    '',
  ];
  return lines.join('\n');
}

/** 报价单模板：标题=主题（日期），四章节 */
export function buildQuotation(title: string, dateLabel: string): string {
  const lines = [
    `# ${title}（${dateLabel}）`,
    '',
    '## 报价信息',
    '- 客户：',
    '- 报价日期：',
    '- 有效期至：',
    '',
    '## 报价明细',
    '- 编号：1',
    '- 品名：',
    '- 规格：',
    '- 数量：',
    '- 单价：',
    '- 金额：',
    '',
    '## 商务条款',
    '',
    '## 备注',
    '',
  ];
  return lines.join('\n');
}

/** 采购申请模板：标题=主题（日期），五章节 */
export function buildPurchaseRequest(title: string, dateLabel: string): string {
  const lines = [
    `# ${title}（${dateLabel}）`,
    '',
    '## 申请信息',
    '- 申请人：',
    '- 部门：',
    '- 申请日期：',
    '',
    '## 采购明细',
    '- 编号：1',
    '- 品名：',
    '- 规格：',
    '- 数量：',
    '- 用途：',
    '',
    '## 预算与供应商',
    '- 预算金额：',
    '- 建议供应商：',
    '',
    '## 审批意见',
    '- 审批人：',
    '- 审批意见：',
    '',
    '## 备注',
    '',
  ];
  return lines.join('\n');
}

/** 会议邀请函模板：标题=主题（日期），四章节 */
export function buildMeetingInvitation(title: string, dateLabel: string): string {
  const lines = [
    `# ${title}（${dateLabel}）`,
    '',
    '## 会议信息',
    '- 时间：',
    '- 地点：',
    '- 参会人：',
    '- 议题：',
    '',
    '## 议程安排',
    '',
    '## 参会确认',
    '- 请于：',
    '- 确认方式：',
    '',
    '## 备注',
    '',
  ];
  return lines.join('\n');
}

/** 通知公告模板：标题=主题（日期），五章节 */
export function buildNoticeAnnouncement(title: string, dateLabel: string): string {
  const lines = [
    `# ${title}（${dateLabel}）`,
    '',
    '## 通知对象',
    '',
    '## 通知事项',
    '',
    '## 时间与地点',
    '- 时间：',
    '- 地点：',
    '',
    '## 注意事项',
    '',
    '## 落款',
    '- 发布单位：',
    '- 发布日期：',
    '',
  ];
  return lines.join('\n');
}

/** PRD 模板：标题=主题（日期），六章节 + 证据链（§2.1 产品经理「写 PRD」+ §9.1 可验证证据链） */
export function buildPrdTemplate(title: string, dateLabel: string): string {
  const lines = [
    `# ${title}（${dateLabel}）`,
    '',
    '## 背景与目标',
    '',
    '## 用户与场景',
    '',
    '## 功能需求',
    '',
    '## 非功能需求',
    '',
    '## 验收标准',
    '',
    '## 里程碑与排期',
    '',
    '## 证据链',
    '> §9.1 可验证证据链：每个结论必须带出处（[Evidence: URL/Path]），硬证据标 [hard]（官方文档/厂商页），软证据标 [soft]（社区/二手来源）。',
    '- [背景与目标] [Evidence: ]（[hard]/[soft]）',
    '- [用户与场景] [Evidence: ]（[hard]/[soft]）',
    '- [功能需求] [Evidence: ]（[hard]/[soft]）',
    '- [非功能需求] [Evidence: ]（[hard]/[soft]）',
    '- [验收标准] [Evidence: ]（[hard]/[soft]）',
    '',
  ];
  return lines.join('\n');
}

/**
 * 用户故事模板：Markdown + YAML Frontmatter（§2.1 产品经理拆解用户故事，五角色审阅 P1 缺口2）
 * 本地任务文件 schema（如 tasks/user_story_001.md），供项目经理 project-writer 直接读取：
 * frontmatter 元数据（id/title/status/priority/type/product/created_at/epic）+ 用户故事/AC/任务拆解/证据链。
 */
export function buildUserStory(title: string, dateLabel: string): string {
  const lines = [
    '---',
    'id: user_story_001',
    `title: ${title}`,
    'status: todo',
    'priority: P0',
    'type: user_story',
    'product: ',
    `created_at: ${dateLabel}`,
    'epic: ',
    '---',
    '',
    `# ${title}`,
    '',
    '## 用户故事',
    '作为<角色>，我想要<功能>，以便<价值>。',
    '',
    '## 验收标准（AC）',
    '- [ ] AC1：',
    '- [ ] AC2：',
    '',
    '## 任务拆解（供项目经理读取）',
    '- [ ] ',
    '- [ ] ',
    '',
    '## 证据链',
    '> §9.1 可验证证据链：每个结论必须带出处（[Evidence: URL/Path]），硬证据标 [hard]，软证据标 [soft]。',
    '- [需求来源] [Evidence: ]（[hard]/[soft]）',
    '- [竞品参考] [Evidence: ]（[hard]/[soft]）',
    '',
  ];
  return lines.join('\n');
}

/**
 * 里程碑复盘模板：Markdown + YAML Frontmatter（§2.1 项目经理「里程碑复盘」——五角色审阅 P1 缺口1）
 * 自动触发条件：plan-validation 检测到里程碑全部子任务状态为 done/已完成 时触发，
 * 生成 milestone_review.md 并存入 L2 项目记忆（§8.1.1 / §11.3 秘书日报关联）。
 */
export function buildMilestoneReview(title: string, dateLabel: string): string {
  const lines = [
    '---',
    'id: milestone_review_001',
    'type: milestone_review',
    'project: ',
    `milestone: ${title}`,
    'status: done',
    `created_at: ${dateLabel}`,
    '---',
    '',
    `# ${title} 里程碑复盘（${dateLabel}）`,
    '',
    '## 里程碑信息',
    '- 所属项目：',
    '- 里程碑：',
    '- 复盘日期：',
    '- 触发方式：自动触发（plan-validation 检测到全部子任务 Done）',
    '',
    '## 完成情况',
    '- [ ] <子任务1>',
    '- [ ] <子任务2>',
    '',
    '## 验收结果',
    '- [ ] 验收项1：',
    '- [ ] 验收项2：',
    '',
    '## 问题与风险',
    '',
    '## 经验沉淀（L2 项目记忆）',
    '',
    '## 后续行动',
    '',
  ];
  return lines.join('\n');
}

export type ContractFormat = 'c-header' | 'json-schema';

/** 契约标识宏前缀：标题转大写安全 token（非 ASCII 剥离后兜底 CONTRACT） */
export function contractMacroToken(title: string): string {
  const slug = title.replace(/[^A-Za-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return (slug || 'CONTRACT').toUpperCase();
}

/**
 * 接口契约模板（机器可读）：§2.1 系统架构师「接口契约」——五角色审阅 P1 缺口1
 * c-header：C 头文件（.h），供 Keil/MDK 编译与子 Agent 按头文件校验实现；
 * json-schema：JSON Schema（draft-07），供数据/API 契约校验。
 * 契约是「模块间/跨 Agent 的稳定接口约定」，实现必须与契约一致。
 */
export function buildInterfaceContract(
  title: string,
  dateLabel: string,
  format: ContractFormat = 'c-header',
): string {
  if (format === 'json-schema') {
    return [
      '{',
      '  "$schema": "http://json-schema.org/draft-07/schema#",',
      `  "title": "${title} 接口契约（机器可读）",`,
      '  "version": "1.0.0",',
      '  "type": "object",',
      '  "description": "契约说明：模块间/跨 Agent 稳定接口约定，实现必须与契约一致（§2.1 系统架构师「接口契约」）",',
      '  "properties": {',
      '    "cmd": { "type": "integer", "description": "命令/消息类型" },',
      '    "length": { "type": "integer", "minimum": 0, "description": "负载长度" },',
      '    "payload": { "type": "string", "format": "byte", "description": "负载字节" }',
      '  },',
      '  "required": ["cmd", "length", "payload"]',
      '}',
      '',
    ].join('\n');
  }
  const token = contractMacroToken(title);
  return [
    '/**',
    ` * @file ${token}_CONTRACT.h`,
    ` * @brief 接口契约（机器可读）：${title}`,
    ` * @date ${dateLabel}`,
    ' * 契约说明：模块间/跨 Agent 稳定接口约定；实现必须与本文件一致，',
    ' * 子 Agent 校验时以本文件为唯一权威（§2.1 系统架构师「接口契约」）。',
    ' */',
    `#ifndef __${token}_CONTRACT_H`,
    `#define __${token}_CONTRACT_H`,
    '',
    '#include <stdint.h>',
    '',
    `/* 契约版本 */`,
    `#define ${token}_CONTRACT_VERSION (1u)`,
    '',
    '/* 命令/消息类型 */',
    `#define ${token}_CMD_<X> (0x01u)`,
    '',
    '/* 数据结构 */',
    'typedef struct {',
    '    uint16_t length;',
    '    uint8_t payload[256];',
    `} ${token}Frame_t;`,
    '',
    '/* 接口函数 */',
    `int ${token}_init(void);`,
    `int ${token}_send(const uint8_t *data, uint16_t len);`,
    `int ${token}_recv(uint8_t *buf, uint16_t max_len);`,
    '',
    `#endif /* __${token}_CONTRACT_H */`,
    '',
  ].join('\n');
}

/** 技术选型对比模板：标题=主题（日期），五章节（§2.1 系统架构师「技术选型」） */
export function buildTechSelection(title: string, dateLabel: string): string {
  const lines = [
    `# ${title}（${dateLabel}）`,
    '',
    '## 选型背景',
    '',
    '## 候选方案',
    '- 方案A：',
    '- 方案B：',
    '- 方案C：',
    '',
    '## 对比维度',
    '- 性能：',
    '- 成本：',
    '- 生态：',
    '- 风险：',
    '- 团队熟悉度：',
    '',
    '## 评分与结论',
    '',
    '## 决策记录',
    '- 决策人：',
    '- 决策日期：',
    '- 备选再评估条件：',
    '',
  ];
  return lines.join('\n');
}

/** 模板 → docx：模板文本写临时 .txt（输出同目录）后调用 writeDocx（run 可注入便于测试） */
export async function writeTemplateDocx(
  templateText: string,
  outputDocx: string,
  run?: RunPythonFn,
): Promise<TemplateDocxSummary> {
  const txtPath = join(dirname(outputDocx), `${outputDocx.split(/[\\/]/).pop()?.replace(/\.docx$/i, '') ?? 'template'}-模板.txt`);
  try {
    writeFileSync(txtPath, templateText, 'utf-8');
  } catch (err) {
    return { ok: false, error: `写入模板文件失败：${err instanceof Error ? err.message : String(err)}` };
  }
  const summary = await writeDocx(txtPath, outputDocx, run);
  return { ok: summary.ok, outputPath: summary.outputPath, template: summary.ok ? templateText : undefined, error: summary.error };
}
