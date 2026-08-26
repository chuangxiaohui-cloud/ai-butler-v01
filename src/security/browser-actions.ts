/**
 * 浏览器操作动作白名单 + 高风险审批标记（E252，§10.2「浏览器操作」类别）
 * 与命令白名单同构：动作枚举白名单 + URL SSRF（复用 url-safety）+ 高风险标记。
 * 高风险动作（表单提交/下载/跨域导航/写操作）不在本层拒绝，由上层审批双闸裁决
 * （默认拒绝，§4.1.5 用户确认）。
 */

import { isBlockedBrowserUrl } from './url-safety.js';

/** §4.1.5 浏览器操作全局动作白名单 */
export const BROWSER_ACTIONS = [
  'goto',
  'click',
  'type',
  'select',
  'scroll',
  'hover',
  'wait',
  'download',
] as const;

export type BrowserActionName = (typeof BROWSER_ACTIONS)[number];

export const BROWSER_ACTION_SET: ReadonlySet<string> = new Set(BROWSER_ACTIONS);

export interface BrowserActionContext {
  action: string;
  /** 目标 URL（goto/download 必填；其余动作可携带来源链接用于 SSRF/跨域判断） */
  url?: string;
  /** 当前页 URL（跨域导航判断用） */
  currentUrl?: string;
  /** click 目标是否为表单提交按钮（表单提交 = 高风险） */
  isSubmit?: boolean;
  /** 是否写操作（type/select 等改变页面内容，§4.1.5 高风险清单） */
  isWrite?: boolean;
}

export interface BrowserActionCheck {
  allowed: boolean;
  reason?: string;
  highRisk: boolean;
  riskReasons: string[];
}

/** 单步动作校验：白名单 + URL SSRF + 高风险标记（§10.4 A5/A9/A7 前置） */
export function checkBrowserAction(ctx: BrowserActionContext): BrowserActionCheck {
  if (!BROWSER_ACTION_SET.has(ctx.action)) {
    return { allowed: false, reason: `动作不在白名单：${ctx.action}`, highRisk: false, riskReasons: [] };
  }
  if (ctx.url !== undefined) {
    const check = isBlockedBrowserUrl(ctx.url);
    if (check.blocked) {
      return {
        allowed: false,
        reason: `URL 被 SSRF 黑名单拒绝（${check.reason}）：${ctx.url}`,
        highRisk: false,
        riskReasons: [],
      };
    }
  }
  const riskReasons: string[] = [];
  if (ctx.action === 'download') riskReasons.push('下载');
  if (ctx.isSubmit) riskReasons.push('表单提交');
  if (ctx.isWrite) riskReasons.push('写操作');
  if (
    ctx.action === 'goto' &&
    ctx.url !== undefined &&
    ctx.currentUrl !== undefined &&
    isCrossOrigin(ctx.currentUrl, ctx.url)
  ) {
    riskReasons.push('跨域导航');
  }
  return { allowed: true, highRisk: riskReasons.length > 0, riskReasons };
}

/** 跨域判断：来源与目标 origin 不同（goto 高风险触发条件之一） */
export function isCrossOrigin(fromUrl: string, toUrl: string): boolean {
  try {
    return new URL(fromUrl).origin !== new URL(toUrl).origin;
  } catch {
    return true;
  }
}