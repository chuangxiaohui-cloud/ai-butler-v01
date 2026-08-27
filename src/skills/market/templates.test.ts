import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildAnnualSummary,
  buildMeetingMinutes,
  buildMonthlyReport,
  buildQuarterlyReport,
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

