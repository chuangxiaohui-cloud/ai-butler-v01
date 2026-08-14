import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildEmergencyReply } from './emergency-reply.js';

test('emergency-reply: 蛇咬给出秘书式场景步骤', () => {
  const reply = buildEmergencyReply('在野外被不知名的蛇咬了，怎么办');
  assert.ok(reply.includes('120'));
  assert.ok(reply.includes('不要用嘴吸'));
  assert.ok(reply.includes('以专业救援或医生判断为准'));
  assert.ok(reply.includes('尽量少动'));
  assert.ok(reply.includes('不疼不肿也不能拖'));
});

test('emergency-reply: 通用紧急兜底有步骤且有温度', () => {
  const reply = buildEmergencyReply('有人突然晕倒了');
  assert.ok(reply.includes('120'));
  assert.ok(reply.includes('不要给昏迷者喂水'));
  assert.ok(reply.includes('我会一直陪你到救援接手'));
});

test('emergency-reply: 火灾场景明确不乘电梯', () => {
  const reply = buildEmergencyReply('家里着火了怎么办');
  assert.ok(reply.includes('119'));
  assert.ok(reply.includes('不乘电梯'));
  assert.ok(reply.includes('以专业救援或医生判断为准'));
});

test('emergency-reply: 狗咬不走蛇咬话术', () => {
  const reply = buildEmergencyReply('被外面的狗咬伤了怎么办');
  assert.ok(reply.includes('狂犬疫苗'));
  assert.ok(reply.includes('冲洗伤口'));
  assert.ok(!reply.includes('追打或抓蛇'));
});
