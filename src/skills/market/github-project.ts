/**
 * E259：市场 Skill GitHub 项目解读（GitHub 通道）
 * 包装 createGithubReaderSkill：L1 结构化抓取（GitHub API + raw README/manifest +
 * Release/提交/贡献者）→ X.6 契约 → 可选 LLM 按《专业审阅协议 §一》合成；
 * 无 LLM / 未配置 Provider 时返回结构化契约兜底。用户文本只经 E251 input.txt 注入。
 */

import { createGithubReaderSkill, type EvidenceEntry, type GithubContract } from '../github-reader/index.js';
import type { SkillDeps } from '../deps.js';
import type { LLMClient } from '../../search/llm.js';
import { createSkillHeavyClient } from '../../search/llm.js';

export interface GithubProjectResult {
  ok: boolean;
  action: 'analyze' | 'no_repo' | 'error';
  answer?: string;
  contract?: GithubContract;
  evidence?: EvidenceEntry[];
  confidence?: number;
  error?: string;
}

export interface GithubProjectOptions {
  /** LLM 合成注入（缺省尝试 createSkillHeavyClient，未配置则结构化契约兜底） */
  complete?: LLMClient;
  /** 测试注入：fetch 实现（透传 createGithubReaderSkill） */
  fetchImpl?: typeof fetch;
  /** 测试注入：API/raw 基址与超时（透传） */
  apiBase?: string;
  rawBase?: string;
  webBase?: string;
  timeoutMs?: number;
}

/** 执行 GitHub 项目解读（包装 github-reader skill 的 execute） */
export async function runGithubProjectCommand(
  text: string,
  opts: GithubProjectOptions = {},
): Promise<GithubProjectResult> {
  const skill = createGithubReaderSkill({
    apiBase: opts.apiBase,
    rawBase: opts.rawBase,
    webBase: opts.webBase,
    timeoutMs: opts.timeoutMs,
    fetchImpl: opts.fetchImpl,
  });
  const complete = Object.prototype.hasOwnProperty.call(opts, 'complete')
    ? opts.complete
    : createSkillHeavyClient();
  const deps: SkillDeps = { callVLM: async () => '', complete } as SkillDeps;
  const input = {
    query: text,
    attachmentSignals: [],
    rawFiles: [],
    memory: null,
  };
  let output;
  try {
    output = await skill.execute(input, deps);
  } catch (err) {
    return {
      ok: false,
      action: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const result = output.result as {
    error?: string;
    answer?: string;
    contract?: GithubContract;
    evidence?: EvidenceEntry[];
    confidence?: number;
  };
  if (result.error === 'no_repo' || !result.contract) {
    return {
      ok: false,
      action: 'no_repo',
      error: result.answer ?? '未识别到 GitHub 仓库链接，请提供 github.com 链接或 owner/repo。',
    };
  }
  return {
    ok: true,
    action: 'analyze',
    answer: result.answer,
    contract: result.contract,
    evidence: result.evidence,
    confidence: result.confidence ?? output.confidence,
  };
}


