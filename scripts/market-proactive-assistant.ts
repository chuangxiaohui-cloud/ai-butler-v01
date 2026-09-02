#!/usr/bin/env node
/**
 * E313：市场 Skill proactive-assistant 包装（E251 @input 文件通道）
 * 用法：npm run market:proactive:assistant -- <input.txt>
 * input.txt 内容 = 用户 query：检测 日期+地点/报销/开会/连续工作≥2h 规则，
 * 命中后在回复末尾附加"建议"（仅建议、不自动执行，§2.3 人类裁决）。
 * 输出建议文本；失败 exit 1。
 */

import { readFileSync } from 'node:fs';

import { formatProactiveSuggestions, proactiveSuggestions } from '../src/skills/market/proactive.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:proactive:assistant -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const suggestions = proactiveSuggestions(inputText);
    const text = formatProactiveSuggestions(suggestions);
    console.log(text || '没有检测到需要主动建议的场景（日期+地点 / 报销 / 开会 / 连续工作≥2h 命中才会建议）。');
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
