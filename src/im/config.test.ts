import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createImChannels, loadImChannelConfig } from './config.js';

function tempConfig(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'im-config-'));
  const file = join(dir, 'im-channels.json');
  writeFileSync(file, content, 'utf-8');
  return file;
}

test('E241: loadImChannelConfig 读取合法通道，跳过坏条目', () => {
  const file = tempConfig(JSON.stringify({
    channels: [
      { platform: 'qq', onebot: { httpApiBase: 'http://127.0.0.1:3000', listenPort: 8791, accessToken: 't' } },
      { platform: 'wechat' },
      { platform: 'feishu' },
      null,
    ],
  }));
  const entries = loadImChannelConfig(file);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].platform, 'qq');
});

test('E241: loadImChannelConfig 缺失/损坏文件返回空表', () => {
  assert.deepEqual(loadImChannelConfig(join(tmpdir(), 'no-such-im-channels.json')), []);
  assert.deepEqual(loadImChannelConfig(tempConfig('{bad json')), []);
  assert.deepEqual(loadImChannelConfig(tempConfig('{"channels": "nope"}')), []);
});

test('E241: createImChannels 只装配合法 qq OneBot 通道', () => {
  const entries = [
    { platform: 'qq', onebot: { httpApiBase: 'http://127.0.0.1:3000', listenPort: 8791, accessToken: 't' } },
    { platform: 'qq', onebot: { httpApiBase: '', listenPort: 8792, accessToken: 't' } },
    { platform: 'wechat', onebot: { httpApiBase: 'x', listenPort: 1, accessToken: 't' } },
  ];
  const channels = createImChannels(entries);
  assert.equal(channels.length, 1);
  assert.equal(channels[0].platform, 'qq');
  assert.match(channels[0].id, /8791/);
});
