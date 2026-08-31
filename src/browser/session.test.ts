import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const cdpStateDir = mkdtempSync(join(tmpdir(), 'browser-cdp-test-'));

const fakePage = {
  route: async () => undefined,
  goto: async () => undefined,
  url: () => 'https://item.szlcsc.com/515651.html',
  title: async () => 'STM32F103C8T6 数据手册',
  evaluate: async () => ({
    text: '72MHz LQFP48 数据手册正文',
    pdfLinks: [
      { url: 'https://datasheet.szlcsc.com/stm32f103c8t6.pdf', text: '数据手册' },
    ],
    links: [{ url: 'https://example.com/stm32', text: '规格' }],
  }),
  close: async () => undefined,
};

let newPageCalls = 0;
let closeCalls = 0;

const fakeContext = {
  cookies: async () => [
    { domain: '.szlcsc.com' },
    { domain: 'xcc.com' },
  ],
  newPage: async () => {
    newPageCalls += 1;
    return fakePage;
  },
  close: async () => {
    closeCalls += 1;
  },
  browser: () => ({ isConnected: () => true }),
  request: {
    get: async () => ({
      ok: () => true,
      status: () => 200,
      body: async () => Buffer.from('pdf-content'),
    }),
  },
};

const fakeChromium = {
  launchPersistentContext: async () => fakeContext,
  connectOverCDP: async () => fakeCdpBrowser,
};

let cdpCalls = 0;
const fakeLauncherWithCdpCount = {
  launchPersistentContext: async () => fakeContext,
  connectOverCDP: async () => {
    cdpCalls += 1;
    return fakeCdpBrowser;
  },
};

const fakeCdpBrowser = {
  contexts: () => [fakeContext],
  close: async () => undefined,
};

test('browser-session: 带会话抓取页面并返回会话域', async () => {
  const { BrowserSessionManager } = await import('./session.js');
  const manager = new BrowserSessionManager({
    userDataDir: 'M:/tmp/browser-session-test',
    executablePath: 'C:/fake/chrome.exe',
    launcher: fakeChromium as never,
    cdpStatePath: join(cdpStateDir, 'fetch.json'),
  });
  const result = await manager.fetchPage('https://item.szlcsc.com/515651.html');
  assert.equal(result.title, 'STM32F103C8T6 数据手册');
  assert.equal(result.text, '72MHz LQFP48 数据手册正文');
  assert.deepEqual(result.citations, [{ url: 'https://example.com/stm32', text: '规格' }]);
  assert.deepEqual(result.sessionDomains, ['szlcsc.com', 'xcc.com']);
  assert.equal(newPageCalls, 1);
  await manager.close();
  assert.equal(closeCalls, 1);
});

test('browser-session: 未登录时会话域为空', async () => {
  const { BrowserSessionManager } = await import('./session.js');
  const manager = new BrowserSessionManager({
    userDataDir: 'M:/tmp/browser-session-empty',
    executablePath: 'C:/fake/chrome.exe',
    launcher: fakeChromium as never,
    cdpStatePath: join(cdpStateDir, 'empty.json'),
  });
  assert.deepEqual(await manager.sessionDomains(), []);
});

test('browser-session: CDP 连接复用正在运行的浏览器会话', async () => {
  const { BrowserSessionManager } = await import('./session.js');
  const manager = new BrowserSessionManager({
    userDataDir: 'M:/tmp/browser-session-cdp',
    executablePath: 'C:/fake/chrome.exe',
    launcher: fakeChromium as never,
    cdpStatePath: join(cdpStateDir, 'cdp.json'),
  });
  const info = await manager.connectCdp(9222);
  assert.deepEqual(info.sessionDomains, ['szlcsc.com', 'xcc.com']);
  assert.equal(info.contexts, 1);
  const page = await manager.fetchPage('https://item.szlcsc.com/515651.html');
  assert.equal(page.title, 'STM32F103C8T6 数据手册');
  await manager.close();
});

