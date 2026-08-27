#!/usr/bin/env node
/**
 * E257：市场 Skill pptx-create 包装（E251 @input 文件通道）
 * 用法：npm run market:pptx:create -- <input.txt>
 * input.txt 内容 = 用户 query：提取标题（触发词后文本，≤20 字）与词条（按 、，；;/换行 拆分），
 * 生成三页汇报骨架（项目概述/核心进展/后续计划），输出沙箱 <标题>汇报.pptx；失败 exit 1。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createPptx } from '../src/skills/market/file-readers.js';

function splitItems(text: string): string[] {
  return text
    .split(/[、，,;；/\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function cleanTitle(text: string): string {
  return text
    .replace(/帮我|请|生成|制作|创建|一个|份|汇报|PPT|ppt|幻灯片|关于|的/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .slice(0, 20);
}

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:pptx:create -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const clauses = inputText.split(/[，,、;；/\n]+/);
    const title = cleanTitle(clauses[0] ?? '') || '项目汇报';
    const items = splitItems(clauses.slice(1).join('，')).slice(0, 12);
    const slides = [
      { title: '项目概述', bullets: items.slice(0, 4) },
      { title: '核心进展', bullets: items.slice(4, 8) },
      { title: '后续计划', bullets: items.slice(8, 12) },
    ];
    const outputPptx = join(dirname(inputFile), `${title}-汇报.pptx`);
    const summary = await createPptx(title, slides, outputPptx);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
