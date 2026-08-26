/**
 * E244 集成测试：S6 真实推送端到端。
 * 真实链路：RepoWhitelist.authorize → PushService.push（真实 git 二进制 add/commit/push，
 * runGit 包装仅把 push 目标 https URL 重定向到本地裸仓库；命令与协议全真实，语义对齐
 * INT-IM 的本地 mock OneBot server）→ 审计 JSONL。
 * 真实远程推送（Gitee/GitHub）需 token 与网络，由用户以 repo:push --yes 执行（E19/E93 先例）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { closeJsonl, readJsonlCached } from '../../src/log/jsonl.js';
import { runRepoAudit, runRepoPush, runRepoWhitelist } from '../../src/repo/cli.js';
import { PushService, type GitRunner } from '../../src/repo/push-service.js';
import { RepoWhitelist } from '../../src/repo/repo-whitelist.js';
import type { PushAuditEntry } from '../../src/repo/push-audit.js';
import type { RepoIdentity } from '../../src/repo/types.js';

const REPO: RepoIdentity = { host: 'github.com', owner: 'chuangxiaohui-cloud', name: 'ai-butler-v01' };

function git(cwd: string, args: string[]): { stdout: string; stderr: string; status: number } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? 1 };
}

function mustGit(cwd: string, args: string[]): string {
  const r = git(cwd, args);
  assert.equal(r.status, 0, `git ${args.join(' ')} failed:\n${r.stderr}${r.stdout}`);
  return r.stdout.trim();
}

interface Env {
  dir: string;
  ws: string;
  remote: string;
  whitelistPath: string;
  auditPath: string;
}

/** 初始化工作区（真实 git）+ 本地裸仓库远程 + 临时白名单/审计路径 */
function setup(): Env {
  const dir = mkdtempSync(join(tmpdir(), 'repo-push-real-'));
  const ws = join(dir, 'ws');
  const remote = join(dir, 'remote.git').replace(/\\/g, '/');
  mkdirSync(ws, { recursive: true });
  mustGit(ws, ['init', '-b', 'main']);
  mustGit(ws, ['config', 'user.email', 'it@test.local']);
  mustGit(ws, ['config', 'user.name', 'IT']);
  mustGit(ws, ['init', '--bare', remote]);
  mustGit(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  return { dir, ws, remote, whitelistPath: join(dir, 'whitelist.jsonl'), auditPath: join(dir, 'push-events.jsonl') };
}

/** 真实 git runner：仅把 push 目标 https URL 重定向到本地裸仓库，其余命令原样执行 */
function realRunner(ws: string, remote: string): GitRunner {
  return (args) => git(ws, args.map((a) => (a.startsWith('https://') && a.endsWith('.git') ? remote : a)));
}

function makeService(env: Env): PushService {
  return new PushService({
    cwd: env.ws,
    whitelist: new RepoWhitelist(env.whitelistPath),
    runGit: realRunner(env.ws, env.remote),
    preflight: async () => {}, // 集成测试注入空预检，避免在临时目录跑 npm test
    tokenProvider: () => 'it-fake-token',
    auditPath: env.auditPath,
  });
}

function readAudit(env: Env): PushAuditEntry[] {
  return readJsonlCached<PushAuditEntry>(env.auditPath, (line) => JSON.parse(line) as PushAuditEntry);
}

function teardown(env: Env): void {
  closeJsonl(env.whitelistPath);
  closeJsonl(env.auditPath);
  rmSync(env.dir, { recursive: true, force: true });
}

test('INT-REPO-001：授权后真实 git add/commit/push 到远程，审计 ok:true 不含 token', async () => {
  const env = setup();
  try {
    new RepoWhitelist(env.whitelistPath).authorize(REPO);
    writeFileSync(join(env.ws, 'src-it.txt'), 'it'); // 根目录文件会被 project scope 过滤，不应被提交
    mkdirSync(join(env.ws, 'src'), { recursive: true });
    writeFileSync(join(env.ws, 'src', 'e2e.txt'), 'hello');

    const result = await makeService(env).push(REPO, { message: 'chore: it-e2e' });
    assert.equal(result.ok, true, result.error);
    assert.ok(result.commit);
    assert.equal(result.url, 'https://github.com/chuangxiaohui-cloud/ai-butler-v01');
    assert.equal(mustGit(env.ws, ['rev-parse', 'HEAD']), result.commit);
    // 远程确实收到了提交
    assert.equal(mustGit(env.remote, ['rev-parse', 'main']), result.commit);
    // project scope：根目录临时文件未进入提交
    const files = mustGit(env.ws, ['show', '--stat', '--oneline', 'HEAD']);
    assert.ok(!files.includes('src-it.txt'), '根目录临时文件被 project scope 过滤');
    assert.ok(files.includes('src/e2e.txt'));

    const entries = readAudit(env);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.ok, true);
    assert.equal(entries[0]?.commit, result.commit);
    assert.equal((entries[0]?.url ?? '').includes('it-fake-token'), false, '审计不含 token');
  } finally {
    teardown(env);
  }
});

