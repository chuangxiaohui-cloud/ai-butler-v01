/**
 * v1.0 S1：深度报告（§4.3.2 长任务首实例）
 * 输入：§6 搜索证据（evidence）+ Stage 5 合成摘要（synthesis，作降级概述来源）
 * 输出：结构化 Markdown 报告（分节生成）+ 证据附录
 * 预算：[P-13] 生成+证据组装总预算（不含内部搜索调用）；超时/失败降级为规则组装，不阻塞主对话。
 * 取消：外部 AbortSignal 生效，取消抛出 DeepReportCancelledError，由调用方转「已取消」应答。
 */

import type { LLMClient } from './llm-client.js';
import { PARAMS } from '../config/params.js';

export interface DeepReportEvidenceItem {
  title: string;
  url: string;
  domain: string;
  score: number;
  type: string;
}

export interface DeepReportOptions {
  llm?: LLMClient | null;
  /** [P-13] 深度报告增量预算（ms），缺省读 PARAMS.deepReportBudgetMs */
  budgetMs?: number;
  /** 外部取消信号（P17 同款透传） */
  signal?: AbortSignal;
  /** 分阶段进度回调：report-outline / report-section-N / report-evidence */
  onStage?: (stage: string) => void;
  /** Stage 5 合成摘要，作无 LLM/降级路径的概述来源 */
  synthesis?: string;
  /** 报告分节数（默认 3，测试可调小） */
  sectionCount?: number;
}

export interface DeepReportResult {
  report: string;
  sections: string[];
  evidenceAppendix: string[];
  elapsedMs: number;
  source: 'llm' | 'fallback';
  timedOut: boolean;
}

export class DeepReportCancelledError extends Error {
  constructor() {
    super('深度报告已取消');
    this.name = 'DeepReportCancelledError';
  }
}

const REPORT_SYSTEM_PROMPT =
  '你是嵌入式电子工程师的深度报告助手。基于提供的搜索结果与证据，输出结构化 Markdown 报告：' +
  '标题 + 分节（每节用 ## 二级标题），正文引用证据来源 URL。只写有依据的结论，不编造。';

const MAX_OUTLINE_TOKENS = 300;
const MAX_SECTION_TOKENS = 900;

