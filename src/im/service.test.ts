import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ImGate } from './gate.js';
import { ImService, type ImAsk } from './service.js';
import type { ImInboundMessage } from './types.js';

function makeService(overrides: { answers?: Map<string, string>; maxLength?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'im-service-'));
  const gate = new ImGate(join(dir, 'gate.json'));
  const asked: Array<{ text: string; conversationId: string }> = [];
  const answers = overrides.answers ?? new Map([['default', '这是秘书的回答。']]);
  const ask: ImAsk = async (text, conversationId) => {
    asked.push({ text, conversationId });
    return { answer: answers.get(text) ?? answers.get('default') ?? '' };
  };
  const service = new ImService({ ask, gate, maxLength: overrides.maxLength ?? 500 });
  return { service, gate, asked, dir };
}

function msg(text: string, sessionKey = 'wx_zhang'): ImInboundMessage {
  return { id: 'm1', platform: 'wechat', sessionKey, isGroup: false, text, ts: Date.now() };
}

test('im-service: 未授权平台拒绝，提示先绑定（§4.5 授权开关）', async () => {
  const { service, gate, dir } = makeService();
  try {
    const result = await service.route(msg('STM32 主频多少'));
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /未授权/);
    assert.match(result.error ?? '', /绑定/);
    assert.equal(result.conversationId, undefined);

    gate.enable('wechat');
    const ok = await service.route(msg('STM32 主频多少'));
    assert.equal(ok.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('im-service: 复用同一问答契约并透传会话隔离 conversationId', async () => {
  const { service, gate, asked, dir } = makeService();
  try {
    gate.enable('wechat');
    const r1 = await service.route(msg('问题A', 'wx_userA'));
    const r2 = await service.route(msg('问题B', 'wx_userB'));
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.equal(asked.length, 2);
    assert.equal(asked[0]?.text, '问题A');
    assert.match(asked[0]?.conversationId ?? '', /^im-wechat-/);
    assert.notEqual(asked[0]?.conversationId, asked[1]?.conversationId, '用户间会话隔离');
    // 同用户再次提问 conversationId 稳定
    const r3 = await service.route(msg('问题C', 'wx_userA'));
    assert.equal(asked[2]?.conversationId, asked[0]?.conversationId);
    assert.equal(r1.conversationId, r3.conversationId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('im-service: 空消息拒绝', async () => {
  const { service, gate, dir } = makeService();
  try {
    gate.enable('wechat');
    const result = await service.route(msg('   '));
    assert.equal(result.ok, false);
    assert.equal(result.error, '空消息');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('im-service: 长回答输出适配截断 + 附件提示（§4.5）', async () => {
  const long = '深度报告正文。' + '填充内容填充内容。'.repeat(80);
  const { service, gate, dir } = makeService({ answers: new Map([['写报告', long]]), maxLength: 120 });
  try {
    gate.enable('wechat');
    const result = await service.route(msg('写报告'));
    assert.equal(result.ok, true);
    assert.equal(result.reply?.truncated, true);
    assert.match(result.reply?.text ?? '', /已截断/);
    assert.ok(result.reply?.attachmentHint);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
