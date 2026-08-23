import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { LLMClient } from './llm-client.js';
import {
  DeepReportCancelledError,
  generateDeepReport,
  type DeepReportEvidenceItem,
} from './deep-report.js';

const evidence: DeepReportEvidenceItem[] = [
  { title: 'STM32F103 数据手册', url: 'https://example.com/1', domain: 'example.com', score: 0.92, type: '[hard]' },
  { title: 'STM32 应用笔记', url: 'https://example.com/2', domain: 'example.com', score: 0.8, type: '[soft]' },
  { title: '选型指南', url: 'https://example.com/3', domain: 'example.com', score: 0.7, type: '[soft]' },
];

class FakeLLM implements LLMClient {
  calls = 0;

  constructor(
    private readonly mode: 'ok' | 'hang' | 'fail' = 'ok',
  ) {}

  async complete(messages: Array<{ role: string; content: string }>): Promise<string> {
    this.calls++;
    const userContent = messages[messages.length - 1]?.content ?? '';
    if (this.mode === 'hang') {
      return await new Promise<never>(() => {});
    }
    if (this.mode === 'fail') {
      throw new Error('provider down');
    }
    if (userContent.includes('大纲')) {
      return '概述\n关键发现\n应用场景';
    }
    return `本节内容（引用 https://example.com/1）：${userContent.slice(0, 24)}`;
  }
}

test('deep-report: LLM 路径分阶段生成 + 证据附录', async () => {
  const llm = new FakeLLM();
  const stages: string[] = [];
  const result = await generateDeepReport('STM32 调研', evidence, {
    llm,
    onStage: (s) => stages.push(s),
    synthesis: '已有摘要',
  });
  assert.equal(result.source, 'llm');
  assert.equal(result.sections.length, 3);
  assert.ok(result.sections[0].startsWith('## 概述'));
  assert.equal(result.evidenceAppendix.length, 3);
  assert.match(result.report, /^# STM32 调研/);
  assert.match(result.report, /## 证据附录/);
  assert.ok(result.report.includes('https://example.com/1'));
  assert.ok(stages.includes('report-outline'));
  assert.ok(stages.includes('report-section-1'));
  assert.ok(stages.includes('report-section-3'));
  assert.ok(stages.includes('report-evidence'));
  assert.equal(result.timedOut, false);
});

test('deep-report: 预算超时快速降级，不等待挂起 LLM', async () => {
  const llm = new FakeLLM('hang');
  const start = Date.now();
  const result = await generateDeepReport('STM32 调研', evidence, {
    llm,
    budgetMs: 60,
    synthesis: '已有摘要',
  });
  assert.ok(Date.now() - start < 2000, '预算超时必须快速返回');
  assert.equal(result.timedOut, true);
  assert.equal(result.source, 'fallback');
  assert.ok(result.sections.length >= 1);
  assert.ok(result.report.includes('## 证据附录'));
});

test('deep-report: 无 LLM 时规则组装降级（概述取 synthesis）', async () => {
  const result = await generateDeepReport('STM32 调研', evidence, {
    synthesis: '这是合成摘要',
  });
  assert.equal(result.source, 'fallback');
  assert.ok(result.report.includes('这是合成摘要'));
  assert.ok(result.report.includes('## 关键发现'));
  assert.ok(result.report.includes('## 来源要点'));
  assert.ok(result.report.includes('## 证据附录'));
});

test('deep-report: LLM 失败同样降级为规则组装', async () => {
  const llm = new FakeLLM('fail');
  const result = await generateDeepReport('STM32 调研', evidence, {
    llm,
    synthesis: '合成摘要',
  });
  assert.equal(result.source, 'fallback');
  assert.ok(result.report.includes('合成摘要'));
  assert.equal(result.timedOut, false);
});

test('deep-report: 预中止信号直接抛 DeepReportCancelledError', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => generateDeepReport('STM32 调研', evidence, { signal: controller.signal }),
    DeepReportCancelledError,
  );
});

test('deep-report: 生成中取消抛 DeepReportCancelledError', async () => {
  const llm = new FakeLLM('hang');
  const controller = new AbortController();
  const promise = generateDeepReport('STM32 调研', evidence, {
    llm,
    signal: controller.signal,
    budgetMs: 10_000,
  });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(() => promise, DeepReportCancelledError);
});

test('deep-report: sectionCount 可调小（测试/预算优先）', async () => {
  const llm = new FakeLLM();
  const result = await generateDeepReport('STM32 调研', evidence, {
    llm,
    sectionCount: 1,
  });
  assert.equal(result.sections.length, 1);
});
