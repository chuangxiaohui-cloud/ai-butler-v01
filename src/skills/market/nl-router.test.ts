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

const DOCX_WRITE_TRIGGERS: InstalledSkillWithTriggers[] = [
  {
    name: 'docx-write',
    triggers: ['日报模板', '周报模板', '生成日报', '生成周报', '日报 模板', '周报 模板', '生成 日报', '生成 周报', '写日报', '写周报', '日报', '周报', 'docx 排版', '文本转 docx'],
  },
];

test('matchInstalledSkillTrigger：自然问法带空格命中「日报 模板」（E305）', () => {
  const hit = matchInstalledSkillTrigger('帮我生成 日报 模板', DOCX_WRITE_TRIGGERS);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'docx-write');
  assert.equal(hit?.triggerLength, '日报 模板'.length);
});

test('matchInstalledSkillTrigger：「写日报」命中（≥3 字，直连路由下仍生效）（E305）', () => {
  const hit = matchInstalledSkillTrigger('帮我写日报', DOCX_WRITE_TRIGGERS, 3);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'docx-write');
});

test('matchInstalledSkillTrigger：「搜周报的邮件」不被 2 字「周报」抢占（E301 回归 + E305 新触发词）', () => {
  const hit = matchInstalledSkillTrigger('搜周报的邮件', DOCX_WRITE_TRIGGERS, 3);
  assert.equal(hit, null);
});

test('matchInstalledSkillTrigger：「如何解析 datasheet 表格」不命中 docx-write（E305 防误触）', () => {
  const hit = matchInstalledSkillTrigger('如何解析 PDF datasheet 表格', DOCX_WRITE_TRIGGERS, 2);
  assert.equal(hit, null);
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

test('renderMarketSkillAnswer：剥离 npm 横幅并收敛 github-project 输出', () => {
  const answer = renderMarketSkillAnswer({
    name: 'github-project',
    version: '0.1.0',
    results: [
      {
        ok: true,
        step: 'npm run market:github:project -- @input',
        stdout:
          '> ai-butler-v01@0.1.0 market:github:project\n' +
          '> tsx scripts/market-github-project.ts C:\\input.txt\n\n' +
          '【openclaw/openclaw】README 级判断\n' +
          '定位：OpenClaw 是个人 AI 助手。\n' +
          '健康分：64/100',
        stderr: '',
      },
    ],
  });
  assert.ok(answer.includes('【openclaw/openclaw】'));
  assert.equal(answer.includes('ai-butler-v01'), false);
  assert.equal(answer.includes('market:github:project'), false);
});
