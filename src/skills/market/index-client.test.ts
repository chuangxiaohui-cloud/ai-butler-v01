import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { fetchMarketIndex, parseMarketIndex, type FetchLike } from './index-client.js';

const ENTRY = {
  name: 'pcb-helper',
  version: '0.1.0',
  sourceUrl: 'https://github.com/x/pcb-helper/raw/main/skill.json',
  permissions: ['none'],
};

function okFetch(text: string): FetchLike {
  return async () => ({ ok: true, status: 200, text });
}

test('market-index: JSON 数组索引解析有效条目，非法条目跳过', () => {
  const entries = parseMarketIndex(
    JSON.stringify([
      ENTRY,
      { name: 'Bad Name', version: '1', sourceUrl: 'https://x/y', permissions: [] },
      { name: 'ok-skill', version: '1', sourceUrl: 'not-a-url', permissions: [] },
    ]),
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.name, 'pcb-helper');
});

test('market-index: {skills:[...]} 对象索引解析', () => {
  const entries = parseMarketIndex(JSON.stringify({ skills: [ENTRY] }));
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.sourceUrl, ENTRY.sourceUrl);
});

test('market-index: JSONL 行索引解析，损坏行跳过', () => {
  const jsonl = [
    JSON.stringify(ENTRY),
    'not-json',
    JSON.stringify({ name: 'b', version: '1', sourceUrl: 'https://gitee.com/a/b', permissions: ['network'] }),
  ].join('\n');
  const entries = parseMarketIndex(jsonl);
  assert.equal(entries.length, 2);
});

test('market-index: fetchMarketIndex 非 http/失败/超限/空索引均抛错', async () => {
  await assert.rejects(
    () => fetchMarketIndex(async () => ({ ok: false, status: 500, text: '' }), 'https://market.example/index.json'),
    /HTTP 500/,
  );
  await assert.rejects(() => fetchMarketIndex(okFetch('[]'), 'ftp://bad'), /http\/https/);
  await assert.rejects(() => fetchMarketIndex(okFetch('[]'), 'https://market.example/index.json'), /没有有效条目/);
  await assert.rejects(
    () => fetchMarketIndex(okFetch(JSON.stringify([ENTRY])), 'https://market.example/index.json', 10),
    /大小上限/,
  );
});
