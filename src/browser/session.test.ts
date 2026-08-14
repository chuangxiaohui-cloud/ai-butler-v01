import { strict as assert } from 'node:assert';
import { test } from 'node:test';

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
};

test('browser-session: 带会话抓取页面并返回会话域', async () => {
  const { BrowserSessionManager } = await import('./session.js');
  const manager = new BrowserSessionManager({
    userDataDir: 'M:/tmp/browser-session-test',
    executablePath: 'C:/fake/chrome.exe',
    launcher: fakeChromium as never,
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
  });
  assert.deepEqual(await manager.sessionDomains(), []);
});
