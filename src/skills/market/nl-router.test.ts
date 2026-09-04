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

const B11_TRIGGERS: InstalledSkillWithTriggers[] = [
  {
    name: 'prd-template',
    triggers: ['PRD模板', 'PRD 模板', '生成PRD', '写PRD', '产品需求文档模板', '需求文档模板'],
  },
  {
    name: 'tech-selection',
    triggers: ['选型模板', '选型对比模板', '技术选型模板', '生成选型对比', '选型对比表', '方案对比模板'],
  },
];

const BUDGET_TRIGGERS: InstalledSkillWithTriggers[] = [
  {
    name: 'expense-tracker',
    triggers: ['记账', '记一笔', '记个账', '查预算', '查一下预算', '查查预算', '看看预算', '预算查询', '预算还剩', '剩余预算', '预算余额', '拨款', '花销', '支出'],
  },
];

const USER_STORY_TRIGGERS: InstalledSkillWithTriggers[] = [
  {
    name: 'user-story',
    triggers: ['用户故事模板', '生成用户故事', '写用户故事', '写个用户故事', '拆用户故事', '故事拆解模板', '拆解用户故事'],
  },
];

const INTERFACE_CONTRACT_TRIGGERS: InstalledSkillWithTriggers[] = [
  {
    name: 'interface-contract',
    triggers: ['接口契约模板', '生成接口契约', '写接口契约', '接口契约生成', '契约模板', '生成C头文件', '生成c头文件', '生成头文件', '生成JSON Schema', '生成json schema'],
  },
];

const MILESTONE_REVIEW_TRIGGERS: InstalledSkillWithTriggers[] = [
  {
    name: 'milestone-review',
    triggers: ['里程碑复盘模板', '生成里程碑复盘', '写里程碑复盘', '里程碑复盘生成', '做里程碑复盘', '里程碑复盘一下', '复盘模板', '生成复盘', '写复盘', '阶段复盘模板'],
  },
];

const PROACTIVE_TRIGGERS: InstalledSkillWithTriggers[] = [
  {
    name: 'proactive-assistant',
    triggers: ['主动提醒', '有什么建议', '主动建议', '帮我看看要注意什么', '看看有什么要注意', '预判一下', '有什么要留意的', '有眼力见'],
  },
];

const NOTIFICATION_HUB_TRIGGERS: InstalledSkillWithTriggers[] = [
  {
    name: 'notification-hub',
    triggers: ['通知汇总', '消息聚合', '每日简报', '通知中心', '看看有什么通知', '聚合通知', '汇总通知', '秘书日报', '通知简报'],
  },
];

test('matchInstalledSkillTrigger：查预算命中 expense-tracker（E308）', () => {
  const hit = matchInstalledSkillTrigger('帮我查一下预算', BUDGET_TRIGGERS);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'expense-tracker');
});

test('matchInstalledSkillTrigger：用户故事模板命中 user-story（E310）', () => {
  const hit = matchInstalledSkillTrigger('帮我生成一个网关告警推送的用户故事模板', USER_STORY_TRIGGERS);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'user-story');
});

test('matchInstalledSkillTrigger：写个用户故事 命中 user-story（E310 自然问法）', () => {
  const hit = matchInstalledSkillTrigger('帮我写个用户故事', USER_STORY_TRIGGERS);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'user-story');
});

test('matchInstalledSkillTrigger：知识问法不抢——用户故事是什么 不命中（E310 防误触）', () => {
  assert.equal(matchInstalledSkillTrigger('用户故事是什么', USER_STORY_TRIGGERS), null);
  assert.equal(matchInstalledSkillTrigger('如何写故事', USER_STORY_TRIGGERS), null);
});

test('matchInstalledSkillTrigger：接口契约模板命中 interface-contract（E311）', () => {
  const hit = matchInstalledSkillTrigger('帮我生成一个STM32与蓝牙模块的接口契约模板', INTERFACE_CONTRACT_TRIGGERS);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'interface-contract');
});

test('matchInstalledSkillTrigger：生成C头文件 命中 interface-contract（E311 自然问法）', () => {
  const hit = matchInstalledSkillTrigger('生成C头文件', INTERFACE_CONTRACT_TRIGGERS);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'interface-contract');
});

test('matchInstalledSkillTrigger：知识问法不抢——接口契约是什么 不命中（E311 防误触）', () => {
  assert.equal(matchInstalledSkillTrigger('接口契约是什么', INTERFACE_CONTRACT_TRIGGERS), null);
  assert.equal(matchInstalledSkillTrigger('什么是接口定义', INTERFACE_CONTRACT_TRIGGERS), null);
});

test('matchInstalledSkillTrigger：生成里程碑复盘 命中 milestone-review（E312）', () => {
  const hit = matchInstalledSkillTrigger('帮我生成一个智能网关项目的里程碑复盘模板', MILESTONE_REVIEW_TRIGGERS);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'milestone-review');
});

test('matchInstalledSkillTrigger：做里程碑复盘 命中 milestone-review（E312 自然问法）', () => {
  const hit = matchInstalledSkillTrigger('帮我们做里程碑复盘', MILESTONE_REVIEW_TRIGGERS);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'milestone-review');
});

