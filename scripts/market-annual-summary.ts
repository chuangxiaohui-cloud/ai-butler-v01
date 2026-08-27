#!/usr/bin/env node
/**
 * E261：市场 Skill annual-summary 包装（E251 @input 文件通道）
 * 用法：npm run market:annual:summary -- <input.txt>
 * input.txt 内容 = 用户 query：生成年度总结模板 docx（标题取触发词后文本，缺省「年度总结」）。
 * 输出沙箱 <标题>-模板.docx；失败 exit 1。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildAnnualSummary, todayLabel, writeTemplateDocx } from '../src/skills/market/templates.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:annual:summary -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const cleaned = inputText
      .replace(/帮我|请|生成|制作|创建|一个|份|模板/g, '')
      .replace(/年度总结|年终总结|年度报告|总结|docx|文档/g, '')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .slice(0, 16);
    const title = cleaned || '年度总结';
    const outputDocx = join(join(inputFile, '..'), `${title}-模板.docx`);
    const summary = await writeTemplateDocx(buildAnnualSummary(title, todayLabel()), outputDocx);
    console.log(JSON.stringify({ ...summary, title, sections: '年度总结五章节' }, null, 2));
    process.exit(summary.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
