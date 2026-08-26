#!/usr/bin/env node
/**
 * E244：仓库白名单 CLI（§11.4 白名单）
 * 用法：npm run repo:whitelist -- --list
 *       npm run repo:whitelist -- --authorize --host github.com|gitee.com --owner <owner> --repo <name>
 *       npm run repo:whitelist -- --revoke --host github.com|gitee.com --owner <owner> --repo <name>
 * 白名单落盘 data/repo-whitelist.jsonl；默认只 push 显式授权过的仓库（E225 骨架约束）。
 */

import { loadEnvFile } from '../src/config/env.js';
import { runRepoWhitelist } from '../src/repo/cli.js';

loadEnvFile();
const outcome = runRepoWhitelist(process.argv.slice(2));
console.log(JSON.stringify(outcome.output, null, 2));
process.exit(outcome.exit);
