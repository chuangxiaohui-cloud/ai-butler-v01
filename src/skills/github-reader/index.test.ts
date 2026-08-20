import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { skill } from './index.js';

test('github-reader: 无链接时请求提供仓库链接', async () => {
  const out = await skill.handler('帮我分析一下这个项目');
  assert.ok(out.includes('GitHub 仓库链接'));
});

test('github-reader: README 抓取成功返回摘要', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('# Zephyr\n\nRTOS 项目，支持多架构。', { status: 200 });
  try {
    const out = await skill.handler(
      '帮我分析一下这个GitHub项目：https://github.com/zephyrproject-rtos/zephyr',
    );
    assert.ok(out.includes('zephyrproject-rtos/zephyr'));
    assert.ok(out.includes('README 摘要'));
    assert.ok(out.includes('RTOS 项目'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('github-reader: README 全部不可达时给仓库主页兜底', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Not Found', { status: 404 });
  try {
    const out = await skill.handler(
      '帮我分析一下这个GitHub项目：https://github.com/zephyrproject-rtos/zephyr',
    );
    assert.ok(out.includes('未能拉到 README'));
    assert.ok(out.includes('https://github.com/zephyrproject-rtos/zephyr'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
