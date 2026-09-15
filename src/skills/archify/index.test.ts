import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createArchifySkill } from './index.js';
import type { ArchifyRunner } from './render.js';
import type { LLMClient } from '../../search/llm.js';
import type { SkillDeps } from '../deps.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'archify-skill-test-'));
}

const DEPS: SkillDeps = { callVLM: async () => '' };

function fakeLLM(replies: string[]): { client: LLMClient; calls: string[]; maxTokensSeen: number[] } {
  const calls: string[] = [];
  const maxTokensSeen: number[] = [];
  const client: LLMClient = {
    complete: async (messages, opts) => {
      calls.push(messages[messages.length - 1]?.content ?? '');
      if (opts?.maxTokens !== undefined) maxTokensSeen.push(opts.maxTokens);
      const reply = replies.shift();
      if (reply === undefined) throw new Error('LLM 无更多应答');
      return reply;
    },
  };
  return { client, calls, maxTokensSeen };
}

const OK_RECEIPT = {
  ok: true,
  command: 'deliver',
  checks: Array.from({ length: 9 }, () => ({ name: 'c', ok: true })),
  validation: { checksPassed: 9, checkCount: 9, compositionProfile: 'showcase', compositionStatus: 'pass', errors: 0, warnings: 0 },
  specification: { sha256: 'a'.repeat(64), bytes: 100 },
  artifact: { sha256: 'b'.repeat(64), bytes: 200 },
};

