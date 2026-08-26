/**
 * 真实 CDP 浏览器驱动（E252：src/browser/operations.ts BrowserDriver 实现）
 * 复用 BrowserSessionManager 持久化会话（登录态继承，§1.2）；AX 树观察经 CDP
 * Accessibility.getFullAXTree → dom-observe 渲染（有界、untrusted_data）。
 * 真实冒烟依赖本机 browser:launch / BROWSER_EXECUTABLE 环境，不可用时如实失败。
 */

import { basename, join } from 'node:path';
import type { Locator, Page } from 'playwright-core';
import { renderDomSnapshot, type DomObserveElement, type DomSnapshot } from './dom-observe.js';
import type { BrowserDriver } from './operations.js';
import { browserSession, type BrowserSessionManager } from './session.js';

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'combobox',
  'checkbox',
  'radio',
  'menuitem',
  'switch',
  'searchbox',
  'spinbutton',
  'slider',
  'tab',
  'treeitem',
]);

interface AxNode {
  role?: { value?: string } | string;
  name?: { value?: string } | string;
  actions?: string[];
  children?: AxNode[];
}

/** CDP AX 节点 role/name 取值：兼容 { value } 与裸字符串两种形态 */
function roleValue(node: { value?: string } | string | undefined): string {
  return typeof node === 'string' ? node : node?.value ?? '';
}

export interface CdpBrowserDriverDeps {
  session?: BrowserSessionManager;
  headless?: boolean;
  gotoTimeoutMs?: number;
  downloadDir?: string;
}

export function createCdpBrowserDriver(deps: CdpBrowserDriverDeps = {}): BrowserDriver {
  const session = deps.session ?? browserSession;
  const downloadDir = deps.downloadDir ?? join(process.cwd(), 'data', 'browser-downloads');
  let page: Page | null = null;
  let lastRefs = new Map<number, { tag: string; text: string }>();

  const ensurePage = async (): Promise<Page> => {
    if (page && !page.isClosed()) return page;
    const context = await session.ensureContext(deps.headless ?? false);
    page = await context.newPage();
    return page;
  };

  const observe = async (): Promise<DomSnapshot> => {
    const p = await ensurePage();
    const client = await p.context().newCDPSession(p);
    const payload = (await client.send('Accessibility.getFullAXTree')) as { nodes?: AxNode[] };
    const elements: DomObserveElement[] = [];
    let ref = 1;
    const collect = (node: AxNode, depth: number): void => {
      if (depth > 4) return;
      const role = roleValue(node.role);
      const name = roleValue(node.name).trim();
      const isInteractive =
        INTERACTIVE_ROLES.has(role) || (Array.isArray(node.actions) && node.actions.length > 0);
      if (isInteractive && name) {
        elements.push({ ref: ref++, tag: role, role, text: name.slice(0, 200), frameDepth: depth });
      }
      for (const child of node.children ?? []) collect(child, depth + 1);
    };
    for (const node of payload.nodes ?? []) collect(node, 0);
    const snapshot = renderDomSnapshot(elements);
    lastRefs = new Map(snapshot.refs.map((r) => [r.ref, { tag: r.tag, text: r.text }]));
    return snapshot;
  };

  const locate = async (ref: string): Promise<{ role?: string; name?: string; selector?: string }> => {
    const match = /^@(\d+)$/.exec(ref.trim());
    if (match) {
      const n = Number(match[1]);
      const entry = lastRefs.get(n);
      if (!entry) throw new Error(`观察快照中无 ref=@${n}，请先观察当前页`);
      return { role: entry.tag, name: entry.text };
    }
    return { selector: ref };
  };

  const locatorOf = async (target: { role?: string; name?: string; selector?: string }): Promise<Locator> => {
    const p = await ensurePage();
    if (target.role) {
      return p.getByRole(target.role as never, { name: target.name, exact: false }).first();
    }
    return p.locator(target.selector ?? '').first();
  };

  return {
    async goto(url) {
      const p = await ensurePage();
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: deps.gotoTimeoutMs ?? 30_000 });
      return { url: p.url(), title: await p.title() };
    },
    async click(ref) {
      await (await locatorOf(await locate(ref))).click();
    },
    async type(ref, text) {
      await (await locatorOf(await locate(ref))).fill(text);
    },
    async select(ref, option) {
      await (await locatorOf(await locate(ref))).selectOption(option);
    },
    async scroll(dx, dy) {
      const p = await ensurePage();
      await p.evaluate(([x, y]) => {
        const w = globalThis as unknown as { scrollBy?(dx: number, dy: number): void };
        w.scrollBy?.(x, y);
      }, [dx, dy] as const);
    },
    async hover(ref) {
      await (await locatorOf(await locate(ref))).hover();
    },
    async wait(ms) {
      const p = await ensurePage();
      await p.waitForTimeout(ms);
    },
    async download(url) {
      const fileName = basename(new URL(url).pathname) || 'download';
      const destPath = join(downloadDir, `${Date.now()}-${fileName}`);
      const result = await session.downloadFile(url, destPath);
      if (!result.ok) throw new Error(result.error ?? '下载失败');
      return { path: destPath };
    },
    async currentUrl() {
      return (await ensurePage()).url();
    },
    observe,
  };
}