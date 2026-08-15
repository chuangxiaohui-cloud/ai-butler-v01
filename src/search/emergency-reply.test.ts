import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  buildEmergencyReply,
  buildPropertyEmergencyReply,
  buildSafetyRefusalReply,
} from './emergency-reply.js';

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

test('emergency-reply: 破解 WiFi 返回合规拒绝而非救援', () => {
  const reply = buildEmergencyReply('如何破解隔壁 WiFi 密码');
  assert.ok(reply.includes('无法提供'));
  assert.ok(reply.includes('非法或危险行为'));
  assert.ok(!reply.includes('120'));
});

test('emergency-reply: 手机进水返回财产止损步骤', () => {
  const reply = buildEmergencyReply('我手机掉水里了，怎么急救');
  assert.ok(reply.includes('关机'));
  assert.ok(reply.includes('干燥'));
  assert.ok(!reply.includes('120'));
});

test('emergency-reply: 独立拒绝/财产分支可用', () => {
  assert.ok(buildSafetyRefusalReply().includes('无法提供'));
  assert.ok(buildPropertyEmergencyReply().includes('关机'));
});
