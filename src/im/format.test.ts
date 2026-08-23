import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { adaptReply, DEFAULT_IM_MAX_LENGTH } from './format.js';

test('im-format: 短正文原样返回（§4.5 输出适配）', () => {
  const reply = adaptReply('STM32F103C8T6 最大主频 72MHz。');
  assert.equal(reply.text, 'STM32F103C8T6 最大主频 72MHz。');
  assert.equal(reply.truncated, undefined);
});

test('im-format: 长报告截断 + 附件提示，避免刷屏', () => {
  const long = '这是深度报告。' + '内容填充内容填充内容填充内容填充。'.repeat(40);
  const reply = adaptReply(long, { maxLength: 100 });
  assert.equal(reply.truncated, true);
  assert.ok(reply.text.length <= 130, '截断后长度可控');
  assert.match(reply.text, /已截断/);
  assert.ok(reply.attachmentHint, '长报告给附件/链接提示');
  assert.ok(!reply.text.includes('内容填充'.repeat(20)), '不保留超长正文');
});

test('im-format: 自定义附件提示透传', () => {
  const reply = adaptReply('x'.repeat(600), { maxLength: 500, attachmentHint: '完整报告见附件 report.md' });
  assert.equal(reply.attachmentHint, '完整报告见附件 report.md');
  assert.equal(reply.truncated, true);
});

test('im-format: 默认上限为 500 字符', () => {
  assert.equal(DEFAULT_IM_MAX_LENGTH, 500);
  const short = 'a'.repeat(500);
  const reply = adaptReply(short);
  assert.equal(reply.truncated, undefined);
  assert.equal(adaptReply('a'.repeat(501)).truncated, true);
});
