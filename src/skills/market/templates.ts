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

