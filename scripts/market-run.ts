#!/usr/bin/env node
/**
 * E243：市场 Skill 可执行 handler CLI（§8.2.3 执行链）
 * 用法：npm run skill:market:run -- <name>   （运行已安装市场 Skill 的 steps+verify）
 *       npm run skill:market:run -- --list   （列出已安装市场 Skill）
 * 执行全程过 §10.2 命令白名单 + §10.1 沙箱 cwd（sandbox/market-skills/<name>），
 * 输出 JSON；ok=false 时退出码为 1（对齐 scripts/im-gate.ts 风格）。
 */

import { MarketSkillRunner } from '../src/skills/market/runner.js';

const arg = process.argv[2]?.toLowerCase() ?? '';

if (arg === '--list' || arg === '-l') {
  const runner = new MarketSkillRunner();
  console.log(JSON.stringify({ installed: runner.listInstalled() }, null, 2));
  process.exit(0);
}

if (!arg || arg.startsWith('-')) {
  console.error('用法：npm run skill:market:run -- <name> | --list');
  process.exit(1);
}

const runner = new MarketSkillRunner();
const outcome = runner.run(arg);
console.log(JSON.stringify(outcome, null, 2));
process.exit(outcome.ok ? 0 : 1);