test('archify: E352 主流程 生成→校验→渲染 HTML 并回复产物路径', async () => {
    const dir = tempDir();
    const calls: Array<{ args: string[] }> = [];
    const runner: ArchifyRunner = async (args) => {
      calls.push({ args });
      return { code: 0, stdout: JSON.stringify(OK_RECEIPT), stderr: '' };
    };
    const { client, calls: llmCalls } = fakeLLM(['{"schema_version":2}']);
    try {
      const skill = createArchifySkill({ outDir: dir, runner, complete: client });
      const out = await skill.execute({ query: '帮我画一张订单系统的系统架构图', attachmentSignals: [], rawFiles: [], memory: null }, DEPS);
      assert.ok(String(out.confidence) >= '0.8');
      const result = out.result as { answer: string; path: string; jsonPath: string };
      assert.ok(result.path.startsWith(dir), result.path);
      assert.ok(result.path.endsWith('.html'));
      assert.ok(result.jsonPath.endsWith('.json'));
      assert.ok(existsSync(result.jsonPath));
      assert.ok(result.answer.includes('系统架构图'));
      const commands = calls.map((c) => c.args[0]);
      assert.deepEqual(commands, ['validate', 'deliver']);
      assert.equal(llmCalls.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('archify: E352 校验失败 → ≤1 轮修复（诊断改善）后再交付', async () => {
  const dir = tempDir();
  let validateCount = 0;
  const runner: ArchifyRunner = async (args) => {
    if (args[0] === 'validate') {
      validateCount += 1;
      if (validateCount === 1) {
        return {
          code: 1,
          stdout: JSON.stringify({
            ok: false,
            command: 'validate',
            diagnostics: [
              { code: 'layout/constraint', severity: 'error', message: 'label overlap', subject: {}, evidence: {}, supportedFixes: ['labelDy +24'] },
              { code: 'layout/constraint', severity: 'error', message: 'second', subject: {}, evidence: {}, supportedFixes: [] },
            ],
          }),
          stderr: '',
        };
      }
      return { code: 0, stdout: JSON.stringify({ ok: true, command: 'validate', checks: [{ name: 'c', ok: true }] }), stderr: '' };
    }
    return { code: 0, stdout: JSON.stringify(OK_RECEIPT), stderr: '' };
  };
  const { client, calls: llmCalls, maxTokensSeen } = fakeLLM([
    '{"bad":1}',
    '{"fixed":2}',
  ]);
  try {
    const skill = createArchifySkill({ outDir: dir, runner, complete: client });
    const out = await skill.execute({ query: '画一张时序图', attachmentSignals: [], rawFiles: [], memory: null }, DEPS);
    const result = out.result as { path: string; answer: string };
    assert.ok(result.path.endsWith('.html'));
    assert.ok(result.answer.includes('已生成'));
    assert.equal(validateCount, 2);
    assert.equal(llmCalls.length, 2);
    assert.deepEqual(maxTokensSeen, [4000, 4000], 'E358 生成+修复均 maxTokens 4000');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('archify: E352 修复不改善 → 如实报告未生成（不交付不编造成功）', async () => {
  const dir = tempDir();
  let deliverCalls = 0;
  const runner: ArchifyRunner = async (args) => {
    if (args[0] === 'deliver') {
      deliverCalls += 1;
    }
    return {
      code: 1,
      stdout: JSON.stringify({
        ok: false,
        command: 'validate',
        diagnostics: [{ code: 'x/y', severity: 'error', message: '仍重叠', subject: {}, evidence: {}, supportedFixes: [] }],
      }),
      stderr: '',
    };
  };
  const { client } = fakeLLM(['{"a":1}', '{"a":2}', '{"a":3}']);
  try {
    const skill = createArchifySkill({ outDir: dir, runner, complete: client, maxRepairRounds: 1 });
    const out = await skill.execute({ query: '画一张架构图', attachmentSignals: [], rawFiles: [], memory: null }, DEPS);
    const text = (out.result as { answer: string }).answer;
    assert.ok(text.includes('未通过 Archify 校验'));
    assert.equal(deliverCalls, 0);
    assert.ok(Number(out.confidence) < 0.6);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('archify: E352 未接文本 LLM / vendor 缺失 给诚实提示', async () => {
  const dir = tempDir();
  const skillNoLlm = createArchifySkill({ outDir: dir });
  const noLlm = await skillNoLlm.execute({ query: '画一张系统架构图', attachmentSignals: [], rawFiles: [], memory: null }, DEPS);
  assert.ok(String(noLlm.result).includes('文本模型未接入'));

  const skillNoVendor = createArchifySkill({
    outDir: dir,
    vendorDir: join(dir, 'no-such-vendor'),
    complete: { complete: async () => '{}' },
  });
  const noVendor = await skillNoVendor.execute({ query: '画一张系统架构图', attachmentSignals: [], rawFiles: [], memory: null }, DEPS);
  assert.ok(String(noVendor.result).includes('渲染组件缺失'));
  rmSync(dir, { recursive: true, force: true });
});

test('archify: E352 产物 JSON 保留可读（调整后重渲染用）', async () => {
  const dir = tempDir();
  const runner: ArchifyRunner = async () => ({ code: 0, stdout: JSON.stringify(OK_RECEIPT), stderr: '' });
  const { client } = fakeLLM(['{"kept":true}']);
  try {
    const skill = createArchifySkill({ outDir: dir, runner, complete: client });
    const out = await skill.execute({ query: '画一张流程图', attachmentSignals: [], rawFiles: [], memory: null }, DEPS);
    const jsonPath = (out.result as { jsonPath: string }).jsonPath;
    const raw = readFileSync(jsonPath, 'utf8');
    assert.ok(raw.includes('"kept"'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('archify: E356 生成输出非法 JSON → 救场一次后正常交付', async () => {
  const dir = tempDir();
  const runner: ArchifyRunner = async () => ({ code: 0, stdout: JSON.stringify(OK_RECEIPT), stderr: '' });
  const { client, calls: llmCalls, maxTokensSeen } = fakeLLM(['{broken,"a":1}', '{"schema_version":2}']);
  try {
    const skill = createArchifySkill({ outDir: dir, runner, complete: client });
    const out = await skill.execute({ query: '画一张流程图', attachmentSignals: [], rawFiles: [], memory: null }, DEPS);
    assert.equal(llmCalls.length, 2);
    assert.deepEqual(maxTokensSeen, [4000, 4000], 'E358 救场两次调用均 maxTokens 4000');
    assert.ok(llmCalls[1].includes('JSON 解析'), '第二次为救场提示');
    assert.ok((out.result as { path: string }).path.endsWith('.html'));
    assert.ok(Number(out.confidence) >= 0.8);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('archify: E356 两次都输出非法 JSON → 0.3 收据含解析错误、不交付', async () => {
  const dir = tempDir();
  let deliverCalls = 0;
  const runner: ArchifyRunner = async (args) => {
    if (args[0] === 'deliver') deliverCalls += 1;
    return { code: 0, stdout: JSON.stringify(OK_RECEIPT), stderr: '' };
  };
  const { client } = fakeLLM(['{broken,', 'still not json']);
  try {
    const skill = createArchifySkill({ outDir: dir, runner, complete: client });
    const out = await skill.execute({ query: '画一张流程图', attachmentSignals: [], rawFiles: [], memory: null }, DEPS);
    assert.equal(deliverCalls, 0);
    assert.equal(out.confidence, 0.3);
    assert.ok(String(out.result).includes('图数据失败'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('archify: E359 修复不收敛 → 本地版式救援按 standard 通过并交付 HTML', async () => {
  const dir = tempDir();
  const validateCommands: string[] = [];
  const runner: ArchifyRunner = async (args) => {
    if (args[0] === 'deliver') return { code: 0, stdout: JSON.stringify(OK_RECEIPT), stderr: '' };
    const quality = args[args.indexOf('--quality') + 1];
    validateCommands.push(quality);
    const candidate = JSON.parse(readFileSync(args[2], 'utf8'));
    const labelDiag = {
      code: 'layout/constraint',
      severity: 'error',
      message:
        'Label "写入缓存" overlaps component "order" — adjust labelDx/labelDy/labelSegment or set labelAt. Suggested fix: labelAt [520, 154] or labelDy +24 (below)',
      subject: {},
      evidence: {},
    };
    if (quality === 'standard' && candidate.connections?.[0]?.labelAt) {
      return { code: 0, stdout: JSON.stringify(OK_RECEIPT), stderr: '' };
    }
    if (quality === 'standard') {
      return {
        code: 1,
        stdout: JSON.stringify({ ok: false, command: 'validate', diagnostics: [labelDiag] }),
        stderr: '',
      };
    }
    return {
      code: 1,
      stdout: JSON.stringify({
        ok: false,
        command: 'validate',
        diagnostics: [{ code: 'x/y', severity: 'error', message: 'generic', subject: {}, evidence: {} }],
      }),
      stderr: '',
    };
  };
  const gen = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: '订单系统', quality_profile: 'showcase' },
    layout: { mode: 'grid', cols: 2, gapX: 60, gapY: 80, cellW: 150, cellH: 60 },
    components: [
      { id: 'order', type: 'backend', label: '订单', row: 0, col: 0 },
      { id: 'cache', type: 'database', label: '缓存', row: 0, col: 1 },
    ],
    connections: [{ id: 'c1', from: 'order', to: 'cache', label: '写入缓存' }],
  };
  const { client } = fakeLLM([JSON.stringify(gen)]);
  try {
    const skill = createArchifySkill({ outDir: dir, runner, complete: client, maxRepairRounds: 0 });
    const out = await skill.execute(
      { query: '画个订单系统的系统架构图', attachmentSignals: [], rawFiles: [], memory: null },
      DEPS,
    );
    const result = out.result as { path: string; quality: string; answer: string };
    assert.ok(result.path.endsWith('.html'));
    assert.equal(result.quality, 'standard');
    assert.ok(result.answer.includes('本地版式救援'));
    assert.equal(out.confidence, 0.72);
    assert.ok(validateCommands.includes('standard'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('archify: E360 拓扑错（支付直连订单库/主数据无家）→ 语义修复后正常交付', async () => {
  const dir = tempDir();
  let deliverCalls = 0;
  const runner: ArchifyRunner = async (args) => {
    if (args[0] === 'deliver') {
      deliverCalls += 1;
      return { code: 0, stdout: JSON.stringify(OK_RECEIPT), stderr: '' };
    }
    return { code: 0, stdout: JSON.stringify({ ok: true, command: 'validate', checks: [{ name: 'c', ok: true }] }), stderr: '' };
  };
  const { client, calls: llmCalls } = fakeLLM(['{"schema_version":1,"diagram_type":"architecture","meta":{"title":"订单系统","quality_profile":"showcase"},"layout":{"mode":"grid","cols":3,"gapX":60,"gapY":80,"cellW":150,"cellH":60},"components":[{"id":"client","type":"external","label":"客户端","row":0,"col":0},{"id":"order-svc","type":"backend","label":"订单服务","row":1,"col":0},{"id":"pay-svc","type":"backend","label":"支付服务","row":1,"col":1},{"id":"stock-svc","type":"backend","label":"库存服务","row":2,"col":0},{"id":"order-db","type":"database","label":"订单数据库","row":3,"col":1},{"id":"stock-db","type":"database","label":"库存数据库","row":3,"col":0}],"connections":[{"id":"c1","from":"client","to":"order-svc","label":"下单请求"},{"id":"c2","from":"order-svc","to":"stock-svc","label":"扣库存"},{"id":"c3","from":"order-svc","to":"pay-svc","label":"发起支付"},{"id":"c4","from":"pay-svc","to":"order-db","label":"支付结果","variant":"dashed"}]}', '{"schema_version":1,"diagram_type":"architecture","meta":{"title":"订单系统","quality_profile":"showcase"},"layout":{"mode":"grid","cols":3,"gapX":60,"gapY":80,"cellW":150,"cellH":60},"components":[{"id":"client","type":"external","label":"客户端","row":0,"col":0},{"id":"order-svc","type":"backend","label":"订单服务","row":1,"col":0},{"id":"pay-svc","type":"backend","label":"支付服务","row":1,"col":1},{"id":"stock-svc","type":"backend","label":"库存服务","row":2,"col":0},{"id":"order-db","type":"database","label":"订单数据库","row":3,"col":1},{"id":"stock-db","type":"database","label":"库存数据库","row":3,"col":0}],"connections":[{"id":"c1","from":"client","to":"order-svc","label":"下单请求"},{"id":"c2","from":"order-svc","to":"order-db","label":"读写"},{"id":"c3","from":"order-svc","to":"stock-svc","label":"扣库存"},{"id":"c4","from":"stock-svc","to":"stock-db","label":"读写"},{"id":"c5","from":"order-svc","to":"pay-svc","label":"发起支付"},{"id":"c6","from":"pay-svc","to":"order-svc","label":"支付结果","variant":"dashed"}]}']);
  try {
    const skill = createArchifySkill({ outDir: dir, runner, complete: client });
    const out = await skill.execute(
      { query: '画个订单系统的系统架构图', attachmentSignals: [], rawFiles: [], memory: null },
      DEPS,
    );
    const result = out.result as { path: string; answer: string };
    assert.ok(result.path.endsWith('.html'));
    assert.equal(llmCalls.length, 2, '第二次为语义修复调用');
    assert.ok(llmCalls[1].includes('拓扑铁律'), '语义修复提示携带铁律');
    assert.ok(llmCalls[1].includes('支付结果'), '语义修复提示携带问题连线');
    assert.equal(deliverCalls, 1);
    assert.ok(Number(out.confidence) >= 0.8);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('archify: E360 语义修复后仍错 → 0.3 收据列问题、不交付', async () => {
  const dir = tempDir();
  let deliverCalls = 0;
  const runner: ArchifyRunner = async (args) => {
    if (args[0] === 'deliver') deliverCalls += 1;
    return { code: 0, stdout: JSON.stringify(OK_RECEIPT), stderr: '' };
  };
  const { client, calls: llmCalls } = fakeLLM(['{"schema_version":1,"diagram_type":"architecture","meta":{"title":"订单系统","quality_profile":"showcase"},"layout":{"mode":"grid","cols":3,"gapX":60,"gapY":80,"cellW":150,"cellH":60},"components":[{"id":"client","type":"external","label":"客户端","row":0,"col":0},{"id":"order-svc","type":"backend","label":"订单服务","row":1,"col":0},{"id":"pay-svc","type":"backend","label":"支付服务","row":1,"col":1},{"id":"stock-svc","type":"backend","label":"库存服务","row":2,"col":0},{"id":"order-db","type":"database","label":"订单数据库","row":3,"col":1},{"id":"stock-db","type":"database","label":"库存数据库","row":3,"col":0}],"connections":[{"id":"c1","from":"client","to":"order-svc","label":"下单请求"},{"id":"c2","from":"order-svc","to":"stock-svc","label":"扣库存"},{"id":"c3","from":"order-svc","to":"pay-svc","label":"发起支付"},{"id":"c4","from":"pay-svc","to":"order-db","label":"支付结果","variant":"dashed"}]}', '{"schema_version":1,"diagram_type":"architecture","meta":{"title":"订单系统","quality_profile":"showcase"},"layout":{"mode":"grid","cols":3,"gapX":60,"gapY":80,"cellW":150,"cellH":60},"components":[{"id":"client","type":"external","label":"客户端","row":0,"col":0},{"id":"order-svc","type":"backend","label":"订单服务","row":1,"col":0},{"id":"pay-svc","type":"backend","label":"支付服务","row":1,"col":1},{"id":"stock-svc","type":"backend","label":"库存服务","row":2,"col":0},{"id":"order-db","type":"database","label":"订单数据库","row":3,"col":1},{"id":"stock-db","type":"database","label":"库存数据库","row":3,"col":0}],"connections":[{"id":"c1","from":"client","to":"order-svc","label":"下单请求"},{"id":"c2","from":"order-svc","to":"stock-svc","label":"扣库存"},{"id":"c3","from":"order-svc","to":"pay-svc","label":"发起支付"},{"id":"c4","from":"pay-svc","to":"order-db","label":"支付结果","variant":"dashed"}]}']);
  try {
    const skill = createArchifySkill({ outDir: dir, runner, complete: client });
    const out = await skill.execute(
      { query: '画个订单系统的系统架构图', attachmentSignals: [], rawFiles: [], memory: null },
      DEPS,
    );
    assert.equal(deliverCalls, 0, '语义未达标不交付');
    assert.equal(out.confidence, 0.3);
    assert.ok((out.result as { answer: string }).answer.includes('内容语义问题'));
    assert.equal(llmCalls.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('archify: E361 语义修复后版式仍不过 → 补 LLM 布局修复轮后交付', async () => {
  const dir = tempDir();
  let deliverCalls = 0;
  const runner: ArchifyRunner = async (args) => {
    if (args[0] === 'deliver') {
      deliverCalls += 1;
      return { code: 0, stdout: JSON.stringify(OK_RECEIPT), stderr: '' };
    }
    const candidate = JSON.parse(readFileSync(args[2], 'utf8'));
    if (candidate.probeMarker === 'final') {
      return { code: 0, stdout: JSON.stringify({ ok: true, command: 'validate', checks: [{ name: 'c', ok: true }] }), stderr: '' };
    }
    if (candidate.probeMarker === 'gen') {
      return { code: 0, stdout: JSON.stringify({ ok: true, command: 'validate', checks: [{ name: 'c', ok: true }] }), stderr: '' };
    }
    return {
      code: 1,
      stdout: JSON.stringify({
        ok: false,
        command: 'validate',
        diagnostics: [{ code: 'layout/constraint', severity: 'error', message: 'label 撞线，请合并同通道往返线', subject: {}, evidence: {} }],
      }),
      stderr: '',
    };
  };
  const { client, calls: llmCalls } = fakeLLM(['{"schema_version":1,"diagram_type":"architecture","meta":{"title":"订单系统","quality_profile":"showcase"},"layout":{"mode":"grid","cols":3,"gapX":60,"gapY":80,"cellW":150,"cellH":60},"components":[{"id":"client","type":"external","label":"客户端","row":0,"col":0},{"id":"order-svc","type":"backend","label":"订单服务","row":1,"col":0},{"id":"pay-svc","type":"backend","label":"支付服务","row":1,"col":1},{"id":"stock-svc","type":"backend","label":"库存服务","row":2,"col":0},{"id":"order-db","type":"database","label":"订单数据库","row":3,"col":1},{"id":"stock-db","type":"database","label":"库存数据库","row":3,"col":0}],"connections":[{"id":"c1","from":"client","to":"order-svc","label":"下单请求"},{"id":"c2","from":"order-svc","to":"stock-svc","label":"扣库存"},{"id":"c3","from":"order-svc","to":"pay-svc","label":"发起支付"},{"id":"c4","from":"pay-svc","to":"order-db","label":"支付结果","variant":"dashed"}],"probeMarker":"gen"}', '{"schema_version":1,"diagram_type":"architecture","meta":{"title":"订单系统","quality_profile":"showcase"},"layout":{"mode":"grid","cols":3,"gapX":60,"gapY":80,"cellW":150,"cellH":60},"components":[{"id":"client","type":"external","label":"客户端","row":0,"col":0},{"id":"order-svc","type":"backend","label":"订单服务","row":1,"col":0},{"id":"pay-svc","type":"backend","label":"支付服务","row":1,"col":1},{"id":"stock-svc","type":"backend","label":"库存服务","row":2,"col":0},{"id":"order-db","type":"database","label":"订单数据库","row":3,"col":1},{"id":"stock-db","type":"database","label":"库存数据库","row":3,"col":0}],"connections":[{"id":"c1","from":"client","to":"order-svc","label":"下单请求"},{"id":"c2","from":"order-svc","to":"order-db","label":"读写"},{"id":"c3","from":"order-svc","to":"stock-svc","label":"扣库存"},{"id":"c4","from":"stock-svc","to":"stock-db","label":"读写"},{"id":"c5","from":"order-svc","to":"pay-svc","label":"发起支付"},{"id":"c6","from":"pay-svc","to":"order-svc","label":"支付结果","variant":"dashed"}],"probeMarker":"semfix"}', '{"schema_version":1,"diagram_type":"architecture","meta":{"title":"订单系统","quality_profile":"showcase"},"layout":{"mode":"grid","cols":3,"gapX":60,"gapY":80,"cellW":150,"cellH":60},"components":[{"id":"client","type":"external","label":"客户端","row":0,"col":0},{"id":"order-svc","type":"backend","label":"订单服务","row":1,"col":0},{"id":"pay-svc","type":"backend","label":"支付服务","row":1,"col":1},{"id":"stock-svc","type":"backend","label":"库存服务","row":2,"col":0},{"id":"order-db","type":"database","label":"订单数据库","row":3,"col":1},{"id":"stock-db","type":"database","label":"库存数据库","row":3,"col":0}],"connections":[{"id":"c1","from":"client","to":"order-svc","label":"下单请求"},{"id":"c2","from":"order-svc","to":"order-db","label":"读写"},{"id":"c3","from":"order-svc","to":"stock-svc","label":"扣库存"},{"id":"c4","from":"stock-svc","to":"stock-db","label":"读写"},{"id":"c5","from":"order-svc","to":"pay-svc","label":"发起支付"},{"id":"c6","from":"pay-svc","to":"order-svc","label":"支付结果","variant":"dashed"}],"probeMarker":"final"}']);
  try {
    const skill = createArchifySkill({ outDir: dir, runner, complete: client });
    const out = await skill.execute(
      { query: '画个订单系统的系统架构图', attachmentSignals: [], rawFiles: [], memory: null },
      DEPS,
    );
    const result = out.result as { path: string };
    assert.ok(result.path.endsWith('.html'), '语义修复后补布局轮应交付');
    assert.equal(llmCalls.length, 3, '生成 + 语义修复 + 补布局轮');
    assert.ok(llmCalls[1].includes('拓扑铁律'), '第 2 次为语义修复');
    assert.ok(llmCalls[2].includes('layout/constraint'), '第 3 次为布局修复（携带诊断）');
    assert.equal(deliverCalls, 1);
    assert.ok(Number(out.confidence) >= 0.8);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
