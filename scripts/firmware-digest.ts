#!/usr/bin/env node
/**
 * E428：固件摘要只读 CLI（E411 SHA-256；沙箱路径）。
 * 用法：npm run firmware:digest -- --path projects/fw/app.bin
 * 只读；不烧录、不连接设备。
 */

import { runFirmwareDigestCli } from '../src/mcp/firmware-digest-cli.js';

const outcome = runFirmwareDigestCli(process.argv.slice(2));
console.log(JSON.stringify(outcome.output, null, 2));
process.exit(outcome.exit);
