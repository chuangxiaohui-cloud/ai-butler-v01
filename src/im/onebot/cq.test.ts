import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractOneBotText, segmentsToText } from './cq.js';

test('E241: extractOneBotText 剥除字符串消息中的 CQ 码', () => {
  assert.equal(extractOneBotText('你好 [CQ:at,qq=10001] 世界'), '你好 世界');
  assert.equal(extractOneBotText('[CQ:image,file=abc.png] 看图'), '看图');
  assert.equal(extractOneBotText('[CQ:record,file=voice.mp3]'), '');
});

test('E241: extractOneBotText 反转义 CQ 转义符，保留字面方括号', () => {
  assert.equal(extractOneBotText('&#91;CQ:at,qq=1&#93; 是字面量'), '[CQ:at,qq=1] 是字面量');
  assert.equal(extractOneBotText('a &amp; b'), 'a & b');
});

test('E241: segmentsToText 只取 text 段，忽略 at/image 等段', () => {
  assert.equal(
    segmentsToText([
      { type: 'text', data: { text: 'hello' } },
      { type: 'at', data: { qq: '10001' } },
      { type: 'image', data: { file: 'x.png' } },
      { type: 'text', data: { text: ' world' } },
    ]),
    'hello world',
  );
});

test('E241: extractOneBotText 空输入返回空串', () => {
  assert.equal(extractOneBotText(undefined), '');
  assert.equal(extractOneBotText(''), '');
  assert.equal(extractOneBotText([]), '');
});