test('browser-session: CDP 端口持久化后新实例自动复用', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-cdp-state-'));
  const statePath = join(dir, 'persist.json');
  const m1 = new (await import('./session.js')).BrowserSessionManager({
    userDataDir: join(dir, 'p1'),
    executablePath: 'C:/fake/chrome.exe',
    launcher: fakeLauncherWithCdpCount as never,
    cdpStatePath: statePath,
  });
  await m1.connectCdp(9444);
  assert.equal(m1.savedCdpPort(), 9444);
  await m1.close();

  const m2 = new (await import('./session.js')).BrowserSessionManager({
    userDataDir: join(dir, 'p2'),
    executablePath: 'C:/fake/chrome.exe',
    launcher: fakeLauncherWithCdpCount as never,
    cdpStatePath: statePath,
  });
  const page = await m2.fetchPage('https://item.szlcsc.com/515651.html');
  assert.equal(page.title, 'STM32F103C8T6 数据手册');
  assert.equal(cdpCalls, 2);
  await m2.disconnectCdp();
  assert.equal(m2.savedCdpPort(), null);
  rmSync(dir, { recursive: true, force: true });
});

test('browser-session: fetchPage 拒绝回环地址（S1）', async () => {
  const manager = new (await import('./session.js')).BrowserSessionManager({
    userDataDir: 'M:/tmp/browser-session-test',
    executablePath: 'C:/fake/chrome.exe',
    launcher: fakeChromium as never,
  });
  await assert.rejects(() => manager.fetchPage('http://127.0.0.1:8420/'), /安全策略拒绝/);
});

test('browser-session: downloadFile 拒绝回环地址（S1）', async () => {
  const manager = new (await import('./session.js')).BrowserSessionManager({
    userDataDir: 'M:/tmp/browser-session-test',
    executablePath: 'C:/fake/chrome.exe',
    launcher: fakeChromium as never,
  });
  const result = await manager.downloadFile('http://localhost:8420/secret', 'M:/tmp/x.pdf');
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /安全策略拒绝/);
});
test('browser-session: fetchPage 拦截 30x 重定向到内网（E292）', async () => {
  const routeHandlerHolder: { handler?: (route: unknown) => Promise<void> } = {};
  const redirectPage = {
    route: async (_pattern: string, handler: (route: unknown) => Promise<void>) => {
      routeHandlerHolder.handler = handler;
    },
    goto: async () => {
      // 模拟公网页 302 → 内网目标：请求 URL 命中 RFC1918，路由拦截中止
      let aborted = false;
      await routeHandlerHolder.handler?.({
        request: () => ({ url: () => 'http://192.168.1.1/admin' }),
        abort: async () => {
          aborted = true;
        },
        continue: async () => undefined,
      });
      if (aborted) throw new Error('net::ERR_BLOCKED_BY_CLIENT');
    },
    url: () => 'https://example.com/',
    title: async () => '',
    evaluate: async () => ({ text: '', pdfLinks: [], links: [] }),
    close: async () => undefined,
  };
  const redirectContext = {
    cookies: async () => [],
    newPage: async () => redirectPage,
    close: async () => undefined,
    browser: () => ({ isConnected: () => true }),
    request: {
      get: async () => ({ ok: () => true, status: () => 200, body: async () => Buffer.alloc(0) }),
    },
  };
  const redirectLauncher = { launchPersistentContext: async () => redirectContext };
  const manager = new (await import('./session.js')).BrowserSessionManager({
    userDataDir: 'M:/tmp/browser-session-test',
    executablePath: 'C:/fake/chrome.exe',
    launcher: redirectLauncher as never,
  });
  await assert.rejects(() => manager.fetchPage('https://example.com/'), /ERR_BLOCKED_BY_CLIENT/);
});

test('browser-session: downloadFile 拒绝 3xx 重定向（E292）', async () => {
  const redirectCtx = {
    cookies: async () => [],
    newPage: async () => fakePage,
    close: async () => undefined,
    browser: () => ({ isConnected: () => true }),
    request: {
      get: async () => ({
        ok: () => false,
        status: () => 302,
        body: async () => Buffer.alloc(0),
      }),
    },
  };
  const redirectLauncher = { launchPersistentContext: async () => redirectCtx };
  const manager = new (await import('./session.js')).BrowserSessionManager({
    userDataDir: 'M:/tmp/browser-session-test',
    executablePath: 'C:/fake/chrome.exe',
    launcher: redirectLauncher as never,
  });
  const result = await manager.downloadFile('https://example.com/redirect', 'M:/tmp/x.pdf');
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /不允许跟随重定向/);
});

