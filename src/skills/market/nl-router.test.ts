import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  matchInstalledSkillTrigger,
  renderMarketSkillAnswer,
  type InstalledSkillWithTriggers,
} from './nl-router.js';

const installed: InstalledSkillWithTriggers[] = [
  { name: 'weekly-report', triggers: ['周报', '周报模板', 'weekly report'] },
  { name: 'bom-diff', triggers: ['BOM 对比', 'bom 差异'] },
];

test('matchInstalledSkillTrigger：最长触发词优先', () => {
  const hit = matchInstalledSkillTrigger('帮我写一份本周周报模板', installed);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'weekly-report');
  assert.equal(hit?.triggerLength, '周报模板'.length);
});

test('matchInstalledSkillTrigger：大小写不敏感（英文触发词）', () => {
  const hit = matchInstalledSkillTrigger('please write a Weekly Report for me', installed);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'weekly-report');
});

test('matchInstalledSkillTrigger：BOM 对比命中较长触发词', () => {
  const hit = matchInstalledSkillTrigger('两个 BOM 差异在哪', installed);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'bom-diff');
});

test('matchInstalledSkillTrigger：无命中返回 null', () => {
  assert.equal(matchInstalledSkillTrigger('STM32 最大主频是多少', installed), null);
});

test('matchInstalledSkillTrigger：minTriggerLength 守卫过滤短触发词', () => {
  const short: InstalledSkillWithTriggers[] = [{ name: 'x', triggers: ['a'] }];
  assert.equal(matchInstalledSkillTrigger('abc', short, 2), null);
  assert.ok(matchInstalledSkillTrigger('abc', short, 1));
});

test('renderMarketSkillAnswer：拼接步骤 stdout 并有界截断', () => {
  const answer = renderMarketSkillAnswer({
    name: 'bom-diff',
    version: '0.1.0',
    results: [
      { ok: true, step: 'echo a', stdout: 'A 差异', stderr: '' },
      { ok: true, step: 'echo b', stdout: 'B 差异', stderr: '' },
    ],
  });
  assert.ok(answer.includes('A 差异'));
  assert.ok(answer.includes('B 差异'));
});

test('renderMarketSkillAnswer：无文本输出时给摘要兜底', () => {
  const answer = renderMarketSkillAnswer({
    name: 'bom-diff',
    version: '0.1.0',
    results: [{ ok: true, step: 'true', stdout: '', stderr: '' }],
  });
  assert.ok(answer.includes('bom-diff v0.1.0'));
  assert.ok(answer.includes('1 步'));
});

test('renderMarketSkillAnswer：失败步骤透出 stderr 摘要', () => {
  const answer = renderMarketSkillAnswer({
    name: 'bom-diff',
    version: '0.1.0',
    results: [{ ok: false, step: 'badcmd', stdout: '', stderr: 'command not found' }],
  });
  assert.ok(answer.includes('badcmd'));
  assert.ok(answer.includes('command not found'));
});