test('INT-REPO-002：未授权仓库拒绝，真实 git 无任何写操作', async () => {
  const env = setup();
  let calls = 0;
  try {
    mkdirSync(join(env.ws, 'src'), { recursive: true });
    writeFileSync(join(env.ws, 'src', 'e2e.txt'), 'hello');
    const service = new PushService({
      whitelist: new RepoWhitelist(env.whitelistPath),
      runGit: (args) => {
        calls += 1;
        return git(env.ws, args);
      },
      preflight: async () => {},
      tokenProvider: () => 'it-fake-token',
      auditPath: env.auditPath,
    });
    const result = await service.push(REPO);
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /未授权/);
    assert.equal(calls, 0, '未授权仓库不得执行任何 git 命令');
    // 远程没有任何提交
    const r = git(env.remote, ['rev-parse', 'main']);
    assert.notEqual(r.status, 0);
  } finally {
    teardown(env);
  }
});

test('INT-REPO-003：远程冲突返回 conflict + rebase/merge 提示，本地提交保留', async () => {
  const env = setup();
  const wsB = join(env.dir, 'wsB');
  try {
    // 工作区 A 首推成功
    new RepoWhitelist(env.whitelistPath).authorize(REPO);
    mkdirSync(join(env.ws, 'src'), { recursive: true });
    writeFileSync(join(env.ws, 'src', 'a.txt'), 'a');
    const first = await makeService(env).push(REPO, { message: 'chore: first' });
    assert.equal(first.ok, true, first.error);

    // 工作区 B：从远程 clone（共享 A 历史）后领先推一个提交
    mustGit(env.dir, ['clone', env.remote, 'wsB']);
    mustGit(wsB, ['config', 'user.email', 'it@test.local']);
    mustGit(wsB, ['config', 'user.name', 'IT']);
    writeFileSync(join(wsB, 'b.txt'), 'b');
    mustGit(wsB, ['add', 'b.txt']);
    mustGit(wsB, ['commit', '-m', 'chore: b']);
    mustGit(wsB, ['push', env.remote, 'HEAD:main']);
    const remoteAfterB = mustGit(env.remote, ['rev-parse', 'main']);
    assert.notEqual(remoteAfterB, first.commit);

    // 工作区 A 再推 → non-fast-forward 冲突
    writeFileSync(join(env.ws, 'src', 'a2.txt'), 'a2');
    const conflict = await makeService(env).push(REPO, { message: 'chore: second' });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.conflict, true);
    assert.match(conflict.hint ?? '', /rebase|merge/);
    assert.match(conflict.error ?? '', /push|rejected|non-fast-forward/);
    // 本地提交保留（commit 先于 push 失败），远程未被覆盖
    const localCommit = mustGit(env.ws, ['rev-parse', 'HEAD']);
    assert.notEqual(localCommit, first.commit);
    assert.equal(mustGit(env.remote, ['rev-parse', 'main']), remoteAfterB);

    const entries = readAudit(env);
    assert.equal(entries.length, 2);
    assert.equal(entries[1]?.ok, false);
    assert.equal(entries[1]?.conflict, true);
  } finally {
    teardown(env);
  }
});

test('INT-REPO-004：CLI 编排端到端——dry-run → whitelist authorize → yes push → audit 读取', async () => {
  const env = setup();
  try {
    const service = makeService(env);
    const deps = { cwd: env.ws, service, env: {} as Record<string, string | undefined>, whitelistPath: env.whitelistPath, auditPath: env.auditPath };
    mkdirSync(join(env.ws, 'src'), { recursive: true });
    writeFileSync(join(env.ws, 'src', 'cli.txt'), 'cli');

    // 1) dry-run：只读计划 + 未授权提示
    const plan = await runRepoPush(['--dry-run'], deps);
    assert.equal(plan.exit, 0);
    const planOutput = plan.output as { dryRun: boolean; plan: { changes: string[]; authorized: boolean }; hint?: string };
    assert.equal(planOutput.dryRun, true);
    assert.ok(planOutput.plan.changes.some((c) => c.includes('src/')), 'porcelain 对未跟踪目录折叠为 src/');
    assert.equal(planOutput.plan.authorized, false);
    assert.match(planOutput.hint ?? '', /repo:whitelist/);

    // 2) 授权
    const auth = runRepoWhitelist(['--authorize', '--host', 'github.com', '--owner', 'chuangxiaohui-cloud', '--repo', 'ai-butler-v01'], { whitelistPath: env.whitelistPath });
    assert.equal(auth.exit, 0);
    assert.equal((auth.output as { authorized: boolean }).authorized, true);

    // 3) 真实推送
    const pushed = await runRepoPush(['--yes', '--message', 'chore: cli-e2e'], deps);
    assert.equal(pushed.exit, 0, JSON.stringify(pushed.output));
    const pushedOutput = pushed.output as { ok: boolean; commit: string };
    assert.equal(pushedOutput.ok, true);
    assert.equal(mustGit(env.remote, ['rev-parse', 'main']), pushedOutput.commit);

    // 4) 审计查看
    const audit = runRepoAudit(['--limit', '5'], { auditPath: env.auditPath });
    assert.equal(audit.exit, 0);
    const auditOutput = audit.output as { total: number; events: Array<{ ok: boolean; commit: string }> };
    assert.equal(auditOutput.total, 1);
    assert.equal(auditOutput.events[0]?.ok, true);
    assert.equal(auditOutput.events[0]?.commit, pushedOutput.commit);
  } finally {
    teardown(env);
  }
});







