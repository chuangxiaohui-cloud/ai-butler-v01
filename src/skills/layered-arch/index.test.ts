import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createLayeredArchSkill } from './index.js';
import type { LLMClient } from '../../search/llm.js';
import type { SkillDeps } from '../deps.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'layered-arch-skill-test-'));
}

const DEPS: SkillDeps = { callVLM: async () => '' };

function fakeLLM(replies: string[]): { client: LLMClient; calls: string[] } {
  const calls: string[] = [];
  const client: LLMClient = {
    complete: async (messages) => {
      calls.push(messages[messages.length - 1]?.content ?? '');
      const reply = replies.shift();
      if (reply === undefined) throw new Error('LLM 无更多应答');
      return reply;
    },
  };
  return { client, calls };
}

const VALID_JSON = JSON.stringify({
  meta: { title: '嵌入式 FreeRTOS 框架', description: '示例' },
  layers: [
    { id: 'app', name: '应用层', order: 1, nodes: [{ id: 'task', name: '采集任务', detail: 'ADC/传感器' }] },
    {
      id: 'kernel',
      name: '内核层',
      order: 2,
      highlight: true,
      nodes: [
        { id: 'sched', name: '抢占式调度器', role: 'core' },
        { id: 'queue', name: '队列' },
      ],
    },
    { id: 'hw', name: '硬件层', order: 3, nodes: [{ id: 'mcu', name: 'MCU', detail: 'Cortex-M' }] },
  ],
  connections: [
    { from: 'app', to: 'kernel', label: 'OS API' },
    { from: 'kernel', to: 'hw', label: '寄存器' },
  ],
  rules: ['ISR 只调 FromISR 接口'],
});

const MISSING_TITLE = JSON.stringify({
  meta: {},
  layers: [
    { id: 'app', name: '应用层', order: 1, nodes: [{ id: 'task', name: '任务' }] },
    { id: 'hw', name: '硬件层', order: 2, nodes: [{ id: 'mcu', name: 'MCU' }] },
  ],
});

test('layered-arch: E364 主流程 生成→本地校验→内联 HTML 落盘并回复路径', async () => {
  const dir = tempDir();
  const { client, calls } = fakeLLM([VALID_JSON]);
  try {
    const skill = createLayeredArchSkill({ outDir: dir, complete: client });
    const out = await skill.execute(
      { query: '画一个嵌入式 FreeRTOS 系统框架图', attachmentSignals: [], rawFiles: [], memory: null },
      DEPS,
    );
    assert.ok(out.confidence >= 0.8);
    const result = out.result as { answer: string; path: string; jsonPath: string };
    assert.ok(result.path.startsWith(dir), result.path);
    assert.ok(result.path.endsWith('.html'));
    assert.ok(result.jsonPath.endsWith('.json'));
    assert.ok(existsSync(result.path));
    assert.ok(existsSync(result.jsonPath));
    const html = readFileSync(result.path, 'utf8');
    const inlineDataAt = html.indexOf('window.__LAYERED_INLINE__ = {');
    const autoLoadAt = html.indexOf('(function tryNext(i)');
    assert.ok(inlineDataAt >= 0 && inlineDataAt < autoLoadAt, 'HTML 应在模板自加载前注入内联数据');
    assert.ok(
      html.includes('render(window.__LAYERED_INLINE__)'),
      'HTML 应直接 render 内联数据（不走 loadText 二次 JSON.parse）',
    );
    assert.ok(html.includes('嵌入式 FreeRTOS 框架'), 'HTML 应含图标题');
    assert.ok(html.includes('采集任务'), 'HTML 应含节点名');
    assert.ok(result.answer.includes('应用层'), '回复应含分层摘要');
    assert.equal(calls.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('layered-arch: E364 非法 JSON 救场一次后正常交付', async () => {
  const dir = tempDir();
  const { client, calls } = fakeLLM(['不是合法JSON{{{', VALID_JSON]);
  try {
    const skill = createLayeredArchSkill({ outDir: dir, complete: client });
    const out = await skill.execute(
      { query: '画一个嵌入式 FreeRTOS 系统框架图', attachmentSignals: [], rawFiles: [], memory: null },
      DEPS,
    );
    assert.ok(out.confidence >= 0.8);
    assert.ok((out.result as { path: string }).path.endsWith('.html'));
    assert.equal(calls.length, 2, '救场一次共 2 次模型调用');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('layered-arch: E364 本地校验失败 → 一次修复后交付', async () => {
  const dir = tempDir();
  const { client, calls } = fakeLLM([MISSING_TITLE, VALID_JSON]);
  try {
    const skill = createLayeredArchSkill({ outDir: dir, complete: client });
    const out = await skill.execute(
      { query: '画一个嵌入式 FreeRTOS 系统框架图', attachmentSignals: [], rawFiles: [], memory: null },
      DEPS,
    );
    assert.ok(out.confidence >= 0.75, `修复后置信 ${out.confidence}`);
    assert.ok((out.result as { path: string }).path.endsWith('.html'));
    assert.equal(calls.length, 2, '修复共 2 次模型调用');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('layered-arch: E364 未接文本 LLM 给诚实提示', async () => {
  const dir = tempDir();
  try {
    const skill = createLayeredArchSkill({ outDir: dir });
    const out = await skill.execute(
      { query: '画一个嵌入式 FreeRTOS 系统框架图', attachmentSignals: [], rawFiles: [], memory: null },
      DEPS,
    );
    assert.ok(String(out.confidence) === '0.2');
    assert.ok(String(out.result).includes('文本模型未接入'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
