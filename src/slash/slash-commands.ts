/**
 * 斜杠命令层（E204）
 * - /context：查看当前会话上下文状态（轮次/逐字窗口/摘要/token 粗估/[P-109] 预算）
 * - /compact：手动触发当前会话压缩（窗口外轮次 → 「实体+决策+未决」摘要，复用 E193 compact）
 *
 * 与 pipeline 的 E193 SessionContextStore 同持久化（data/session-context/<id>.json），
 * 因此 CLI / gateway 各自 new 实例读写的都是同一份会话文件，无单例依赖。
 * 输出与稳定契约 answer(query) -> { answer, confidence, evidence[], gate_triggered } 同形，
 * UI / CLI 可直接复用渲染路径。
 */

import { CONTEXT_TOKEN_BUDGET, VERBATIM_WINDOW_TURNS, estimateTokens, type SessionContext, type SessionContextStore } from '../memory/session-context.js';
import { createLightClient, type LLMClient } from '../search/llm.js';

export type SlashCommandName = 'compact' | 'context';

export interface SlashCommand {
  name: SlashCommandName;
  raw: string;
}

export interface SlashResult {
  answer: string;
  confidence: number;
  evidence: unknown[];
  gate_triggered: 'none';
  slash: SlashCommandName;
}

export interface SlashContextDeps {
  sessionContext: SessionContextStore;
  llm?: LLMClient;
}

export interface SessionStatusReport {
  conversationId: string;
  turns: number;
  verbatimWindowTurns: number;
  overflowTurns: number;
  summaryChars: number;
  tokenEstimate: number;
  budget: number;
  needsCompaction: boolean;
}

// 仅整行匹配，避免正文以 / 开头的正常问题被误判（如 "/STM32 的引脚图"）。
const SLASH_PATTERN = /^\/(compact|context)\s*$/i;

export function parseSlashCommand(query: string): SlashCommand | null {
  const trimmed = (query ?? '').trim();
  const m = SLASH_PATTERN.exec(trimmed);
  if (!m) return null;
  return { name: m[1].toLowerCase() as SlashCommandName, raw: trimmed };
}

/** 会话状态报告；空会话返回全零占位（不抛错） */
export function describeSession(
  ctx: SessionContext | null,
  store: Pick<SessionContextStore, 'windowTurns' | 'overflowTurns' | 'needsCompaction'>,
): SessionStatusReport {
  if (!ctx) {
    return {
      conversationId: '',
      turns: 0,
      verbatimWindowTurns: 0,
      overflowTurns: 0,
      summaryChars: 0,
      tokenEstimate: 0,
      budget: CONTEXT_TOKEN_BUDGET,
      needsCompaction: false,
    };
  }
  const window = store.windowTurns(ctx);
  const overflow = store.overflowTurns(ctx);
  return {
    conversationId: ctx.conversationId,
    turns: ctx.turns.length,
    verbatimWindowTurns: window.length,
    overflowTurns: overflow.length,
    summaryChars: (ctx.summary ?? '').length,
    tokenEstimate: ctx.turns.reduce((sum, t) => sum + estimateTokens(t.text), 0),
    budget: CONTEXT_TOKEN_BUDGET,
    needsCompaction: store.needsCompaction(ctx),
  };
}

export function formatContextReport(r: SessionStatusReport): string {
  if (r.turns === 0) {
    return (
      `会话「${r.conversationId || '（无）'}」暂无轮次。` +
      `每次问答后用户/助手轮次会写入会话上下文，超过 [P-29] ${VERBATIM_WINDOW_TURNS} 轮 ` +
      `或 [P-109] ${r.budget} token 预算后自动压缩；也可随时用 /compact 手动压缩。`
    );
  }
  return [
    `会话「${r.conversationId}」上下文状态：`,
    `- 累计轮次：${r.turns}`,
    `- 逐字窗口：${r.verbatimWindowTurns}/${VERBATIM_WINDOW_TURNS} 轮（完整保留）`,
    `- 待压缩：${r.overflowTurns} 轮（窗口外）`,
    `- 会话摘要：${r.summaryChars > 0 ? `${r.summaryChars} 字符` : '未生成'}`,
    `- token 粗估：约 ${r.tokenEstimate} / 预算 ${r.budget}（[P-109]）`,
    `- 是否需要压缩：${r.needsCompaction ? '是（可执行 /compact）' : '否'}`,
  ].join('\n');
}

async function runContext(conversationId: string, deps: SlashContextDeps): Promise<SlashResult> {
  const ctx = await deps.sessionContext.load(conversationId);
  const report = describeSession(ctx, deps.sessionContext);
  return {
    answer: formatContextReport(report),
    confidence: 1,
    evidence: [],
    gate_triggered: 'none',
    slash: 'context',
  };
}

async function runCompact(conversationId: string, deps: SlashContextDeps): Promise<SlashResult> {
  const before = await deps.sessionContext.load(conversationId);
  if (!before || before.turns.length === 0) {
    return {
      answer: '当前会话暂无轮次，无需压缩。',
      confidence: 1,
      evidence: [],
      gate_triggered: 'none',
      slash: 'compact',
    };
  }
  const beforeReport = describeSession(before, deps.sessionContext);
  if (!beforeReport.needsCompaction) {
    return {
      answer: `当前会话无需压缩：窗口外无轮次且未超 token 预算。\n\n${formatContextReport(beforeReport)}`,
      confidence: 1,
      evidence: [],
      gate_triggered: 'none',
      slash: 'compact',
    };
  }
  const llm = deps.llm ?? createLightClient();
  const after = await deps.sessionContext.compact(conversationId, llm);
  const afterReport = describeSession(after, deps.sessionContext);
  return {
    answer: [
      '已手动压缩当前会话（窗口外轮次 → 实体/决策/未决摘要）。',
      `- 压缩前：${beforeReport.turns} 轮（待压缩 ${beforeReport.overflowTurns} 轮，摘要 ${beforeReport.summaryChars} 字符）`,
      `- 压缩后：${afterReport.turns} 轮，摘要 ${afterReport.summaryChars} 字符`,
      '窗口内轮次保留原文；后续问答自动注入「【会话摘要（此前轮次）】」。',
    ].join('\n'),
    confidence: 1,
    evidence: [],
    gate_triggered: 'none',
    slash: 'compact',
  };
}

/** 分发入口：非斜杠命令返回 null；错误以可读 answer 透出，不抛异常 */
export async function handleSlashCommand(
  query: string,
  conversationId: string | undefined,
  deps: SlashContextDeps,
): Promise<SlashResult | null> {
  const cmd = parseSlashCommand(query);
  if (!cmd) return null;
  if (!conversationId || conversationId.trim() === '') {
    return {
      answer: `/${cmd.name} 需要会话 ID：请携带 conversationId 调用（桌面端主聊天会自动携带；CLI 默认使用 cli 会话）。`,
      confidence: 0,
      evidence: [],
      gate_triggered: 'none',
      slash: cmd.name,
    };
  }
  try {
    if (cmd.name === 'context') return await runContext(conversationId.trim(), deps);
    return await runCompact(conversationId.trim(), deps);
  } catch (err) {
    return {
      answer: `/${cmd.name} 执行失败：${err instanceof Error ? err.message : String(err)}`,
      confidence: 0,
      evidence: [],
      gate_triggered: 'none',
      slash: cmd.name,
    };
  }
}
