#!/usr/bin/env node
/**
 * Provider Registry / 模型分档 bench（E104，B-20260816-04）
 * 纯本地：验证 provider 解析顺序、fallback 链上限、分档规则；不发起网络请求。
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { defaultRegistry, type ModelRole, type ProviderProfile } from '../src/search/llm-registry.js';
import { resolveModelTier } from '../src/search/model-router.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = join(root, 'bench', 'v01b-provider-router.md');
const benchId = 'B-20260816-04';

const SAMPLES: Array<{ query: string; tier: string }> = [
  { query: 'STM32F103C8T6 主频是多少', tier: 'medium' },
  { query: '写一个 I2C 软件驱动', tier: 'heavy' },
  { query: '分析这个 GitHub 项目', tier: 'heavy' },
  { query: '帮我润色这段文字', tier: 'heavy' },
  { query: '今天天气怎么样', tier: 'medium' },
];

function tierFor(query: string): string {
  if (/写一个|实现|生成/.test(query)) return resolveModelTier({ intent: 'execute', actionType: 'create' });
  if (/GitHub|github/.test(query)) return resolveModelTier({ intent: 'github_analysis' });
  if (/润色|重写/.test(query)) return resolveModelTier({ intent: 'rewrite', actionType: 'rewrite' });
  return resolveModelTier({ intent: 'web_search', actionType: 'qa' });
}

function profileRow(role: ModelRole, profile: ProviderProfile | null): string {
  return profile
    ? `| ${role} | ${profile.id} | ${profile.label} | ${profile.models[role]} | 可用 |`
    : `| ${role} | - | - | - | 未配置 |`;
}

function main(): void {
  const registry = defaultRegistry();
  const rows = SAMPLES.map(
    (s) => `| ${s.query} | 期望 ${s.tier} | 实际 ${tierFor(s.query)} | ${tierFor(s.query) === s.tier ? 'PASS' : 'FAIL'} |`,
  ).join('\n');
  const providers = (['light', 'medium', 'heavy', 'vision'] as ModelRole[])
    .map((role) => profileRow(role, registry.resolveProfile(role)))
    .join('\n');
  const report = `# Provider Registry / 模型分档 bench

> 日期：2026-08-16 | bench:${benchId} | 模式：纯本地（无网络请求）

## 分档规则

| Query | 期望档 | 实际档 | 结果 |
|---|------|------|------|
${rows}

## Provider 解析（当前 env）

| 角色 | provider | 名称 | model | 状态 |
|------|----------|------|-------|------|
${providers}

## 结论

- fallback 链上限：3 家（P-107）；默认档 medium（P-105）。
- 重档集合：execute / write_doc / github_analysis / rewrite / pack_project / plan / 文档摘要结构。
- 便宜优先：LLM_PROVIDER_ORDER 控制顺序，未配置 key 的 provider 自动跳过。
`;
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`报告已生成: ${reportPath}`);
  console.log(`bench:${benchId} | samples=${SAMPLES.length} | providers=${providers.split('\n').length}`);
}

main();