// v2.6 B4：完整域名白名单
test('browser-session: fetchPage 拒绝非白名单域名（B4）', async () => {
  const manager = new (await import('./session.js')).BrowserSessionManager({
    userDataDir: 'M:/tmp/browser-session-test',
    executablePath: 'C:/fake/chrome.exe',
    launcher: fakeChromium as never,
  });
  await assert.rejects(
    () => manager.fetchPage('https://evil.example.com/', 30_000, 0, ['szlcsc.com']),
    /域名不在白名单内/,
  );
});

test('browser-session: downloadFile 拒绝非白名单域名（B4）', async () => {
  const manager = new (await import('./session.js')).BrowserSessionManager({
    userDataDir: 'M:/tmp/browser-session-test',
    executablePath: 'C:/fake/chrome.exe',
    launcher: fakeChromium as never,
  });
  const result = await manager.downloadFile(
    'https://evil.example.com/x.pdf',
    'M:/tmp/b4-reject.pdf',
    undefined,
    ['szlcsc.com'],
  );
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /域名不在白名单内/);
});

test('browser-session: 白名单命中子域放行下载（B4）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-b4-allow-'));
  try {
    const manager = new (await import('./session.js')).BrowserSessionManager({
      userDataDir: join(dir, 'profile'),
      executablePath: 'C:/fake/chrome.exe',
      launcher: fakeChromium as never,
    });
    const dest = join(dir, 'stm32.pdf');
    const result = await manager.downloadFile(
      'https://so.szlcsc.com/stm32f103c8t6.pdf',
      dest,
      undefined,
      ['szlcsc.com'],
    );
    assert.equal(result.ok, true);
    assert.equal(result.size, 'pdf-content'.length);
    assert.equal(existsSync(dest), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('browser-session: CDP 状态过期后不再复用并清理（S2）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-cdp-expire-'));
  const statePath = join(dir, 'cdp.json');
  writeFileSync(statePath, JSON.stringify({ port: 9222, expiresAt: Date.now() - 1000 }), 'utf8');
  const manager = new (await import('./session.js')).BrowserSessionManager({
    userDataDir: join(dir, 'p'),
    executablePath: 'C:/fake/chrome.exe',
    launcher: fakeLauncherWithCdpCount as never,
    cdpStatePath: statePath,
  });
  assert.equal(manager.savedCdpPort(), null);
  assert.equal(existsSync(statePath), false, '过期状态应被清理');
  rmSync(dir, { recursive: true, force: true });
});

test('browser-session: 旧版无 expiresAt 状态视为过期（S2）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-cdp-legacy-'));
  const statePath = join(dir, 'cdp.json');
  writeFileSync(statePath, JSON.stringify({ port: 9222 }), 'utf8');
  const manager = new (await import('./session.js')).BrowserSessionManager({
    userDataDir: join(dir, 'p'),
    executablePath: 'C:/fake/chrome.exe',
    launcher: fakeLauncherWithCdpCount as never,
    cdpStatePath: statePath,
  });
  assert.equal(manager.savedCdpPort(), null);
  rmSync(dir, { recursive: true, force: true });
});

test('browser-session: 下载 PDF 到本地', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-pdf-'));
  const dest = join(dir, 'ds.pdf');
  const manager = new (await import('./session.js')).BrowserSessionManager({
    userDataDir: join(dir, 'profile'),
    executablePath: 'C:/fake/chrome.exe',
    launcher: fakeChromium as never,
    cdpStatePath: join(dir, 'cdp.json'),
  });
  const result = await manager.downloadFile('https://datasheet.szlcsc.com/stm32f103c8t6.pdf', dest);
  assert.equal(result.ok, true);
  assert.ok(result.size > 0);
  assert.equal(existsSync(dest), true);
  rmSync(dir, { recursive: true, force: true });
});

