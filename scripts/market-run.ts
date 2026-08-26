#!/usr/bin/env node
/**
 * E243：市场 Skill 可执行 handler CLI（§8.2.3 执行链）
 * 用法：npm run skill:market:run -- <name>               （运行已安装市场 Skill 的 steps+verify）
 *       npm run skill:market:run -- <name> --query "..." （带输入运行；E251 input:'query' 通道）
 *       npm run skill:market:run -- <name> --yes         （浏览器 Skill：显式放行高风险动作，默认拒绝）
 *       npm run skill:market:run -- --list               （列出已安装市场 Skill）
 * 命令 Skill 全程过 §10.2 命令白名单 + §10.1 沙箱 cwd（sandbox/market-skills/<name>）；
 * 浏览器 Skill（E252）走 runBrowser：域名白名单（manifest domains + 本地授权）+ 动作白名单
 * + SSRF + 高风险审批（--yes 为唯一显式放行途径），输出 JSON；ok=false 时退出码为 1。
 */

import { MarketSkillRunner } from '../src/skills/market/runner.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0]?.toLowerCase() === '--list' || args[0]?.toLowerCase() === '-l') {
    const runner = new MarketSkillRunner();
    console.log(JSON.stringify({ installed: runner.listInstalled() }, null, 2));
    process.exit(0);
  }

  let name: string | undefined;
  let input: string | undefined;
  let yes = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--query') {
      input = args[i + 1] ?? '';
      i += 1;
    } else if (arg === '--yes') {
      yes = true;
    } else if (!arg.startsWith('-')) {
      name = arg;
    }
  }

  if (!name) {
    console.error('用法：npm run skill:market:run -- <name> [--query "<文本>"] [--yes] | --list');
    process.exit(1);
  }

  const probe = new MarketSkillRunner();
  if (probe.isBrowserSkill(name)) {
    const runner = new MarketSkillRunner({ confirmAction: () => yes });
    const outcome = await runner.runBrowser(name, input !== undefined ? { input } : {});
    console.log(JSON.stringify(outcome, null, 2));
    process.exit(outcome.ok ? 0 : 1);
  }

  const runner = new MarketSkillRunner();
  const outcome = runner.run(name, input !== undefined ? { input } : {});
  console.log(JSON.stringify(outcome, null, 2));
  process.exit(outcome.ok ? 0 : 1);
}

void main();