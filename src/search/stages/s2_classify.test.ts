import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from '../llm.js';
import { classifyQuery } from './s2_classify.js';

class FakeLLM implements LLMClient {
  constructor(private readonly handler: (messages: ChatMessage[]) => string) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    return this.handler(messages);
  }
}

const fakeOk = new FakeLLM((messages) => {
  const user = messages.find((m) => m.role === 'user')?.content ?? '';
  const intent = user.includes('对比') ? 'comparison' : 'factual';
  return JSON.stringify({
    intent,
    search_query: `${user} 检索词`,
    time_window: '≤1年',
    domain: '官方优先',
  });
});

const fakeBroken = new FakeLLM(() => '这不是 JSON');

const fakeError = new FakeLLM(() => {
  throw new Error('timeout');
});

const fakeAbort = new FakeLLM(() => {
  const err = new Error('abort');
  err.name = 'AbortError';
  throw err;
});

test('s2: LLM 合法 JSON 解析为结构化意图', async () => {
  const r = await classifyQuery('KiCad 和 Altium Designer 对比 优缺点', fakeOk);
  assert.equal(r.intent, 'comparison');
  assert.ok(r.searchQuery.includes('检索词'));
  assert.equal(r.timeWindow, '≤1年');
  assert.equal(r.source, 'llm');
});

test('s2: 软件版本查询固定走 factual + 官方优先', async () => {
  const r = await classifyQuery('openclaw最新版本号是多少', fakeOk);
  assert.equal(r.intent, 'factual');
  assert.equal(r.domain, '官方优先');
  assert.equal(r.source, 'rule');
});

test('s2: 强时效状态问题规则优先为 news', async () => {
  const r = await classifyQuery('中国空间站现在有哪几个航天员在太空', fakeOk);
  assert.equal(r.intent, 'news');
  assert.equal(r.timeWindow, '≤24h');
  assert.equal(r.source, 'rule');
});

test('s2: 非法 JSON 降级为 factual', async () => {
  const r = await classifyQuery('STM32F103C8T6 最大主频是多少', fakeBroken);
  assert.equal(r.intent, 'factual');
  assert.equal(r.searchQuery, 'STM32F103C8T6 最大主频是多少');
  assert.equal(r.source, 'fallback');
});

test('s2: 超时/异常降级为 factual', async () => {
  const r = await classifyQuery('TPS5430 输入电压范围', fakeError);
  assert.equal(r.intent, 'factual');
  assert.equal(r.source, 'fallback');
});

test('s2: AbortError 记录 timedOut 并降级', async () => {
  const r = await classifyQuery('TPS5430 输入电压范围', fakeAbort);
  assert.equal(r.intent, 'factual');
  assert.equal(r.source, 'fallback');
  assert.equal(r.timedOut, true);
});

test('s2: WP1 10 条基准 query 分类解析链路 100% 命中', async () => {
  const expected: Array<[string, string]> = [
    ['E01', 'factual'],
    ['E02', 'factual'],
    ['E04', 'experience'],
    ['E06', 'experience'],
    ['E08', 'comparison'],
    ['E11', 'how_to'],
    ['E14', 'troubleshooting'],
    ['S02', 'factual'],
    ['L05', 'factual'],
    ['E16', 'troubleshooting'],
  ];
  const byId = new Map(expected);
  const queries = [
    ['E01', 'STM32F103C8T6 最大主频是多少'],
    ['E02', 'TPS5430 输入电压范围'],
    ['E04', 'STM32F103 ADC 多通道采集 踩坑 经验'],
    ['E06', 'MOSFET 栅极驱动电阻 选型 注意事项'],
    ['E08', 'KiCad 和 Altium Designer 对比 优缺点'],
    ['E11', 'Keil MDK JTAG 配置 步骤'],
    ['E14', 'STM32 HAL_UART_Transmit 阻塞 卡死'],
    ['S02', '高血压 用药注意事项 禁忌'],
    ['L05', '个人所得税 专项附加扣除 怎么申报'],
    ['E16', 'ESP32 I2C 通信失败 无应答'],
  ] as const;

  const fakeByQuery = new FakeLLM((messages) => {
    const user = messages.find((m) => m.role === 'user')?.content ?? '';
    const hit = queries.find(([, q]) => q === user);
    return JSON.stringify({ intent: hit ? byId.get(hit[0]) : 'factual', search_query: user });
  });

  let correct = 0;
  for (const [id, q] of queries) {
    const r = await classifyQuery(q, fakeByQuery);
    if (r.intent === byId.get(id)) correct += 1;
  }
  assert.equal(correct, queries.length);
});
