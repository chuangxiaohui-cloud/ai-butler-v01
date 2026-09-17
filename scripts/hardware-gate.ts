#!/usr/bin/env node
/**
 * E429：硬件门禁预检 CLI（只裁决，不烧录/不开串口）。
 * 用法：
 *   npm run hardware:gate -- --action flash --device <id> --path projects/fw/app.bin [--per-flash-confirmed]
 *   npm run hardware:gate -- --action serial_read --device <id> --port COM3 [--no-audit]
 */

import { runHardwareGateCli } from '../src/mcp/hardware-gate-cli.js';

const outcome = runHardwareGateCli(process.argv.slice(2));
console.log(JSON.stringify(outcome.output, null, 2));
process.exit(outcome.exit);
