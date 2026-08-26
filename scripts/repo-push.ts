#!/usr/bin/env node
/**
 * E244：S6 真实推送 CLI（§11.4 GitHub/Gitee）
 * 用法：
 *   npm run repo:push -- --dry-run [--host github.com|gitee.com] [--owner <owner>] [--repo <name>] [--scope project|all]
 *   npm run repo:push -- --yes [--message "..."] [--host ...] [--owner ...] [--repo ...] [--scope ...]
 * 安全：token 仅从环境变量读取（不落盘）；真实推送必须显式 --yes；git 命令逐条过 §10.2 命令白名单；
 *       输出 JSON，失败退出码 1。
 */

import { loadEnvFile } from '../src/config/env.js';
import { runRepoPush } from '../src/repo/cli.js';

loadEnvFile();
const outcome = await runRepoPush(process.argv.slice(2));
console.log(JSON.stringify(outcome.output, null, 2));
process.exit(outcome.exit);
