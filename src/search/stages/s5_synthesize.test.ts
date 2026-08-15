import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from '../llm.js';
import type { FusedOutput, FusionItem } from '../fusion.js';
import type { ClassifiedQuery } from './s2_classify.js';
import { synthesizeAnswer } from './s5_synthesize.js';

class FakeLLM implements LLMClient {
  constructor(private readonly handler: (messages: ChatMessage[]) => string) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    return this.handler(messages);
  }
}

function fusedItem(url: string): FusionItem {
  return {
    result: {
      title: 'STM32F103C8T6 主频',
      url,
      content: 'STM32F103C8T6 最大主频 72MHz 完整 参数 说明 步骤 示例 设计 文档 100A '.repeat(5),
      provider: 'bocha',
    },
    domainAuthority: 0.75,
    official: false,
    seoNoise: false,
    relevance: 1,
    answerCoverage: 1,
    timeliness: 0.5,
    usability: 0.8,
    factConsistency: 1,
    finalScore: 0.89,
  };
}

const fusedOk: FusedOutput = {
  items: [fusedItem('https://example.com/1')],
  dropped: [],
  gated: false,
  lowConfidence: false,
};

const fusedEmpty: FusedOutput = {
  items: [],
  dropped: [],
  gated: false,
  lowConfidence: true,
};

const classified: ClassifiedQuery = {
  intent: 'factual',
  searchQuery: 'STM32F103C8T6 最大主频是多少',
  timeWindow: '不限',
  domain: '官方优先',
  source: 'llm',
};

test('s5: LLM 合成答案并引用证据', async () => {
  const fake = new FakeLLM(() => '根据证据，这颗芯片最大主频是 72MHz。');
  const r = await synthesizeAnswer('STM32F103C8T6 最大主频是多少', fusedOk, classified, {
    llm: fake,
  });
  assert.equal(r.source, 'llm');
  assert.ok(r.answer.includes('72MHz'));
});

test('s5: 无证据时不硬答', async () => {
  const fake = new FakeLLM(() => '编造的答案');
  const r = await synthesizeAnswer('ESP32 I2C 通信失败 无应答', fusedEmpty, classified, {
    llm: fake,
  });
  assert.equal(r.source, 'fallback');
  assert.ok(!r.answer.includes('编造'));
});

test('s5: LLM 异常降级为证据摘要', async () => {
  const fake = new FakeLLM(() => {
    throw new Error('timeout');
  });
  const r = await synthesizeAnswer('STM32F103C8T6 最大主频是多少', fusedOk, classified, {
    llm: fake,
  });
  assert.equal(r.source, 'fallback');
  assert.ok(r.answer.includes('example.com'));
});

test('s5: 严肃通道追加专业提示约束', async () => {
  let systemPrompt = '';
  const fake = new FakeLLM((messages) => {
    systemPrompt = messages[0]?.content ?? '';
    return '答案';
  });
  await synthesizeAnswer('高血压 用药注意事项 禁忌', fusedOk, classified, {
    llm: fake,
    serious: true,
  });
  assert.ok(systemPrompt.includes('严肃领域'));
});

test('s5: 历史记忆注入合成上下文', async () => {
  let userContent = '';
  const fake = new FakeLLM((messages) => {
    userContent = messages[1]?.content ?? '';
    return '答案';
  });
  await synthesizeAnswer('STM32F103C8T6 最大主频是多少', fusedOk, classified, {
    llm: fake,
    memoryNotes: ['Q: 之前问过主频 → A: 72MHz'],
  });
  assert.ok(userContent.includes('历史记忆'));
  assert.ok(userContent.includes('之前问过主频'));
});

test('s5: 项目经验与命中技能注入合成上下文', async () => {
  let userContent = '';
  const fake = new FakeLLM((messages) => {
    userContent = messages[1]?.content ?? '';
    return '答案';
  });
  await synthesizeAnswer('STM32F103C8T6 最大主频是多少', fusedOk, classified, {
    llm: fake,
    experienceNotes: ['[chip-analysis] 最大主频 72MHz'],
    skillHints: ['chip-analysis'],
  });
  assert.ok(userContent.includes('项目经验'));
  assert.ok(userContent.includes('最大主频 72MHz'));
  assert.ok(userContent.includes('命中技能'));
  assert.ok(userContent.includes('chip-analysis'));
});

test('s5: 技能深度输出注入合成上下文', async () => {
  let userContent = '';
  const fake = new FakeLLM((messages) => {
    userContent = messages[1]?.content ?? '';
    return '答案';
  });
  await synthesizeAnswer('STM32F103C8T6 最大主频是多少', fusedOk, classified, {
    llm: fake,
    skillOutputs: ['chip-analysis v0.1.0: {"partNumber":"STM32F103C8T6","supported":true}'],
  });
  assert.ok(userContent.includes('技能深度分析'));
  assert.ok(userContent.includes('STM32F103C8T6'));
});

test('s5: 主镜片注入系统提示', async () => {
  let systemPrompt = '';
  const fake = new FakeLLM((messages) => {
    systemPrompt = messages[0]?.content ?? '';
    return '答案';
  });
  await synthesizeAnswer('帮我分析 STM32 芯片性能', fusedOk, classified, {
    llm: fake,
    primaryLens: 'architect',
  });
  assert.ok(systemPrompt.includes('当前主镜片：architect'));
});

test('s5: 用户要求举例时系统提示要求给可运行示例', async () => {
  let systemPrompt = '';
  const fake = new FakeLLM((messages) => {
    systemPrompt = messages[0]?.content ?? '';
    return '答案';
  });
  await synthesizeAnswer('函数指针是什么，给我写个简单的代码例子', fusedOk, classified, {
    llm: fake,
  });
  assert.ok(systemPrompt.includes('可运行'));
  assert.ok(systemPrompt.includes('不要只给文字描述'));
});

test('s5: 系统提示注入今天日期', async () => {
  let systemPrompt = '';
  const fake = new FakeLLM((messages) => {
    systemPrompt = messages[0]?.content ?? '';
    return '答案';
  });
  await synthesizeAnswer('STM32F103C8T6 最大主频是多少', fusedOk, classified, {
    llm: fake,
  });
  assert.match(systemPrompt, /\d{4}-\d{2}-\d{2}/);
});

test('s5: 强时效问题追加时效红线并暴露证据日期', async () => {
  let systemPrompt = '';
  let userContent = '';
  const fresh = fusedItem('https://example.com/1');
  fresh.result.published = '2026-08-10T00:00:00+08:00';
  const fake = new FakeLLM((messages) => {
    systemPrompt = messages[0]?.content ?? '';
    userContent = messages[1]?.content ?? '';
    return '答案';
  });
  await synthesizeAnswer(
    '中国空间站现在有哪几个航天员在太空',
    { ...fusedOk, items: [fresh] },
    { ...classified, intent: 'news' },
    { llm: fake },
  );
  assert.ok(systemPrompt.includes('时效红线'));
  assert.ok(userContent.includes('发布于 2026-08-10'));
});
