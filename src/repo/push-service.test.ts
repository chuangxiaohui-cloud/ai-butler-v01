import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeJsonl, readJsonlCached } from '../log/jsonl.js';
import { checkCommand } from '../security/command-whitelist.js';
import type { PushAuditEntry } from './push-audit.js';
import { PushService, type GitRunResult, type GitRunner, type PushOptions, type Preflight } from './push-service.js';
import { RepoWhitelist } from './repo-whitelist.js';
import type { RepoIdentity } from './types.js';

const REPO: RepoIdentity = { host: 'github.com', owner: 'chuangxiaohui-cloud', name: 'ai-butler-v01' };

interface ServiceHarness {
  service: PushService;
  whitelist: RepoWhitelist;
  whitelistPath: string;
  calls: string[][];
  auditPath: string;
  dir: string;
}

function ok(stdout: string): GitRunResult {
  return { stdout, stderr: '', status: 0 };
}

function makeService(overrides: {
  preflight?: Preflight;
  token?: string;
  script?: (args: string[]) => GitRunResult;
} = {}): ServiceHarness {
  const dir = mkdtempSync(join(tmpdir(), 'repo-service-'));
  const whitelistPath = join(dir, 'whitelist.jsonl');
  const whitelist = new RepoWhitelist(whitelistPath);
  const auditPath = join(dir, 'push-events.jsonl');
  const calls: string[][] = [];
  const runGit: GitRunner = (args) => {
    calls.push(args);
    if (overrides.script) return overrides.script(args);
    return { stdout: '', stderr: '', status: 0 };
  };
  const preflight = overrides.preflight ?? (async () => {});
  const tokenProvider = (host: 'github.com' | 'gitee.com') => {
    if (overrides.token !== undefined) return overrides.token;
    return host === 'github.com' ? 'ghp_fake' : 'gitee_fake';
  };
  const service = new PushService({ whitelist, runGit, preflight, tokenProvider, auditPath });
  return { service, whitelist, whitelistPath, calls, auditPath, dir };
}

function teardown(h: ServiceHarness): void {
  closeJsonl(h.whitelistPath);
  closeJsonl(h.auditPath);
  rmSync(h.dir, { recursive: true, force: true });
}

function readAudit(auditPath: string): PushAuditEntry[] {
  return readJsonlCached<PushAuditEntry>(auditPath, (line) => JSON.parse(line) as PushAuditEntry);
}

test('push-service: 未授权仓库拒绝，不执行 git 与预检（§11.4 白名单）', async () => {
  const h = makeService();
  try {
    const result = await h.service.push(REPO);
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /未授权/);
    assert.equal(h.calls.length, 0, '未授权仓库不得执行任何 git 命令');
  } finally {
    teardown(h);
  }
});

test('push-service: 预检失败中止，不执行 git 写操作，审计 ok:false', async () => {
  const h = makeService({
    preflight: async () => {
      throw new Error('npm test failed');
    },
  });
  try {
    h.whitelist.authorize(REPO);
    const result = await h.service.push(REPO);
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /预检失败/);
    const writes = h.calls.filter((c) => c[0] === 'add' || c[0] === 'commit' || c[0] === 'push');
    assert.equal(writes.length, 0, '预检失败不得暂存/提交/推送（本地变更保留）');
    const entries = readAudit(h.auditPath);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.ok, false);
  } finally {
    teardown(h);
  }
});

test('push-service: token 缺失中止，不执行 git 写操作', async () => {
  const h = makeService({ token: '' });
  try {
    h.whitelist.authorize(REPO);
    const result = await h.service.push(REPO);
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /token 未配置/);
    const writes = h.calls.filter((c) => c[0] === 'add' || c[0] === 'commit' || c[0] === 'push');
    assert.equal(writes.length, 0);
  } finally {
    teardown(h);
  }
});

test('push-service: 明文 token 参数被拒绝（§11.4 不落盘）', async () => {
  const h = makeService();
  try {
    h.whitelist.authorize(REPO);
    const result = await h.service.push(REPO, { token: 'ghp_plaintext' } as unknown as PushOptions);
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /明文 token/);
    assert.equal(h.calls.length, 0, '拒绝明文 token 时不执行任何 git 命令');
  } finally {
    teardown(h);
  }
});