test('browser-session: searchWeb 解析搜索结果', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-search-'));
  const searchPage = {
    goto: async () => undefined,
    waitForTimeout: async () => undefined,
    url: () => 'https://www.bing.com/search?q=STM32+PWM',
    title: async () => 'STM32 PWM - 搜索',
    evaluate: async () => [
      {
        title: 'STM32 PWM 动态频率',
        url: 'https://example.com/pwm',
        content: '双缓冲更新比较寄存器',
        provider: 'browser',
      },
    ],
    close: async () => undefined,
  };
  const searchContext = {
    cookies: async () => [],
    newPage: async () => searchPage,
    close: async () => undefined,
    browser: () => ({ isConnected: () => true }),
    request: {
      get: async () => ({
        ok: () => true,
        body: async () => Buffer.from(''),
      }),
    },
  };
  const searchLauncher = {
    launchPersistentContext: async () => searchContext,
    connectOverCDP: async () => ({
      contexts: () => [],
      close: async () => undefined,
    }),
  };
  const manager = new (await import('./session.js')).BrowserSessionManager({
    userDataDir: join(dir, 'profile'),
    executablePath: 'C:/fake/chrome.exe',
    launcher: searchLauncher as never,
    cdpStatePath: join(dir, 'cdp.json'),
  });
  const items = await manager.searchWeb('STM32 PWM');
  assert.equal(items.length, 1);
  assert.equal(items[0].provider, 'browser');
  assert.equal(items[0].url, 'https://example.com/pwm');
  await manager.close();
  rmSync(dir, { recursive: true, force: true });
});

test('browser-session: extractPageScript 去噪提取 + 引用编号', async () => {
  const { extractPageScript } = await import('./session.js');
  const textNode = (value: string) => ({ nodeType: 3, textContent: value });
  const el = (tag: string, attrs: Record<string, string> = {}, children: unknown[] = []) => ({
    nodeType: 1,
    tagName: tag.toUpperCase(),
    childNodes: children,
    textContent: children.map((c) => (c as { textContent?: string | null }).textContent ?? '').join(''),
    getAttribute: (name: string) => attrs[name] ?? null,
    hasAttribute: (name: string) => name in attrs,
  });
  const main = el('main', {}, [
    el('h1', {}, [textNode('STM32F103 数据手册')]),
    el('p', {}, [textNode('主频 72MHz，LQFP48 封装。')]),
    el('div', { class: 'ad-banner' }, [textNode('广告 促销')]),
    el('p', {}, [textNode('结论：适合低功耗产品。')]),
  ]);
  const anchors = [
    el('a', { href: 'https://example.com/spec' }, [textNode('规格书')]),
    el('a', { href: 'https://example.com/spec' }, [textNode('规格书(重复)')]),
    el('a', { href: 'https://example.com/ds.pdf' }, [textNode('PDF 数据手册')]),
    el('a', { href: '#section1' }, [textNode('页内锚点')]),
  ];
  const doc = {
    body: el('body', {}, [
      el('nav', {}, [textNode('导航栏 首页 关于')]),
      main,
      el('footer', {}, [textNode('版权所有 2026')]),
    ]),
    location: { href: 'https://example.com/datasheet' },
    querySelector: (sel: string) => {
      if (sel === 'main') return main;
      if (sel === 'article' || sel === '[role="main"]') return null;
      return null;
    },
    querySelectorAll: (sel: string) => (sel === 'a[href]' ? anchors : []),
  };
  const prev = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = doc;
  try {
    const out = extractPageScript();
    assert.ok(out.text.includes('主频 72MHz'), out.text);
    assert.ok(out.text.includes('STM32F103 数据手册\n主频'), '块级换行保留: ' + JSON.stringify(out.text));
    assert.ok(!out.text.includes('导航栏'), 'nav 应剔除');
    assert.ok(!out.text.includes('广告'), '广告应剔除');
    assert.ok(!out.text.includes('版权所有'), 'footer 应剔除');
    assert.deepEqual(out.links, [{ url: 'https://example.com/spec', text: '规格书' }], '外部链接去重编号');
    assert.deepEqual(out.pdfLinks, [{ url: 'https://example.com/ds.pdf', text: 'PDF 数据手册' }], 'pdf 链接保留');
  } finally {
    (globalThis as { document?: unknown }).document = prev;
  }
});
