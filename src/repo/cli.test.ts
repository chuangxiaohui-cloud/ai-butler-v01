import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeJsonl } from '../log/jsonl.js';
import { logPushEvent } from './push-audit.js';
import { runRepoAudit, runRepoPush, runRepoWhitelist } from './cli.js';
import { PushService, type GitRunResult, type GitRunner, type Preflight } from './push-service.js';
import { RepoWhitelist } from './repo-whitelist.js';
import type { RepoIdentity } from './types.js';

const REPO: RepoIdentity = { host: 'github.com', owner: 'chuangxiaohui-cloud', name: 'ai-butler-v01' };

function ok(stdout: string): GitRunResult {
  return { stdout, stderr: '', status: 0 };
}

/** 构造使用假 git 的 PushService（对齐 push-service.test.ts 风格；默认已授权 REPO） */
function fakeService(
  script?: (args: string[]) => GitRunResult,
  token = 'ghp_fake',
  whitelisted = true,
): { service: PushService; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'repo-cli-svc-'));
  const whitelistPath = join(dir, 'whitelist.jsonl');
  const auditPath = join(dir, 'audit.jsonl'); // 注入临时审计路径，避免污染真实 data/
  const whitelist = new RepoWhitelist(whitelistPath);
  if (whitelisted) whitelist.authorize(REPO);
  const runGit: GitRunner = (args) => (script ? script(args) : { stdout: '', stderr: '', status: 0 });
  const preflight: Preflight = async () => {};
  const tokenProvider = () => token;
  const service = new PushService({ whitelist, runGit, preflight, tokenProvider, auditPath });
  return {
    service,
    cleanup: () => {
      closeJsonl(whitelistPath);
      closeJsonl(auditPath);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function successScript(args: string[]): GitRunResult {
  const sub = args[0];
  if (sub === 'symbolic-ref') return ok('v0.2b');
  if (sub === 'status') return ok(' M src/foo.ts\n?? docs/new.md\n?? _dbg1.cjs');
  if (sub === 'diff') return ok('src/foo.ts\ndocs/new.md');
  if (sub === 'rev-parse') return ok('deadbeef');
  return ok('');
}

test('cli/push: 未显式 --dry-run/--yes 拒绝（真实推送需确认）', async () => {
  const r = await runRepoPush([]);
  assert.equal(r.exit, 1);
  assert.match(String((r.output as { error: string }).error), /--dry-run|--yes/);
});

test('cli/push: 非法 host 拒绝', async () => {
  const r = await runRepoPush(['--dry-run', '--host', 'gitlab.com']);
  assert.equal(r.exit, 1);
  assert.match(String((r.output as { error: string }).error), /不支持的代码托管主机/);
});

test('cli/push: 非法 owner/repo 标识拒绝', async () => {
  const r = await runRepoPush(['--dry-run', '--owner', 'bad name', '--repo', 'a;b']);
  assert.equal(r.exit, 1);
  assert.match(String((r.output as { error: string }).error), /仓库标识不合法/);
});

test('cli/push: 非法 scope 拒绝', async () => {
  const r = await runRepoPush(['--dry-run', '--scope', 'everything']);
  assert.equal(r.exit, 1);
  assert.match(String((r.output as { error: string }).error), /scope 仅支持/);
});

test('cli/push: dry-run 输出只读计划（变更清单过滤 + 未授权提示）', async () => {
  const { service, cleanup } = fakeService(successScript, 'ghp_fake', false);
  try {
    const r = await runRepoPush(['--dry-run'], { service });
    assert.equal(r.exit, 0);
    const output = r.output as { ok: boolean; dryRun: boolean; plan: { changes: string[]; authorized: boolean; url: string }; hint?: string };
    assert.equal(output.ok, true);
    assert.equal(output.dryRun, true);
    assert.ok(output.plan.changes.every((c) => !c.includes('_dbg1.cjs')), 'project scope 过滤根目录临时文件');
    assert.equal(output.plan.authorized, false);
    assert.match(output.hint ?? '', /repo:whitelist/);
  } finally {
    cleanup();
  }
});

test('cli/push: dry-run 缺 token 提示（不落盘）', async () => {
  const { service, cleanup } = fakeService(successScript, '');
  try {
    const r = await runRepoPush(['--dry-run'], { service });
    assert.equal(r.exit, 0);
    assert.match(String((r.output as { hint?: string }).hint ?? ''), /token 未配置/);
  } finally {
    cleanup();
  }
});

test('cli/push: --yes 成功返回 ok + URL（审计在 PushService 内部落盘）', async () => {
  const { service, cleanup } = fakeService(successScript);
  try {
    const r = await runRepoPush(['--yes', '--message', 'feat: it'], { service });
    assert.equal(r.exit, 0);
    const output = r.output as { ok: boolean; commit: string; url: string };
    assert.equal(output.ok, true);
    assert.equal(output.commit, 'deadbeef');
    assert.match(output.url, /github\.com\/chuangxiaohui-cloud\/ai-butler-v01/);
  } finally {
    cleanup();
  }
});

test('cli/push: --yes 预检/冲突失败退出码 1（不吞错）', async () => {
  const { service, cleanup } = fakeService((args) => {
    if (args[0] === 'push') {
      return { stdout: '', stderr: '! [rejected] (non-fast-forward)\nerror: failed to push some refs', status: 1 };
    }
    return successScript(args);
  });
  try {
    const r = await runRepoPush(['--yes'], { service });
    assert.equal(r.exit, 1);
    const output = r.output as { ok: boolean; conflict?: boolean; hint?: string };
    assert.equal(output.ok, false);
    assert.equal(output.conflict, true);
    assert.match(output.hint ?? '', /rebase|merge/);
  } finally {
    cleanup();
  }
});

test('cli/whitelist: 必须且只能一个动作', () => {
  const r = runRepoWhitelist([]);
  assert.equal(r.exit, 1);
  assert.match(String((r.output as { error: string }).error), /之一/);
  const multi = runRepoWhitelist(['--list', '--authorize']);
  assert.equal(multi.exit, 1);
});

test('cli/whitelist: authorize → list → revoke 生命周期（临时落盘）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'repo-cli-wl-'));
  const whitelistPath = join(dir, 'whitelist.jsonl');
  try {
    const auth = runRepoWhitelist(['--authorize', '--host', 'github.com', '--owner', 'chuangxiaohui-cloud', '--repo', 'ai-butler-v01'], { whitelistPath });
    assert.equal(auth.exit, 0);
    assert.equal((auth.output as { authorized: boolean }).authorized, true);

    const list = runRepoWhitelist(['--list'], { whitelistPath });
    assert.equal(list.exit, 0);
    assert.equal((list.output as { list: RepoIdentity[] }).list.length, 1);

    // 幂等：重复 authorize 不追加
    runRepoWhitelist(['--authorize', '--host', 'github.com', '--owner', 'chuangxiaohui-cloud', '--repo', 'ai-butler-v01'], { whitelistPath });
    const listAgain = runRepoWhitelist(['--list'], { whitelistPath });
    assert.equal((listAgain.output as { list: RepoIdentity[] }).list.length, 1, '重复 authorize 幂等，不重复追加');

    const revoke = runRepoWhitelist(['--revoke', '--host', 'github.com', '--owner', 'chuangxiaohui-cloud', '--repo', 'ai-butler-v01'], { whitelistPath });
    assert.equal(revoke.exit, 0);
    assert.equal((revoke.output as { authorized: boolean }).authorized, false);
    assert.equal((revoke.output as { count: number }).count, 0);
  } finally {
    closeJsonl(whitelistPath);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli/audit: 读取审计倒序 + --limit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'repo-cli-audit-'));
  const auditPath = join(dir, 'audit.jsonl');
  try {
    logPushEvent({ host: 'github.com', owner: 'a', repo: 'r1', branch: 'main', ok: true, commit: 'c1' }, auditPath);
    logPushEvent({ host: 'gitee.com', owner: 'b', repo: 'r2', branch: 'main', ok: false, error: 'e1' }, auditPath);
    logPushEvent({ host: 'github.com', owner: 'a', repo: 'r3', branch: 'main', ok: true }, auditPath);

    const r = runRepoAudit(['--limit', '2'], { auditPath });
    assert.equal(r.exit, 0);
    const output = r.output as { total: number; events: Array<{ repo: string }> };
    assert.equal(output.total, 3);
    assert.equal(output.events.length, 2);
    assert.equal(output.events[0]?.repo, 'r3', '倒序：最新在前');
    assert.equal(output.events[1]?.repo, 'r2');

    const bad = runRepoAudit(['--limit', '0'], { auditPath });
    assert.equal(bad.exit, 1);
    assert.match(String((bad.output as { error: string }).error), /正整数/);
  } finally {
    closeJsonl(auditPath);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli/whitelist: env 注入默认 owner（GITHUB_USER）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'repo-cli-env-'));
  const whitelistPath = join(dir, 'whitelist.jsonl');
  try {
    const r = runRepoWhitelist(['--authorize', '--host', 'github.com', '--repo', 'my-repo'], { whitelistPath, env: { GITHUB_USER: 'env-owner' } });
    assert.equal(r.exit, 0);
    assert.equal((r.output as { repo: RepoIdentity }).repo.owner, 'env-owner');
  } finally {
    closeJsonl(whitelistPath);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli/push: 默认仓库身份（github.com / 默认 owner / ai-butler-v01）', async () => {
  const { service, cleanup } = fakeService(successScript);
  try {
    const r = await runRepoPush(['--dry-run'], { service, env: {} });
    assert.equal(r.exit, 0);
    const plan = (r.output as { plan: { url: string; repo: RepoIdentity } }).plan;
    assert.equal(plan.url, 'https://github.com/chuangxiaohui-cloud/ai-butler-v01');
    assert.equal(plan.repo.host, 'github.com');
  } finally {
    cleanup();
  }
});



