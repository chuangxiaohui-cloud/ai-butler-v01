#!/usr/bin/env node
/**
 * E244：push 审计查看 CLI（§11.3/§11.4）
 * 用法：npm run repo:audit -- [--limit N]
 * 读取 data/repo-push-events.jsonl，倒序输出最近 N 条（默认 50）；条目不含 token。
 */

import { loadEnvFile } from '../src/config/env.js';
import { runRepoAudit } from '../src/repo/cli.js';

loadEnvFile();
const outcome = runRepoAudit(process.argv.slice(2));
console.log(JSON.stringify(outcome.output, null, 2));
process.exit(outcome.exit);
