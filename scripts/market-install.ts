#!/usr/bin/env node
/**
 * E250：市场 Skill 本地安装 CLI（§8.2.3 本地沉淀通道）
 * 用法：npm run skill:market:install -- --source <packageDir> [--yes]
 * --yes：同意该包声明的全部高风险权限（本地包，用户即策展方；缺省默认拒绝，与远程安装同一门禁）。
 * 输出 JSON；ok=false 时退出码为 1。
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { MarketInstaller } from '../src/skills/market/installer.js';

const args = process.argv.slice(2);

function argValue(key: string): string | undefined {
  const inline = args.find((a) => a.startsWith(`${key}=`))?.split('=').slice(1).join('=');
  if (inline !== undefined) return inline;
  const index = args.indexOf(key);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

async function main(): Promise<void> {
  const source = argValue('--source');
  const yes = args.includes('--yes');
  if (!source) {
    console.error('用法：npm run skill:market:install -- --source <packageDir> [--yes]');
    process.exit(1);
  }
  const packageDir = resolve(source);
  if (!existsSync(join(packageDir, 'manifest.json'))) {
    console.error(JSON.stringify({ ok: false, error: `未找到 ${join(packageDir, 'manifest.json')}` }));
    process.exit(1);
  }
  const installer = new MarketInstaller();
  const outcome = await installer.installFromLocalDir(packageDir, (permission) => {
    if (yes) return true;
    console.error(`[拒绝] 高风险权限未确认：${permission}（本地安装可加 --yes 表示同意）`);
    return false;
  });
  console.log(JSON.stringify(outcome, null, 2));
  process.exit(outcome.ok ? 0 : 1);
}

main();