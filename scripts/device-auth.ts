#!/usr/bin/env node
/**
 * E426：设备白名单 CLI（E411 账本 data/device-auth.jsonl）。
 * 用法：npm run device:auth -- --list
 *       npm run device:auth -- --authorize --device <id> [--label …] [--source user_whitelist]
 *       npm run device:auth -- --revoke --device <id>
 * 禁止 e410_fixture / mcp_fixture / model_candidate / build_approval 作为授权来源。
 */

import { runDeviceAuthCli } from '../src/mcp/device-auth-cli.js';

const outcome = runDeviceAuthCli(process.argv.slice(2));
console.log(JSON.stringify(outcome.output, null, 2));
process.exit(outcome.exit);
