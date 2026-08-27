#!/usr/bin/env node
/**
 * E257：市场 Skill docx-write 包装（E251 @input 文件通道）
 * 用法：npm run market:docx:write -- <input.txt>
 * input.txt 内容 = 用户 query：
 * - 含 .txt 路径 → 把该文本排版为 docx；
 * - 否则 → 生成 日报/周报 模板 docx（触发词识别 日报/周报，标题取触发词后文本）。
 * 输出沙箱 <名>.docx；失败 exit 1。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

import { extractFilePath, writeDocx } from '../src/skills/market/file-readers.js';

function today(): string {
  return new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function buildTemplate(title: string, isWeekly: boolean): string {
  const sections = isWeekly
    ? ['本周进展', '数据与图表', '风险与问题', '下周计划']
    : ['今日进展', '遇到的问题', '明日计划', '备注'];
  const lines = [`${title}（${today()}）`, ''];
  for (const section of sections) {
    lines.push(`## ${section}`, '');
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:docx:write -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const txtPath = extractFilePath(inputText);
    if (txtPath && /\.txt$/i.test(txtPath)) {
      const outputDocx = join(dirname(inputFile), `${basename(txtPath, extname(txtPath))}.docx`);
      const summary = await writeDocx(txtPath, outputDocx);
      console.log(JSON.stringify(summary, null, 2));
      process.exit(summary.ok ? 0 : 1);
    }
    const cleaned = inputText
      .replace(/帮我|请|生成|制作|创建|一个|份|模板/g, '')
      .replace(/日报|周报|docx|文档/g, '')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .slice(0, 16);
    const isWeekly = /周报|周计划/.test(inputText);
    const title = cleaned || (isWeekly ? '周报' : '日报');
    const template = buildTemplate(title, isWeekly);
    const templateTxt = join(dirname(inputFile), `${basename(title)}-模板.txt`);
    writeFileSync(templateTxt, template, 'utf-8');
    const outputDocx = join(dirname(inputFile), `${title}-模板.docx`);
    const summary = await writeDocx(templateTxt, outputDocx);
    console.log(JSON.stringify({ ...summary, templateTitle: title, sections: isWeekly ? '周报' : '日报' }, null, 2));
    process.exit(summary.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
