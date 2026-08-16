#!/usr/bin/env node
/**
 * 导出 Provider Registry 模型目录给 UI（E105）
 * 从当前 .env 解析可用 provider，生成 ui/prototype/public/model-providers.json，
 * UI 模型切换器优先读取该文件，缺失时回落静态列表。
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { buildModelCatalog } from '../src/config/model-catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'ui', 'prototype', 'public', 'model-providers.json');

const ROLE_NOTES: Record<ModelRole, string> = {
  light: '快速',
  medium: '均衡',
  heavy: '旗舰 · 推理',
  vision: '视觉',
};

function main(): void {
  const catalog = buildModelCatalog();
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(catalog, null, 2)}\n`, 'utf-8');
  console.log(`模型目录已导出: ${dest} (${catalog.models.length} 项)`);
}

main();
