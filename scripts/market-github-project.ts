#!/usr/bin/env node
/**
 * E259：市场 Skill github-project 包装（E251 @input 文件通道）
 * 用法：npm run market:github:project -- <input.txt>
 * input.txt 内容 = 用户 query（GitHub 仓库链接或 owner/repo）：
 * L1 抓取（GitHub API 元数据 + raw README/manifest + Release/提交/贡献者）
 * → X.6 契约 → 结构化兜底回答（含 health_score + evidence）。
 * 深度 LLM 合成走主问答链路（npm run dev）；本市场通道默认秒级结构化解读，
 * 设置 MARKET_GH_ENABLE_LLM=1 可显式启用 LLM 合成（注意沙箱步骤 60s 上限）。
 * 单请求超时默认 6s（降级链 raw 候选多，市场步骤 [P-40] 60s 预算内可控），
 * 可用 MARKET_GH_TIMEOUT_MS 覆盖（弱网环境收紧避免步骤超时）。
 * 成功输出可读 answer（L1 结构化解读）；失败输出 JSON 错误；exit 1。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runGithubProjectCommand } from '../src/skills/market/github-project.js';
import { createGithubApiCache } from '../src/skills/github-reader/cache.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:github:project -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const enableLlm = process.env.MARKET_GH_ENABLE_LLM === '1';
    const timeoutMs = Number(process.env.MARKET_GH_TIMEOUT_MS ?? '6000');
    // E290：市场通道接入 E284 GitHub API 缓存（与 main/gateway/im 共用仓库根 data/ 同一份 DB；GITHUB_CACHE_DB_PATH 可覆盖）
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    process.env.GITHUB_CACHE_DB_PATH ??= join(repoRoot, 'data', 'github-api-cache.db');
    const httpCache = createGithubApiCache();
    const result = await runGithubProjectCommand(inputText, {
      ...(enableLlm ? {} : { complete: undefined }),
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 6000,
      httpCache,
    });
    const text = result.ok && result.answer ? result.answer : JSON.stringify(result, null, 2);
    console.log(text);
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();

