/**
 * 构建前资源准备（E122）
 * 把 gateway 运行所需文件复制到 desktop/resources/gateway：
 * dist、UI 静态产物、生产依赖、.env、Node 可执行文件。
 */

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const desktop = join(root, 'desktop');
const staging = join(desktop, 'resources');
const gatewayStaging = join(staging, 'gateway');

rmSync(staging, { recursive: true, force: true });
mkdirSync(gatewayStaging, { recursive: true });

const entries = [
  [join(root, 'dist'), join(gatewayStaging, 'dist')],
  [join(root, 'ui', 'prototype', 'dist'), join(gatewayStaging, 'ui', 'prototype', 'dist')],
  [join(root, 'node_modules'), join(gatewayStaging, 'node_modules')],
];

for (const [from, to] of entries) {
  if (!existsSync(from)) {
    throw new Error(`缺少打包源目录：${from}`);
  }
  cpSync(from, to, { recursive: true });
}

const envFile = join(root, '.env');
if (existsSync(envFile)) {
  cpSync(envFile, join(gatewayStaging, '.env'));
}

const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
cpSync(process.execPath, join(staging, nodeName));

console.log(`资源已就绪：${staging}`);
console.log(`gateway: ${gatewayStaging}`);
console.log(`node: ${join(staging, nodeName)}`);
