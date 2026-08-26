/**
 * 浏览器操作交互层（E252，§4.1.5）
 * DSL 步骤解析 + 有界执行：单任务动作数 ≤ [P-124]、单步超时 ≤ [P-125]；
 * 每步过 全局动作白名单 + Skill 动作子集 + URL SSRF + 域名白名单（声明+授权）
 * → 高风险审批双闸（默认拒绝，A7）→ 执行留痕（A8 可审查）。
 */

import { PARAMS } from '../config/params.js';
import { BROWSER_ACTION_SET, checkBrowserAction, type BrowserActionName } from '../security/browser-actions.js';
import { hostOfUrl, isDomainMatch } from '../security/domain-auth.js';
import type { DomSnapshot } from './dom-observe.js';

/** 浏览器驱动抽象（真实 CDP 由 runner/CLI 注入；单测用 fake） */
export interface BrowserDriver {
  goto(url: string): Promise<{ url: string; title: string }>;
  click(ref: string): Promise<void>;
  type(ref: string, text: string): Promise<void>;
  select(ref: string, option: string): Promise<void>;
  scroll(dx: number, dy: number): Promise<void>;
  hover(ref: string): Promise<void>;
  wait(ms: number): Promise<void>;
  download(url: string): Promise<{ path: string }>;
  currentUrl(): Promise<string>;
  observe(): Promise<DomSnapshot>;
}

export interface BrowserOpStep {
  action: BrowserActionName;
  /** 原始步骤行（留痕/审计） */
  raw: string;
  url?: string;
  ref?: string;
  text?: string;
  option?: string;
  dx?: number;
  dy?: number;
  ms?: number;
  isSubmit?: boolean;
  isWrite?: boolean;
}

export interface BrowserOpResult {
  step: BrowserOpStep;
  ok: boolean;
  error?: string;
  denied?: boolean;
  timedOut?: boolean;
  durationMs: number;
}

export interface BrowserOpOutcome {
  ok: boolean;
  results: BrowserOpResult[];
  error?: string;
  durationMs: number;
  finalSnapshot?: DomSnapshot;
}

export interface BrowserOpPolicy {
  skill: string;
  /** Skill manifest domains（URL 主机必须命中其一，A1/A4） */
  domains: string[];
  /** Skill 动作子集（缺省全局白名单，A6） */
  allowedActions?: ReadonlySet<string>;
  /** 域名授权查询（A3；未授权拒绝） */
  isAuthorized: (domain: string) => boolean;
  /** 高风险审批回调（A7；缺省拒绝） */
  confirm?: (step: BrowserOpStep, reasons: string[]) => boolean | Promise<boolean>;
}

export interface BrowserOperationRunnerDeps {
  driver: BrowserDriver;
  maxSteps?: number;
  stepTimeoutMs?: number;
  /** 动作留痕（A8 可审查；缺省无操作） */
  onAction?: (result: BrowserOpResult) => void;
}

/** DSL 解析：一行步骤 → BrowserOpStep；@query 占位符按输入替换（URL 段编码、文本段原样） */
export function parseBrowserStep(
  line: string,
  query?: string,
): { ok: true; step: BrowserOpStep } | { ok: false; error: string } {
  const raw = line.trim();
  const parts = raw.split(/\s+/);
  const [verb, ...rest] = parts;
  if (!verb || rest.length === 0) return { ok: false, error: '浏览器步骤为空或缺少参数' };
  switch (verb) {
    case 'goto': {
      const url = substituteQuery(rest.join(' '), query, true);
      if (url instanceof Error) return { ok: false, error: url.message };
      return { ok: true, step: { action: 'goto', raw, url } };
    }
    case 'click':
      return { ok: true, step: { action: 'click', raw, ref: rest[0] } };
    case 'type': {
      const [ref, ...textParts] = rest;
      const text = substituteQuery(textParts.join(' '), query, false);
      if (text instanceof Error) return { ok: false, error: text.message };
      return { ok: true, step: { action: 'type', raw, ref, text, isWrite: true } };
    }
    case 'select': {
      const [ref, option] = rest;
      return { ok: true, step: { action: 'select', raw, ref, option, isWrite: true } };
    }
    case 'scroll': {
      if (rest[0] === 'bottom') return { ok: true, step: { action: 'scroll', raw, dx: 0, dy: 100_000 } };
      const [dxRaw, dyRaw] = rest;
      const dx = Number(dxRaw);
      const dy = Number(dyRaw);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { ok: false, error: `scroll 参数必须是数字：${raw}` };
      return { ok: true, step: { action: 'scroll', raw, dx, dy } };
    }
    case 'hover':
      return { ok: true, step: { action: 'hover', raw, ref: rest[0] } };
    case 'wait': {
      const ms = Number(rest[0]);
      if (!Number.isFinite(ms) || ms <= 0) return { ok: false, error: `wait 参数必须是正整数毫秒：${raw}` };
      return { ok: true, step: { action: 'wait', raw, ms } };
    }
    case 'download': {
      const url = substituteQuery(rest.join(' '), query, true);
      if (url instanceof Error) return { ok: false, error: url.message };
      return { ok: true, step: { action: 'download', raw, url } };
    }
    default:
      return { ok: false, error: `未知浏览器动作：${verb}（白名单：goto/click/type/select/scroll/hover/wait/download）` };
  }
}

export class BrowserOperationRunner {
  private readonly driver: BrowserDriver;
  private readonly maxSteps: number;
  private readonly stepTimeoutMs: number;
  private readonly onAction?: (result: BrowserOpResult) => void;