test('push-service: 全流程成功——变更清单→预检→commit→push 返回 URL + 审计 ok:true', async () => {
  const h = makeService({
    script: (args) => {
      const sub = args[0];
      if (sub === 'symbolic-ref') return ok('v0.2b');
      if (sub === 'status') return ok(' M src/foo.ts\n?? docs/new.md\n?? _dbg1.cjs');
      if (sub === 'diff') return ok('src/foo.ts\ndocs/new.md');
      if (sub === 'rev-parse') return ok('deadbeef');
      return ok('');
    },
  });
  try {
    h.whitelist.authorize(REPO);
    const result = await h.service.push(REPO, { message: 'feat: test' });
    assert.equal(result.ok, true);
    assert.equal(result.commit, 'deadbeef');
    assert.equal(result.url, 'https://github.com/chuangxiaohui-cloud/ai-butler-v01');
    assert.equal(result.error, undefined);
    assert.ok(h.calls.some((c) => c[0] === 'add'), '执行了 git add');
    assert.ok(h.calls.some((c) => c[0] === 'commit'), '执行了 git commit');
    const pushCall = h.calls.find((c) => c[0] === 'push');
    assert.ok(pushCall, '执行了 git push');
    assert.match(pushCall?.[1] ?? '', /ghp_fake@github\.com/, 'push URL 携带 token（仅进程内存）');
    const entries = readAudit(h.auditPath);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.ok, true);
    assert.equal(entries[0]?.commit, 'deadbeef');
    assert.match(entries[0]?.url ?? '', /github\.com\/chuangxiaohui-cloud\/ai-butler-v01/);
    assert.equal((entries[0]?.url ?? '').includes('ghp_fake'), false, '审计日志不含 token');
  } finally {
    teardown(h);
  }
});

test('push-service: 远程冲突返回 conflict + rebase/merge 提示，审计 ok:false', async () => {
  const h = makeService({
    script: (args) => {
      const sub = args[0];
      if (sub === 'symbolic-ref') return ok('v0.2b');
      if (sub === 'status') return ok(' M src/foo.ts');
      if (sub === 'diff') return ok('src/foo.ts');
      if (sub === 'rev-parse') return ok('cafe123');
      if (sub === 'push') {
        return { stdout: '', stderr: '! [rejected] v0.2b -> v0.2b (non-fast-forward)\nerror: failed to push some refs', status: 1 };
      }
      return ok('');
    },
  });
  try {
    h.whitelist.authorize(REPO);
    const result = await h.service.push(REPO);
    assert.equal(result.ok, false);
    assert.equal(result.conflict, true);
    assert.match(result.hint ?? '', /rebase|merge/);
    assert.match(result.error ?? '', /push/);
    const entries = readAudit(h.auditPath);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.ok, false);
    assert.equal(entries[0]?.conflict, true);
    assert.ok(h.calls.some((c) => c[0] === 'commit'), '冲突前已完成本地 commit，本地变更保留');
  } finally {
    teardown(h);
  }
});

test('push-service: git 命令逐条过 §10.2 命令白名单（push --force 拒绝）', () => {
  const check = checkCommand('git push --force https://github.com/a/b.git HEAD:main');
  assert.equal(check.allowed, false);
  assert.match(check.reason ?? '', /force/);
});

test('push-service: plan 输出本地变更清单与裸 URL（不含 token）', () => {
  const h = makeService({
    script: (args) => {
      if (args[0] === 'symbolic-ref') return ok('v0.2b');
      if (args[0] === 'status') return ok(' M src/foo.ts\n?? _dbg1.cjs\n?? docs/new.md');
      return ok('');
    },
  });
  try {
    const plan = h.service.plan(REPO);
    assert.equal(plan.branch, 'v0.2b');
    assert.equal(plan.url, 'https://github.com/chuangxiaohui-cloud/ai-butler-v01');
    assert.equal(plan.url.includes('ghp'), false, 'plan URL 不含 token');
    assert.equal(plan.authorized, false);
    assert.equal(plan.changes.length, 2, 'project scope 过滤根目录临时文件');
    assert.ok(plan.changes.every((c) => !c.includes('_dbg1.cjs')));
  } finally {
    teardown(h);
  }
});

test('push-service: 无可提交变更时返回 ok:true 不报错（审计 ok:true）', async () => {
  const h = makeService({
    script: (args) => {
      if (args[0] === 'symbolic-ref') return ok('v0.2b');
      return ok('');
    },
  });
  try {
    h.whitelist.authorize(REPO);
    const result = await h.service.push(REPO);
    assert.equal(result.ok, true);
    assert.match(result.error ?? '', /没有可提交的变更/);
    assert.ok(!h.calls.some((c) => c[0] === 'add' || c[0] === 'push'), '无变更不执行 add/push');
    const entries = readAudit(h.auditPath);
    assert.equal(entries[0]?.ok, true);
  } finally {
    teardown(h);
  }
});

test('push-service: plan 分支名归一（symbolic-ref 返回 heads/ 前缀时剥除，本机 git 实测）', () => {
  const h = makeService({
    script: (args) => {
      if (args[0] === 'symbolic-ref') return ok('heads/v0.2b');
      if (args[0] === 'status') return ok(' M src/foo.ts');
      return ok('');
    },
  });
  try {
    const plan = h.service.plan(REPO);
    assert.equal(plan.branch, 'v0.2b');
  } finally {
    teardown(h);
  }
});
