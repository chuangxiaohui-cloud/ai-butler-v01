/**
 * BrowserSessionManager
 *
 * 让 Agent 继承“用户已登录的浏览器会话”：使用独立的持久化 Chromium profile，
 * 用户首次用可视窗口登录一次，之后 Agent 的 fetch 复用同一份 Session/Cookie。
 * 不读取用户正在运行的 Chrome 配置目录（浏览器锁定，直接读取会冲突）。
 */

import { join, resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserType,
  type Page,
} from 'playwright-core';

export interface BrowserSessionOptions {
  userDataDir?: string;
  executablePath?: string;
  headless?: boolean;
  launcher?: BrowserType;
  cdpStatePath?: string;
}

export interface FetchPageResult {
  url: string;
  title: string;
  text: string;
  sessionDomains: string[];
  pdfLinks?: Array<{ url: string; text: string }>;
}

const DEFAULT_USER_DATA_DIR = resolve(process.cwd(), 'data', 'browser-session');
const DEFAULT_CDP_STATE_PATH = resolve(process.cwd(), 'data', 'browser-session-cdp.json');

function defaultExecutablePath(): string | null {
  const envPath = process.env.BROWSER_EXECUTABLE;
  if (envPath && existsSync(envPath)) return envPath;
  const candidates = [
    'C:/Users/zhxh/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function resolveExecutable(executablePath?: string): string {
  if (executablePath) return executablePath;
  const found = defaultExecutablePath();
  if (!found) {
    throw new Error('未找到可用浏览器，请设置 BROWSER_EXECUTABLE 环境变量');
  }
  return found;
}

function extractPageData(
  page: Page,
): Promise<{ text: string; pdfLinks: Array<{ url: string; text: string }> }> {
  const extract = () => {
    const doc = (globalThis as { document?: unknown }).document as
      | {
          querySelector(selector: string): { textContent: string | null } | null;
          body: { textContent: string | null } | null;
          location: { href: string };
          querySelectorAll(selector: string): ArrayLike<unknown>;
        }
      | undefined;
    if (!doc) return { text: '', pdfLinks: [] };
    const main = doc.querySelector('main')?.textContent ?? doc.body?.textContent ?? '';
    const text = main.replace(/\s+/g, ' ').trim().slice(0, 20_000);
    const pdfLinks: Array<{ url: string; text: string }> = [];
    const anchors = doc.querySelectorAll('a[href]');
    for (let i = 0; i < anchors.length; i += 1) {
      const anchor = anchors[i] as {
        href?: string;
        getAttribute?(name: string): string | null;
        textContent?: string | null;
      };
      const raw = anchor.href ?? anchor.getAttribute?.('href') ?? '';
      try {
        const url = new URL(raw, doc.location.href).href;
        if (/\.pdf(\?|#|$)/i.test(url)) {
          pdfLinks.push({ url, text: (anchor.textContent ?? '').trim().slice(0, 120) });
        }
      } catch {
        // 非法 URL 跳过
      }
      if (pdfLinks.length >= 20) break;
    }
    return { text, pdfLinks };
  };
  return page.evaluate(extract);
}

export class BrowserSessionManager {
  private context: BrowserContext | null = null;
  private cdpBrowser: Browser | null = null;
  private readonly userDataDir: string;
  private readonly executablePath: string;
  private readonly headless: boolean;
  private readonly launcher: BrowserType;
  private readonly cdpStatePath: string;

  constructor(opts: BrowserSessionOptions = {}) {
    this.userDataDir = opts.userDataDir ?? DEFAULT_USER_DATA_DIR;
    this.executablePath = resolveExecutable(opts.executablePath);
    this.headless = opts.headless ?? true;
    this.launcher = opts.launcher ?? chromium;
    this.cdpStatePath = opts.cdpStatePath ?? DEFAULT_CDP_STATE_PATH;
  }

  get profileDir(): string {
    return this.userDataDir;
  }

  savedCdpPort(): number | null {
    try {
      const raw = readFileSync(this.cdpStatePath, 'utf8');
      const parsed = JSON.parse(raw) as { port?: unknown };
      return typeof parsed.port === 'number' && Number.isInteger(parsed.port)
        ? parsed.port
        : null;
    } catch {
      return null;
    }
  }

  private writeCdpState(port: number): void {
    mkdirSync(dirname(this.cdpStatePath), { recursive: true });
    writeFileSync(
      this.cdpStatePath,
      JSON.stringify({ port, connectedAt: new Date().toISOString() }, null, 2),
      'utf8',
    );
  }

  private clearCdpState(): void {
    try {
      rmSync(this.cdpStatePath, { force: true });
    } catch {
      // 状态文件不存在或不可删除时忽略
    }
  }

  private async autoConnectCdp(): Promise<void> {
    if (this.cdpBrowser) return;
    const port = this.savedCdpPort();
    if (!port) return;
    try {
      await this.connectCdp(port);
    } catch {
      this.clearCdpState();
    }
  }

  async ensureContext(headless = this.headless): Promise<BrowserContext> {
    await this.autoConnectCdp();
    if (this.cdpBrowser) {
      const contexts = this.cdpBrowser.contexts();
      if (contexts[0]) return contexts[0];
    }
    if (this.context && !this.context.browser()?.isConnected()) {
      await this.close();
    }
    if (!this.context) {
      this.context = await this.launcher.launchPersistentContext(this.userDataDir, {
        executablePath: this.executablePath,
        headless,
        viewport: { width: 1280, height: 900 },
      });
    }
    return this.context;
  }

  /** 连接用户正在运行的浏览器（需以 --remote-debugging-port 启动）。 */
  async connectCdp(port = 9222): Promise<{ sessionDomains: string[]; contexts: number }> {
    this.cdpBrowser = await this.launcher.connectOverCDP(`http://127.0.0.1:${port}`);
    this.writeCdpState(port);
    const sessionDomains = await this.sessionDomains();
    return { sessionDomains, contexts: this.cdpBrowser.contexts().length };
  }

  async disconnectCdp(): Promise<void> {
    this.clearCdpState();
    if (this.cdpBrowser) {
      await this.cdpBrowser.close().catch(() => undefined);
      this.cdpBrowser = null;
    }
  }

  /** 打开可视窗口让用户完成一次登录；返回后浏览器保持打开直到用户回车。 */
  async openLoginWindow(): Promise<{ profileDir: string; sessionDomains: string[] }> {
    await this.ensureContext(false);
    const sessionDomains = await this.sessionDomains();
    return { profileDir: this.userDataDir, sessionDomains };
  }

  /** 带会话状态抓取网页正文；登录后会话域内页面可直接读取。 */
  async fetchPage(url: string, timeoutMs = 30_000, waitMs = 0): Promise<FetchPageResult> {
    const context = await this.ensureContext();
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      if (waitMs > 0) await page.waitForTimeout(waitMs);
      const [title, data, sessionDomains] = await Promise.all([
        page.title(),
        extractPageData(page),
        this.sessionDomains(),
      ]);
      return {
        url: page.url(),
        title,
        text: data.text,
        sessionDomains,
        pdfLinks: data.pdfLinks,
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /**
   * 搜索引擎结果页兜底（E125）：引擎 API 全部零结果时，
   * 用现有浏览器会话抓 Bing/Baidu 结果容器并解析成 SearchResultItem。
   */
  async searchWeb(
    query: string,
    opts: { engine?: 'bing' | 'baidu'; count?: number } = {},
  ): Promise<
    Array<{
      title: string;
      url: string;
      content: string;
      provider: 'browser';
    }>
  > {
    const engine = opts.engine ?? 'bing';
    const count = Math.min(10, opts.count ?? 8);
    const url =
      engine === 'baidu'
        ? `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`
        : `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN&count=${count}`;
    const context = await this.ensureContext();
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForTimeout(1_000);
      const items = await page.evaluate((engineArg) => {
        const doc = (globalThis as { document?: unknown }).document as
          | {
              querySelectorAll(selector: string): ArrayLike<unknown>;
            }
          | undefined;
        if (!doc) return [];
        const engineName = engineArg as 'bing' | 'baidu';
        const selector = engineName === 'baidu' ? 'div.result.c-container' : 'li.b_algo';
        const nodes = Array.from(doc.querySelectorAll(selector)) as Array<{
          querySelector(selector: string): {
            textContent: string | null;
            getAttribute(name: string): string | null;
          } | null;
          textContent: string | null;
        }>;
        return nodes
          .slice(0, 8)
          .map((node) => {
            const anchor = node.querySelector('h2 a, h3 a, a');
            return {
              title: anchor?.textContent?.trim() ?? '',
              url: anchor?.getAttribute('href') ?? '',
              content: (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
              provider: 'browser' as const,
            };
          })
          .filter((item) => item.url && item.title);
      }, engine);
      return items;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /** 用当前浏览器会话下载文件（含 CDP 登录态 Cookie），返回落盘结果。 */
  async downloadFile(
    url: string,
    destPath: string,
  ): Promise<{ ok: boolean; size: number; error?: string }> {
    const context = await this.ensureContext();
    const resp = await context.request.get(url, { timeout: 30_000 });
    if (!resp.ok()) {
      return { ok: false, size: 0, error: `HTTP ${resp.status()}` };
    }
    const body = await resp.body();
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, body);
    return { ok: true, size: body.length };
  }

  async sessionDomains(): Promise<string[]> {
    await this.autoConnectCdp();
    const cdpContexts = this.cdpBrowser ? await this.cdpBrowser.contexts() : [];
    const context = cdpContexts[0] ?? this.context;
    if (!context) return [];
    const cookies = await context.cookies();
    return [...new Set(cookies.map((c) => c.domain.replace(/^\./, '')))].sort();
  }

  async close(): Promise<void> {
    if (this.cdpBrowser) {
      await this.cdpBrowser.close().catch(() => undefined);
      this.cdpBrowser = null;
    }
    if (this.context) {
      await this.context.close().catch(() => undefined);
      this.context = null;
    }
  }
}

export const browserSession = new BrowserSessionManager();

/** 供 CLI/脚本使用：临时配置实例（不污染全局单例）。 */
export function createBrowserSessionManager(opts: BrowserSessionOptions = {}): BrowserSessionManager {
  return new BrowserSessionManager(opts);
}