test('matchInstalledSkillTrigger：知识问法不抢——里程碑复盘是什么 不命中（E312 防误触）', () => {
  assert.equal(matchInstalledSkillTrigger('里程碑复盘是什么', MILESTONE_REVIEW_TRIGGERS), null);
  assert.equal(matchInstalledSkillTrigger('什么是复盘', MILESTONE_REVIEW_TRIGGERS), null);
  assert.equal(matchInstalledSkillTrigger('阶段复盘怎么做', MILESTONE_REVIEW_TRIGGERS), null);
});

test('matchInstalledSkillTrigger：主动提醒 命中 proactive-assistant（E313）', () => {
  const hit = matchInstalledSkillTrigger('帮我主动提醒一下', PROACTIVE_TRIGGERS);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'proactive-assistant');
});

test('matchInstalledSkillTrigger：有什么建议 命中 proactive-assistant（E313 自然问法）', () => {
  const hit = matchInstalledSkillTrigger('我最近有什么建议吗', PROACTIVE_TRIGGERS);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'proactive-assistant');
});

test('matchInstalledSkillTrigger：提醒我 不抢 reminder 专属意图（E313 避让）', () => {
  assert.equal(matchInstalledSkillTrigger('提醒我明天开会', PROACTIVE_TRIGGERS), null);
});

test('matchInstalledSkillTrigger：通知汇总 命中 notification-hub（E314）', () => {
  const hit = matchInstalledSkillTrigger('帮我做今天的通知汇总', NOTIFICATION_HUB_TRIGGERS);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'notification-hub');
});

test('matchInstalledSkillTrigger：秘书日报 最长触发词优先于 docx-write 日报（E314）', () => {
  const combined = [...DOCX_WRITE_TRIGGERS, ...NOTIFICATION_HUB_TRIGGERS];
  const hit = matchInstalledSkillTrigger('生成今天的秘书日报', combined);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'notification-hub');
});

test('matchInstalledSkillTrigger：知识问法不抢——通知是什么 不命中（E314 防误触）', () => {
  assert.equal(matchInstalledSkillTrigger('通知是什么', NOTIFICATION_HUB_TRIGGERS), null);
  assert.equal(matchInstalledSkillTrigger('日报怎么写', NOTIFICATION_HUB_TRIGGERS), null);
});

test('matchInstalledSkillTrigger：裸「预算」不命中 expense-tracker（E308 防误触）', () => {
  assert.equal(matchInstalledSkillTrigger('项目预算怎么算', BUDGET_TRIGGERS), null);
  assert.equal(matchInstalledSkillTrigger('预算是什么', BUDGET_TRIGGERS), null);
});

test('matchInstalledSkillTrigger：生成 PRD 模板命中 prd-template（E307）', () => {
  const hit = matchInstalledSkillTrigger('帮我生成智能家居网关 PRD 模板', B11_TRIGGERS);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'prd-template');
});

test('matchInstalledSkillTrigger：写PRD 命中 prd-template（E307）', () => {
  const hit = matchInstalledSkillTrigger('帮我写PRD', B11_TRIGGERS, 3);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'prd-template');
});

test('matchInstalledSkillTrigger：选型对比模板命中 tech-selection（E307）', () => {
  const hit = matchInstalledSkillTrigger('生成 STM32 vs ESP32 选型对比模板', B11_TRIGGERS);
  assert.ok(hit);
  assert.equal(hit?.skillName, 'tech-selection');
});

test('matchInstalledSkillTrigger：知识问法不抢——PRD是什么 不命中（E307 防误触）', () => {
  assert.equal(matchInstalledSkillTrigger('PRD是什么', B11_TRIGGERS), null);
  assert.equal(matchInstalledSkillTrigger('产品需求文档是什么', B11_TRIGGERS), null);
});

test('matchInstalledSkillTrigger：知识问法不抢——选型对比 不命中（E307 防误触）', () => {
  assert.equal(matchInstalledSkillTrigger('STM32 vs ESP32 选型对比', B11_TRIGGERS), null);
  assert.equal(matchInstalledSkillTrigger('技术选型怎么做', B11_TRIGGERS), null);
});

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

test('renderMarketSkillAnswer：剥离 Windows \r\n npm 横幅（E330）', () => {
  const answer = renderMarketSkillAnswer({
    name: 'reminder',
    version: '0.1.0',
    results: [
      {
        ok: true,
        step: 'npm run market:reminder -- @input',
        stdout:
          '\r\n> ai-butler-v01@0.1.0 market:reminder\r\n' +
          '> tsx scripts/market-reminder.ts C:\\input.txt\r\n' +
          '  {\r\n    "ok": true,\r\n    "action": "add"\r\n  }\r\n',
        stderr: '',
      },
    ],
  });
  assert.ok(answer.includes('"ok": true'));
  assert.equal(answer.includes('ai-butler-v01'), false);
  assert.equal(answer.includes('market:reminder'), false);
});
