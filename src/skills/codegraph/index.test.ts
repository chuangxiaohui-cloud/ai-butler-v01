import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  createCodegraphSkill,
  type CodegraphRunResult,
  type CodegraphRunner,
} from './index.js';

function fakeRunner(log: { calls: Array<{ args: string[]; cwd: string }> }, respond: (args: string[]) => CodegraphRunResult): CodegraphRunner {
  return async (args, cwd) => {
    log.calls.push({ args, cwd });
    return respond(args);
  };
}

const INITIALIZED = {
  code: 0,
  stdout: 'CodeGraph Status\nIndex Statistics:\n  Files: 3\n  Nodes: 8\n  Edges: 11\n[OK] Index is up to date',
  stderr: '',
};

function make(opts: { runner: CodegraphRunner; cwd?: string }) {
  return createCodegraphSkill({ runner: opts.runner, cwd: opts.cwd ?? process.cwd() });
}

test('codegraph: E353 谁调用 helper → callers 子命令（只读、无 confirm）', async () => {
  const log = { calls: [] as Array<{ args: string[]; cwd: string }> };
  const skill = make({
    runner: fakeRunner(log, (args) => {
      if (args[0] === 'status') return INITIALIZED;
      return { code: 0, stdout: 'Callers of "helper" (2):\nfunction main\n  src/a.ts:2', stderr: '' };
    }),
  });
  const out = await skill.execute(
    { query: '谁调用了 helper？', attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '' },
  );
  assert.equal(log.calls[0].args[0], 'status');
  assert.deepEqual(log.calls[1].args, ['callers', 'helper']);
  assert.equal(typeof out.result, 'string');
  assert.ok(String(out.result).includes('Callers of "helper"'), '应包含 CLI 证据文本');
  assert.equal(out.confidence, 0.82);
});

test('codegraph: E353 改了 .c 文件会波及哪些模块 → impact（文件作符号目标）', async () => {
  const log = { calls: [] as Array<{ args: string[]; cwd: string }> };
  const skill = make({
    runner: fakeRunner(log, (args) => {
      if (args[0] === 'status') return INITIALIZED;
      return { code: 0, stdout: 'Impact of changing "src/bsp_uart.c":\nsrc/main.c\n  function boot_main:2', stderr: '' };
    }),
  });
  const out = await skill.execute(
    { query: '如果我改了 src/bsp_uart.c 会波及哪些模块？', attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '' },
  );
  assert.deepEqual(log.calls[1].args, ['impact', 'src/bsp_uart.c']);
  assert.ok(String(out.result).includes('Impact of changing'));
});

test('codegraph: E353 调用链 → callees；带 ANSI 的输出被清理', async () => {
  const log = { calls: [] as Array<{ args: string[]; cwd: string }> };
  const skill = make({
    runner: fakeRunner(log, (args) => {
      if (args[0] === 'status') return INITIALIZED;
      return { code: 0, stdout: '\u001b[1mCallees of "helper"\u001b[0m:\n  function helper\n  src/b.ts:1', stderr: '' };
    }),
  });
  const out = await skill.execute(
    { query: 'helper 的调用链是怎样的？', attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '' },
  );
  assert.deepEqual(log.calls[1].args, ['callees', 'helper']);
  assert.ok(!String(out.result).includes('\u001b['), 'ANSI 转义应被剥离');
});

test('codegraph: E353 目录未初始化 → 给 codegraph init 引导，不继续查', async () => {
  const log = { calls: [] as Array<{ args: string[]; cwd: string }> };
  const skill = make({
    runner: fakeRunner(log, () => ({ code: 0, stdout: 'Not initialized\nRun "codegraph init" to initialize', stderr: '' })),
  });
  const out = await skill.execute(
    { query: '谁调用了 helper？', attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '' },
  );
  assert.equal(log.calls.length, 1, '未初始化时只跑 status，不再发查询');
  assert.ok(String(out.result).includes('codegraph init'));
  assert.equal(out.confidence, 0.5);
});

test('codegraph: E353 CLI 不存在 → 安装引导', async () => {
  const skill = createCodegraphSkill({
    runner: async () => {
      throw new Error('spawn codegraph ENOENT');
    },
  });
  const out = await skill.execute(
    { query: '谁调用了 helper？', attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '' },
  );
  assert.ok(String(out.result).includes('npm i -g @colbymchenry/codegraph'));
});

test('codegraph: E353 解读项目 → explore 速读', async () => {
  const log = { calls: [] as Array<{ args: string[]; cwd: string }> };
  const skill = make({
    runner: fakeRunner(log, (args) => {
      if (args[0] === 'status') return INITIALIZED;
      return { code: 0, stdout: '## Exploration\nFound 12 symbols across 8 files.\n', stderr: '' };
    }),
  });
  const out = await skill.execute(
    { query: '解读一下这个项目的组成', attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '' },
  );
  assert.equal(log.calls[1].args[0], 'explore');
  assert.ok(String(out.result).includes('Found 12 symbols'));
});

test('codegraph: E353 无符号的模糊影响问 → 使用引导（不猜测）', async () => {
  const log = { calls: [] as Array<{ args: string[]; cwd: string }> };
  const skill = make({
    runner: fakeRunner(log, (args) => (args[0] === 'status' ? INITIALIZED : { code: 0, stdout: '', stderr: '' })),
  });
  const out = await skill.execute(
    { query: '帮我做下改动影响分析', attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '' },
  );
  assert.equal(log.calls.length, 1, '缺少符号只给引导，不发分析命令');
  assert.ok(String(out.result).includes('请带上符号或文件名'));
});
