import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  buildConfirmHoldAnswer,
  executorActionLabel,
  isConfirmWriteExecutor,
  parseApprovalReply,
  restateForUser,
} from './confirm-gate.js';

test('confirm-gate: E324 写类执行器试点清单命中与文案', () => {
  for (const executor of [
    'project_writer',
    'content_writer',
    'office_daily',
    'calendar_skill',
    'im_dispatch',
    'project_packager',
  ]) {
    assert.equal(isConfirmWriteExecutor(executor), true, `${executor} 应命中试点清单`);
  }
  assert.equal(isConfirmWriteExecutor(undefined), false);
  assert.equal(isConfirmWriteExecutor('knowledge_qa'), false, '知识问答执行器不拦');
  assert.equal(isConfirmWriteExecutor('project_writer '), false, '带空白不误命中（executor 来自路由，原样比较）');
  const answer = buildConfirmHoldAnswer('office_daily', '给张三发一封邮件约下周会议');
  assert.ok(answer.includes('发送/处理邮件'), answer);
  assert.ok(answer.includes('执行'), answer);
  assert.ok(answer.includes('取消'), answer);
  assert.ok(executorActionLabel('calendar_skill').includes('日程'));
});

test('confirm-gate: E326 复述人称切换——AI 侧用「你」复述用户请求', () => {
  const query = '帮我安排一下我家里明天的亲子游行程安排';
  assert.equal(restateForUser(query), '帮你安排一下你家里明天的亲子游行程安排');
  const answer = buildConfirmHoldAnswer('calendar_skill', query);
  assert.ok(answer.includes('你让我“帮你安排一下你家里明天的亲子游行程安排”'), answer);
  assert.ok(!answer.includes('“帮我'), answer);
  assert.ok(!answer.includes('我家里'), answer);
});

test('confirm-gate: E324 批准/取消整句识别与防误伤', () => {
  // 批准命中（允许首尾空白、标点、语气词）
  for (const text of ['执行', ' 执行 ', '执行吧', '批准', '同意', '确认。', '继续', '可以', '好的', '行', '没问题', '就这么办', '执行呀', '来吧']) {
    assert.equal(parseApprovalReply(text), 'approve', `「${text}」应识别为批准`);
  }
  // 取消命中
  for (const text of ['取消', '取消。', '否决', '不执行', '别执行', '放弃', '算了', '不要', '不做了']) {
    assert.equal(parseApprovalReply(text), 'reject', `「${text}」应识别为取消`);
  }
  // 正文/复合句不误伤（仅整句匹配）
  assert.equal(parseApprovalReply('帮我写一份批准的邮件草稿'), null);
  assert.equal(parseApprovalReply('这个方案怎么执行'), null);
  assert.equal(parseApprovalReply('不要的功能点先列一下'), null);
  assert.equal(parseApprovalReply(''), null);
  assert.equal(parseApprovalReply('   '), null);
});
