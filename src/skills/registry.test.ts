import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { findSkill, getSkills, toDisplayText } from './registry.js';

test('registry: 19 项 Skill 全量加载', () => {
  const skills = getSkills();
  assert.equal(skills.length, 19);
  const names = skills.map((s) => s.name);
  assert.deepEqual(
    names.sort(),
    [
      'browser-session',
      'chip-analysis',
      'circuit-topology',
      'calendar-skill',
      'color-recognition',
      'content-writer',
      'datasheet-speed',
      'delivery-workflow',
      'document-qa',
      'engineer',
      'github-reader',
      'image-analysis',
      'im-dispatch',
      'industry-kits',
      'jargon-map',
      'knowledge-qa',
      'plan-validation',
      'project-packager',
      'quote-compare',
    ].sort(),
  );
});

test('registry: 核心 2 项经 wrapLegacySkill 可执行', async () => {
  const chip = getSkills().find((s) => s.name === 'chip-analysis');
  const jargon = getSkills().find((s) => s.name === 'jargon-map');
  assert.ok(chip);
  assert.ok(jargon);
  const deps = { callVLM: async () => '' };
  const chipOut = await chip.execute(
    { query: 'STM32F103C8T6 最大主频是多少', attachmentSignals: [], rawFiles: [], memory: null },
    deps,
  );
  const chipResult = chipOut.result as {
    partNumber: string;
    supported: boolean;
  };
  assert.equal(chipResult.partNumber, 'STM32F103C8T6');
  assert.equal(chipResult.supported, true);
  const jargonOut = await jargon.execute(
    { query: 'Protel 怎么画四层板', attachmentSignals: [], rawFiles: [], memory: null },
    deps,
  );
  const jargonResult = jargonOut.result as {
    matched: Array<{ term: string; normalized: string }>;
    normalizedQuery: string;
  };
  assert.equal(jargonResult.matched[0].normalized, 'Altium Designer');
  assert.equal(jargonResult.normalizedQuery, 'Altium Designer 怎么画四层板');
});

test('registry: toDisplayText 拦截 JSON 泄漏并输出友好文本', () => {
  assert.equal(
    toDisplayText({ error: 'missing_time' }),
    '系统在处理您的请求时遇到了一点小问题，请稍后再试。',
  );
  assert.equal(
    toDisplayText({ ok: true, recipient: '老张', content: '明天开会', outboxId: '1' }),
    '操作已记录到本地待处理队列。',
  );
  assert.equal(toDisplayText({ events: [], count: 0 }), '共 0 条日程。');
  assert.equal(toDisplayText('正常回答'), '正常回答');
});

test('registry: findSkill 按触发器匹配', () => {
  assert.ok(findSkill('帮我分析 STM32 芯片').some((s) => s.name === 'chip-analysis'));
  assert.ok(findSkill('Protel 是什么').some((s) => s.name === 'jargon-map'));
  assert.ok(findSkill('帮我提取这张图的颜色').some((s) => s.name === 'color-recognition'));
  assert.ok(findSkill('总结这个文档').some((s) => s.name === 'document-qa'));
  assert.ok(findSkill('这个截图是什么').some((s) => s.name === 'image-analysis'));
  assert.ok(findSkill('小鸡啄米图是什么梗').some((s) => s.name === 'knowledge-qa'));
  assert.ok(findSkill('帮我写一份 PRD').some((s) => s.name === 'content-writer'));
  assert.ok(findSkill('帮我做项目规划').some((s) => s.name === 'delivery-workflow'));
  assert.ok(findSkill('给我一个上线检查清单').some((s) => s.name === 'delivery-workflow'));
  assert.ok(findSkill('校验一下这份任务清单').some((s) => s.name === 'plan-validation'));
  assert.ok(findSkill('帮我安排明天的会议').some((s) => s.name === 'calendar-skill'));
  assert.ok(findSkill('对比一下供应商报价').some((s) => s.name === 'quote-compare'));
  assert.ok(findSkill('发消息给老张').some((s) => s.name === 'im-dispatch'));
  assert.ok(findSkill('实现一个登录接口').some((s) => s.name === 'engineer'));
  assert.equal(findSkill('今天天气怎么样').length, 0);
});
