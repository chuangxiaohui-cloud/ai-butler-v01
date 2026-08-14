import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { createBrowserSessionSkill } from './index.js';
import type { BrowserSessionManager } from '../../browser/session.js';

const fakeManager = {
  profileDir: 'M:/tmp/fake-profile',
  fetchPage: async (url: string) => ({
    url,
    title: '标题',
    text: '页面正文',
    sessionDomains: ['szlcsc.com'],
  }),
  sessionDomains: async () => ['szlcsc.com'],
} as unknown as BrowserSessionManager;

test('browser-session skill: 带 URL 时抓取网页正文', async () => {
  const skill = createBrowserSessionSkill(fakeManager);
  const out = await skill.execute(
    {
      query: '帮我抓取 https://item.szlcsc.com/515651.html 的数据手册',
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
    },
    { callVLM: async () => '' },
  );
  const result = out.result as { answer: string; url: string; title: string };
  assert.equal(result.url, 'https://item.szlcsc.com/515651.html');
  assert.equal(result.title, '标题');
  assert.equal(result.answer, '页面正文');
});

test('browser-session skill: 无 URL 时返回会话状态', async () => {
  const skill = createBrowserSessionSkill(fakeManager);
  const out = await skill.execute(
    {
      query: '浏览器会话登录状态',
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
    },
    { callVLM: async () => '' },
  );
  const result = out.result as { answer: string; sessionDomains: string[] };
  assert.ok(result.answer.includes('szlcsc.com'));
  assert.deepEqual(result.sessionDomains, ['szlcsc.com']);
});
