#!/usr/bin/env node
/**
 * E427：硬件门禁审计只读 CLI（E411 账本 data/hardware-audit.jsonl）。
 * 用法：npm run hardware:audit -- [--limit N] [--action flash|serial_read] [--allowed true|false]
 * 只读；不执行硬件动作、不追加审计。
 */

import { runHardwareAuditCli } from '../src/mcp/hardware-audit-cli.js';

const outcome = runHardwareAuditCli(process.argv.slice(2));
console.log(JSON.stringify(outcome.output, null, 2));
process.exit(outcome.exit);