export async function generateDeepReport(
  query: string,
  evidence: DeepReportEvidenceItem[],
  opts: DeepReportOptions = {},
): Promise<DeepReportResult> {
  const start = Date.now();
  const budgetMs = opts.budgetMs ?? PARAMS.deepReportBudgetMs;
  const sectionCount = Math.max(1, opts.sectionCount ?? 3);
  const externalSignal = opts.signal;
  const safeStage = (stage: string) => {
    try {
      opts.onStage?.(stage);
    } catch {
      // 进度回调失败不阻塞报告生成
    }
  };

  if (externalSignal?.aborted) throw new DeepReportCancelledError();

  // 共享 AbortController：预算超时与外部取消都走同一信号（P17 模式）
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  const deadline = Date.now() + budgetMs;
  let timedOut = false;
  const remaining = () => deadline - Date.now();

  /** 在剩余预算内完成一次 LLM 调用；预算耗尽/失败返回 null（降级），用户取消则抛错 */
  const callWithBudget = async (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    maxTokens?: number,
  ): Promise<string | null> => {
    const left = remaining();
    if (left <= 0) {
      timedOut = true;
      return null;
    }
    if (!opts.llm) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const budgetReject = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error('深度报告预算超时'));
      }, left);
    });
    try {
      const attempt = opts.llm.complete(messages, { maxTokens, signal: controller.signal });
      return await Promise.race([attempt, budgetReject]);
    } catch {
      if (externalSignal?.aborted) throw new DeepReportCancelledError();
      return null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  const contextBlock = buildContext(query, evidence);

  // Stage A：大纲（LLM 一次性给分节标题）
  safeStage('report-outline');
  const outline = await callWithBudget(
    [
      { role: 'system', content: REPORT_SYSTEM_PROMPT },
      { role: 'user', content: `${contextBlock}\n\n请先只输出报告分节大纲，每行一个小节标题，2-4 节，不要输出其他内容。` },
    ],
    MAX_OUTLINE_TOKENS,
  );

  const fallbackSections = buildFallbackSections(query, evidence, opts.synthesis);
  const headings = parseOutline(outline);
  const usedHeadings = headings.length > 0 ? headings : fallbackSections.map((s) => s.heading);

  // Stage B：分节生成（逐节共享剩余预算；预算耗尽补降级节）
  const sections: string[] = [];
  const usedLlm = outline !== null;
  safeStage('report-sections');
  for (let i = 0; i < Math.min(sectionCount, usedHeadings.length); i++) {
    if (externalSignal?.aborted) throw new DeepReportCancelledError();
    safeStage(`report-section-${i + 1}`);
    const heading = usedHeadings[i];
    let body: string | null = null;
    if (outline !== null && opts.llm) {
      body = await callWithBudget(
        [
          { role: 'system', content: REPORT_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `${contextBlock}\n\n请撰写报告小节「${heading}」的内容（Markdown，300-500 字，引用来源 URL）。`,
          },
        ],
        MAX_SECTION_TOKENS,
      );
    }
    if (body) {
      sections.push(`## ${heading}\n\n${body.trim()}`);
    } else {
      const fb = fallbackSections.find((s) => s.heading === heading) ?? fallbackSections[Math.min(i, fallbackSections.length - 1)];
      sections.push(fb.markdown);
    }
    if (remaining() <= 0) {
      timedOut = true;
      break;
    }
  }
  for (let i = sections.length; i < Math.min(sectionCount, fallbackSections.length); i++) {
    sections.push(fallbackSections[i].markdown);
  }

  // Stage C：证据附录（规则组装，不耗 LLM 预算）
  safeStage('report-evidence');
  const evidenceAppendix = buildEvidenceAppendix(evidence);

  const report = `# ${query}\n\n${sections.join('\n\n')}\n\n## 证据附录\n\n${evidenceAppendix.join('\n') || '（无可用证据）'}`;

  externalSignal?.removeEventListener('abort', onExternalAbort);
  return {
    report,
    sections,
    evidenceAppendix,
    elapsedMs: Date.now() - start,
    source: usedLlm ? 'llm' : 'fallback',
    timedOut,
  };
}

function buildContext(query: string, evidence: DeepReportEvidenceItem[]): string {
  const items = evidence
    .slice(0, 12)
    .map(
      (e, i) =>
        `${i + 1}. [${e.type}] ${e.title}\n   ${e.url}（${e.domain}，score ${e.score.toFixed(2)}）`,
    )
    .join('\n');
  return `问题：${query}\n\n证据：\n${items || '（暂无证据）'}`;
}

function parseOutline(outline: string | null): string[] {
  if (!outline) return [];
  return outline
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .filter((l) => l.length > 0 && l.length <= 40)
    .slice(0, 4);
}

function buildFallbackSections(
  query: string,
  evidence: DeepReportEvidenceItem[],
  synthesis?: string,
): Array<{ heading: string; markdown: string }> {
  const top = evidence.slice(0, 5);
  return [
    {
      heading: '概述',
      markdown: `## 概述\n\n${synthesis ?? `围绕「${query}」的检索结果整理如下。`}`,
    },
    {
      heading: '关键发现',
      markdown: `## 关键发现\n\n${
        top.length > 0
          ? top.map((e) => `- ${e.title}（${e.domain}，[${e.type}]）`).join('\n')
          : '暂无高可信证据。'
      }`,
    },
    {
      heading: '来源要点',
      markdown: `## 来源要点\n\n${
        top.length > 0
          ? top
              .map((e) => `- ${e.domain}：${e.title}\n  ${e.url}`)
              .join('\n')
          : '（无来源可引用）'
      }`,
    },
  ];
}

function buildEvidenceAppendix(evidence: DeepReportEvidenceItem[]): string[] {
  return evidence.map(
    (e, i) =>
      `${i + 1}. [${e.type}] ${e.title} — ${e.url}（${e.domain}，score ${e.score.toFixed(2)}）`,
  );
}
