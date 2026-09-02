import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { SessionTurn } from '../memory/session-context.js';
import {
  correctionEscalationMessage,
  countConsecutiveCorrections,
  escalationMessage,
  failureEscalationMessage,
  isUserCorrection,
  lowConfidenceHonestMessage,
} from './escalation.js';

function turn(role: SessionTurn['role'], text: string): SessionTurn {
  return { id: `${role}-${text}`, role, text, ts: '' };
}

test('escalation: isUserCorrection 命中纠正词', () => {
  for (const t of ['不对', '还是不对', '错了', '不是这样', '你理解错了', '重新来', '换个思路', '好像不对']) {
    assert.equal(isUserCorrection(t), true, t);
  }
});

test('escalation: isUserCorrection 不误伤普通问句', () => {
  for (const t of ['这个代码哪里不对？', '怎么对齐？', '换一个思路讲解一下', '帮忙检查一下']) {
    assert.equal(isUserCorrection(t), false, t);
  }
});

test('escalation: countConsecutiveCorrections 倒序连续计数', () => {
  const turns = [
    turn('user', '写个模板'),
    turn('assistant', '好'),
    turn('user', '不对'),
    turn('assistant', '调整'),
    turn('user', '还是不对'),
  ];
  assert.equal(countConsecutiveCorrections(turns), 2);
});

test('escalation: countConsecutiveCorrections 中断归零与空会话', () => {
  const interrupted = [
    turn('user', '不对'),
    turn('assistant', '调整'),
    turn('user', '这次对了，继续'),
    turn('assistant', '好'),
    turn('user', '不对'),
  ];
  assert.equal(countConsecutiveCorrections(interrupted), 1);
  assert.equal(countConsecutiveCorrections([]), 0);
  assert.equal(countConsecutiveCorrections([turn('assistant', '你好')]), 0);
});

test('escalation: 三分支文案互不相同且含求助语义', () => {
  const capability = escalationMessage('capability');
  const information = escalationMessage('information');
  const tool = escalationMessage('tool');
  assert.notEqual(capability, information);
  assert.notEqual(information, tool);
  assert.match(capability, /超出我的知识范围/);
  assert.match(information, /提供更多信息/);
  assert.match(tool, /额外的软件\/工具/);
});

test('escalation: P-47/P-48 阈值消息与 P-16 诚实文案', () => {
  assert.match(failureEscalationMessage(), /停止继续重试/);
  assert.match(correctionEscalationMessage(), /我换个方向/);
  assert.match(lowConfidenceHonestMessage(0.2), /我不确定/);
});
