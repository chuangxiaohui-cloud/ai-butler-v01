import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { SearchResultItem } from './providers/types.js';
import { fuseResults } from './fusion.js';

function item(partial: Partial<SearchResultItem> & Pick<SearchResultItem, 'url' | 'title'>): SearchResultItem {
  return {
    content: '内容 示例 100A 输入输出 说明 步骤 参数 稳定 可靠',
    provider: 'bocha',
    ...partial,
  } as SearchResultItem;
}

test('fusion: 实体过滤器丢弃不匹配型号', () => {
  const items = [
    item({ url: 'https://a.com/1', title: 'STM32F103 主频', content: 'STM32F103C8T6 最大主频 72MHz' }),
    item({ url: 'https://b.com/2', title: 'ESP32 主频', content: 'ESP32 主频 240MHz' }),
  ];
  const r = fuseResults('STM32F103C8T6 最大主频是多少', items, 'factual');
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].result.url, 'https://a.com/1');
});

test('fusion: 实体过滤器不把 TPS5430DDA 当 TPS5430', () => {
  const items = [
    item({
      url: 'https://lcsc.example/dda',
      title: 'TPS5430DDA 中文资料',
      content: 'TPS5430DDA 4.5-60V 参数 说明 设计 文档 示例 完整 内容 足够 长',
    }),
    item({
      url: 'https://lcsc.example/5430',
      title: 'TPS5430 输入电压范围',
      content: 'TPS5430 输入电压 4.5-36V 参数 说明 设计 文档 示例 完整 内容 足够 长',
    }),
  ];
  const r = fuseResults('TPS5430 输入电压范围', items, 'factual');
  assert.equal(r.items.some((f) => f.result.url.includes('dda')), false);
  assert.equal(r.items.some((f) => f.result.url.includes('5430')), true);
});

test('fusion: 跨引擎同 URL 去重', () => {
  const items = [
    item({ url: 'https://same.example/1', title: 'x', content: 'STM32F103C8T6 72MHz 主频 说明' }),
    item({ url: 'https://same.example/1', title: 'x dup', content: 'STM32F103C8T6 72MHz 主频 说明' }),
  ];
  const r = fuseResults('STM32F103C8T6 最大主频是多少', items, 'factual');
  assert.equal(r.items.length, 1);
});

test('fusion: E02 官方源仲裁后综合分胜出', () => {
  const items = [
    item({
      url: 'https://blog.csdn.net/abc/123',
      title: 'TPS5430 输入电压范围 4.5-60V',
      content: 'TPS5430 输入电压范围 4.5-60V 说明 参数 电路 设计 示例 完整 内容 足够 长',
    }),
    item({
      url: 'https://www.ti.com/product/TPS5430',
      title: 'TPS5430 datasheet',
      content: 'TPS5430 输入电压 4.5-36V 参数 设计 说明 完整 内容 足够 长 示例',
    }),
  ];
  const r = fuseResults('TPS5430 输入电压范围', items, 'factual');
  const ti = r.items.find((f) => f.result.url.includes('ti.com'));
  const csdn = r.items.find((f) => f.result.url.includes('csdn.net'));
  assert.ok(ti);
  assert.ok(csdn);
  assert.equal(ti.official, true);
  assert.equal(csdn.factConsistency, 0);
  assert.ok(ti.finalScore > csdn.finalScore);
});

test('fusion: SEO 垃圾页降权', () => {
  const base = item({
    url: 'https://bad.example/1',
    title: 'STM32F103C8T6 最大主频是多少',
    content:
      'STM32F103C8T6 最大主频是多少 24小时在线客服 加微信 联系电话 完整 说明 参数 示例 设计 文档 100A '.repeat(5),
  });
  const good = item({
    url: 'https://good.example/2',
    title: 'STM32F103C8T6 最大主频是多少',
    content:
      'STM32F103C8T6 最大主频是多少 72MHz 完整 参数 说明 步骤 示例 设计 文档 100A '.repeat(5),
  });
  const r = fuseResults('STM32F103C8T6 最大主频是多少', [base, good], 'factual');
  const bad = r.items.find((f) => f.result.url.includes('bad.example'));
  const ok = r.items.find((f) => f.result.url.includes('good.example'));
  assert.ok(bad, '垃圾页应保留但降权');
  assert.equal(bad.seoNoise, true);
  assert.ok(ok && ok.finalScore > bad.finalScore);
});

test('fusion: 无结果时低置信门控', () => {
  const r = fuseResults('ESP32 I2C 通信失败 无应答', [], 'troubleshooting');
  assert.equal(r.items.length, 0);
  assert.equal(r.lowConfidence, true);
});