  constructor(deps: BrowserOperationRunnerDeps) {
    this.driver = deps.driver;
    this.maxSteps = deps.maxSteps ?? PARAMS.browserOpMaxSteps;
    this.stepTimeoutMs = deps.stepTimeoutMs ?? PARAMS.browserOpStepTimeoutMs;
    this.onAction = deps.onAction;
  }

  async run(steps: BrowserOpStep[], policy: BrowserOpPolicy): Promise<BrowserOpOutcome> {
    const started = Date.now();
    const results: BrowserOpResult[] = [];
    // A10：单任务动作数上限——超限中止并归因，不静默继续
    if (steps.length > this.maxSteps) {
      const error = `任务动作数 ${steps.length} 超过 [P-124] 上限 ${this.maxSteps}，已中止`;
      return { ok: false, results, error, durationMs: Date.now() - started };
    }
    for (const step of steps) {
      const check = this.checkStep(step, policy);
      if (!check.allowed) {
        const result: BrowserOpResult = {
          step,
          ok: false,
          error: check.reason,
          denied: true,
          durationMs: 0,
        };
        results.push(result);
        this.onAction?.(result);
        return { ok: false, results, error: check.reason, durationMs: Date.now() - started };
      }
      if (check.highRisk) {
        const confirmed = policy.confirm ? await policy.confirm(step, check.riskReasons) : false;
        if (!confirmed) {
          const reason = `高风险动作未获用户确认（${check.riskReasons.join('/')}）：${step.raw}`;
          const result: BrowserOpResult = {
            step,
            ok: false,
            error: reason,
            denied: true,
            durationMs: 0,
          };
          results.push(result);
          this.onAction?.(result);
          return { ok: false, results, error: reason, durationMs: Date.now() - started };
        }
      }
      const result = await this.executeStep(step);
      results.push(result);
      this.onAction?.(result);
      if (!result.ok) {
        return {
          ok: false,
          results,
          error: result.error ?? `步骤失败：${step.raw}`,
          durationMs: Date.now() - started,
        };
      }
    }
    let finalSnapshot: DomSnapshot | undefined;
    try {
      finalSnapshot = await this.driver.observe();
    } catch {
      // 观察失败不使任务失败，如实缺省
    }
    return { ok: true, results, durationMs: Date.now() - started, finalSnapshot };
  }

  private checkStep(
    step: BrowserOpStep,
    policy: BrowserOpPolicy,
  ): { allowed: boolean; reason?: string; highRisk: boolean; riskReasons: string[] } {
    // A5：全局动作白名单 + A9：URL SSRF
    const whitelist = checkBrowserAction({ ...step, action: step.action });
    if (!whitelist.allowed) {
      return { allowed: false, reason: whitelist.reason, highRisk: false, riskReasons: [] };
    }
    // A6：Skill 动作子集收窄
    if (policy.allowedActions !== undefined && !policy.allowedActions.has(step.action)) {
      return {
        allowed: false,
        reason: `动作不在 Skill 声明的动作子集（${[...policy.allowedActions].join('/')}）：${step.action}`,
        highRisk: false,
        riskReasons: [],
      };
    }
    // A1/A4：URL 主机必须命中 Skill 域名白名单
    if (step.url !== undefined) {
      const host = hostOfUrl(step.url);
      if (host === null) {
        return { allowed: false, reason: `非法 URL：${step.url}`, highRisk: false, riskReasons: [] };
      }
      const matched = policy.domains.find((pattern) => isDomainMatch(pattern, host));
      if (!matched) {
        return {
          allowed: false,
          reason: `URL 域名 ${host} 不在 Skill 域名白名单（${policy.domains.join('/')}），已拒绝（可向用户申请授权）`,
          highRisk: false,
          riskReasons: [],
        };
      }
      // A3：域名须已获用户授权
      if (!policy.isAuthorized(matched)) {
        return {
          allowed: false,
          reason: `域名 ${matched} 未获用户授权，已拒绝（授权记录本地持久化、可撤销）`,
          highRisk: false,
          riskReasons: [],
        };
      }
    }
    return { allowed: true, highRisk: whitelist.highRisk, riskReasons: whitelist.riskReasons };
  }

  private async executeStep(step: BrowserOpStep): Promise<BrowserOpResult> {
    const started = Date.now();
    const task = this.dispatch(step);
    const timeout = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`单步超时 [P-125] ${this.stepTimeoutMs}ms：${step.raw}`)), this.stepTimeoutMs);
    });
    try {
      await Promise.race([task, timeout]);
      return { step, ok: true, durationMs: Date.now() - started };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        step,
        ok: false,
        error: message,
        timedOut: message.includes('[P-125]'),
        durationMs: Date.now() - started,
      };
    }
  }

  private dispatch(step: BrowserOpStep): Promise<unknown> {
    switch (step.action) {
      case 'goto':
        return this.driver.goto(step.url ?? '');
      case 'click':
        return this.driver.click(step.ref ?? '');
      case 'type':
        return this.driver.type(step.ref ?? '', step.text ?? '');
      case 'select':
        return this.driver.select(step.ref ?? '', step.option ?? '');
      case 'scroll':
        return this.driver.scroll(step.dx ?? 0, step.dy ?? 0);
      case 'hover':
        return this.driver.hover(step.ref ?? '');
      case 'wait':
        return this.driver.wait(step.ms ?? 0);
      case 'download':
        return this.driver.download(step.url ?? '');
    }
  }
}

function substituteQuery(text: string, query: string | undefined, encode: boolean): string | Error {
  if (!text.includes('@query')) return text;
  if (query === undefined) return new Error('步骤含 @query 占位符但未提供 --query 输入');
  return encode ? text.replaceAll('@query', encodeURIComponent(query)) : text.replaceAll('@query', query);
}