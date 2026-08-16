import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { pickSecondPassTarget, pickSecondPassTargets, shouldSecondPass } from './second-pass.js';

const html = (url: string, title = 't'): { title: string; url: string; content: string; provider: 'browser' } => ({
  title,
  url,
  content: 'c',
  provider: 'browser',
});

test('second-pass: 器件型号触发，普通问题不触发', () => {
  assert.equal(shouldSecondPass('GD32F103C8T6 数据手册'), true);
  assert.equal(shouldSecondPass('今天天气怎么样'), false);
});

test('second-pass: 优先高可信 HTML 页，跳过 PDF', () => {
  const results = [
    html('https://atta.szlcsc.com/upload/gd32.pdf'),
    html('https://item.szlcsc.com/datasheet/GD32F103C8T6/79128.html'),
  ];
  const picked = pickSecondPassTarget(results, 'GD32F103C8T6 数据手册', []);
  assert.equal(picked?.url, 'https://item.szlcsc.com/datasheet/GD32F103C8T6/79128.html');
});

test('second-pass: 无高可信时退回融合结果中的权威 HTML', () => {
  const results = [html('https://example.com/x')];
  const fused = [
    { result: results[0], official: false, finalScore: 0.4 },
    {
      result: html('https://www.st.com/en/stm32f103c8.html'),
      official: true,
      finalScore: 0.5,
    },
    {
      result: html('https://atta.szlcsc.com/upload/gd32.pdf'),
      official: false,
      finalScore: 0.9,
    },
  ];
  const picked = pickSecondPassTarget(results, 'GD32F103C8T6 数据手册', fused as never);
  assert.equal(picked?.url, 'https://www.st.com/en/stm32f103c8.html');
});

test('second-pass: 只有 PDF 时退回高可信 PDF', () => {
  const results = [
    html('https://atta.szlcsc.com/upload/public/pdf/source/gd32-selection.pdf'),
    html('https://example.com/other'),
  ];
  const fused = [
    { result: results[1], official: false, finalScore: 0.3 },
    { result: results[0], official: false, finalScore: 0.9 },
  ];
  const picked = pickSecondPassTarget(results, 'GD32F103C8T6 数据手册', fused as never);
  assert.equal(picked?.url, 'https://atta.szlcsc.com/upload/public/pdf/source/gd32-selection.pdf');
});

test('second-pass: 融合全空时按相关度选 HTML 原文', () => {
  const results = [
    {
      title: '用 AI Agent 做知识库更新提醒',
      url: 'https://example.com/kb-update',
      content: 'Agent 自动检测知识库文档过时 负责人 提醒更新',
      provider: 'bocha' as const,
    },
    {
      title: '不相关页面',
      url: 'https://example.com/unrelated',
      content: '随便一句话',
      provider: 'bocha' as const,
    },
  ];
  const targets = pickSecondPassTargets(
    results,
    '团队内部知识库更新滞后，如何用 Agent 自动检测哪些文档过时并提醒更新？',
    [],
  );
  assert.equal(targets[0]?.url, 'https://example.com/kb-update');
  assert.ok(targets.length <= 2);
});
