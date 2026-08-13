#!/usr/bin/env node
/**
 * Skill 本地安装（§8.2.3）
 * 用法：
 *   npm run install:skill -- --source ./path/to/skill-package
 *   npm run install:skill -- --name foo-skill --version 0.1.0 --triggers foo,示例
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  buildRegistryInsertion,
  renderSkillSource,
  validateSkillManifest,
} from '../src/skills/install.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function argValue(key: string): string | undefined {
  const inline = args.find((a) => a.startsWith(`${key}=`))?.split('=').slice(1).join('=');
  if (inline !== undefined) return inline;
  const index = args.indexOf(key);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

const name = argValue('--name');
const source = argValue('--source');
const version = argValue('--version');
const triggers = argValue('--triggers')
  ?.split(',')
  .map((t) => t.trim())
  .filter(Boolean);

let manifestInput: unknown;
const sourceManifest = source ? join(source, 'skill.json') : '';
if (sourceManifest && existsSync(sourceManifest)) {
  manifestInput = JSON.parse(readFileSync(sourceManifest, 'utf-8'));
} else {
  manifestInput = { name, version, triggers };
}

const manifest = validateSkillManifest(manifestInput);
const skillDir = join(root, 'src', 'skills', manifest.name);
mkdirSync(skillDir, { recursive: true });
writeFileSync(join(skillDir, 'index.ts'), renderSkillSource(manifest), 'utf-8');

const registryPath = join(root, 'src', 'skills', 'registry.ts');
const registry = readFileSync(registryPath, 'utf-8');
const { updated } = buildRegistryInsertion(manifest, registry);
writeFileSync(registryPath, updated, 'utf-8');

console.log(`已安装 Skill ${manifest.name}@${manifest.version}`);
console.log(`目录: ${skillDir}`);
console.log('已自动注册到 src/skills/registry.ts，请运行 npm run build && npm test 验证。');
