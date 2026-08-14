import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const cdpStateDir = mkdtempSync(join(tmpdir(), 'browser-cdp-test-'));

const fakePage = {
  goto: async () => undefined,
  url: () => 'https://item.szlcsc.com/515651.html',
  title: async () => 'STM32F103C8T6 数据手册',
  evaluate: async () => '72MHz LQFP48 数据手册正文',
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
