import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { sanitizeSearchQuery } from './query-sanitize.js';

test('query-sanitize: 剥离本地绝对路径，仅传必要信息（§10.3 + §10.4）', () => {
  const result = sanitizeSearchQuery('M:\\202608111\\project\\main.c 编译报错怎么解决');
  assert.equal(result.query.includes('M:\\202608111'), false);
  assert.match(result.query, /<路径>/);
  assert.match(result.query, /编译报错/);
  assert.ok(result.stripped.some((s) => s.includes('main.c')), '剥离项可审计');
});

test('query-sanitize: 剥离 API Key 并告警疑似密钥（§10.3 + §10.4）', () => {
  const result = sanitizeSearchQuery('为什么 sk-proj-abc123def456ghijklmn 不可用');
  assert.equal(result.query.includes('sk-proj-'), false);
  assert.ok(result.warnings.some((w) => w.includes('疑似密钥')), '检测到疑似密钥告警');
  assert.ok(result.stripped.some((s) => s.startsWith('sk-')), '密钥原文进剥离项');
});

test('query-sanitize: 剥离内网与回环地址', () => {
  const result = sanitizeSearchQuery('连不上 192.168.1.10 的板子，localhost 也试了');
  assert.equal(result.query.includes('192.168.1.10'), false);
  assert.equal(result.query.includes('localhost'), false);
  assert.match(result.query, /<内网地址>/);
  assert.match(result.query, /<回环地址>/);
});

test('query-sanitize: 剥离邮箱与家目录路径', () => {
  const result = sanitizeSearchQuery('~/Projects/board 与 zhang@corp.com 相关的问题');
  assert.equal(result.query.includes('~/Projects'), false);
  assert.equal(result.query.includes('zhang@corp.com'), false);
  assert.ok(result.stripped.length >= 2);
});

test('query-sanitize: 脱敏开关关闭时不剥离（工程栏显式携带上下文）', () => {
  const result = sanitizeSearchQuery('M:\\proj\\main.c 问题', false);
  assert.equal(result.query, 'M:\\proj\\main.c 问题');
  assert.deepEqual(result.stripped, []);
});

test('query-sanitize: 干净查询零改动', () => {
  const result = sanitizeSearchQuery('STM32F103 最小系统 电源要求');
  assert.equal(result.query, 'STM32F103 最小系统 电源要求');
  assert.deepEqual(result.stripped, []);
  assert.deepEqual(result.warnings, []);
});
