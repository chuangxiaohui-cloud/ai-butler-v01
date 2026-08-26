/**
 * v1.0 S6：代码托管推送服务（§11.4 GitHub/Gitee）
 * 上传流程：本地变更清单 → 白名单授权校验 → 测试/build/安全审计预检（可注入）
 * → commit → push → 返回仓库 URL；每次 push 写 JSONL 审计日志（§11.3）。
 * 失败处理：失败保留本地变更与日志，不静默吞错；远程冲突提示 rebase/merge。
 * 安全：Token 只经 tokenProvider（默认环境变量）注入，不落盘、不写入 .git/config
 *       （URL 内联直推）；参数校验拒绝明文 token；git 命令逐条过 §10.2 命令白名单。
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkCommand } from '../security/command-whitelist.js';
import { logPushEvent } from './push-audit.js';
import { RepoWhitelist } from './repo-whitelist.js';
import type { PushPlan, PushResult, PushScope, RepoHost, RepoIdentity } from './types.js';

/** 项目代码推送范围（与 scripts/push-to-hosts.ts 的 project scope 保持一致） */
const PROJECT_PREFIXES = [
  '.env.example',
  '.gitignore',
  'package.json',
  'tsconfig.json',
  'README.md',
  'v0.1_MVP_实施规划.md',
  'v0.2a_MVP_实施规划.md',
  'v0.2b_MVP_实施规划.md',
  '一人公司AI-Agent需求文档_v2.5.md',
  'src/',
  'scripts/',
  'ui/',
  'desktop/',
  'bench/',
  'docs/',
  'tests/',
];

export const DEFAULT_COMMIT_MESSAGE = 'chore: sync from AI-Butler';

export const CONFLICT_HINT = '远程冲突：本地提交落后于远程，请先拉取并 rebase/merge 后重试（不做强制推送）';

export interface GitRunResult {
  stdout: string;
  stderr: string;
  status: number;
}

export type GitRunner = (args: string[]) => GitRunResult;

/** push 前门禁：测试/build/安全审计（§11.4），可注入便于测试 */
export type Preflight = (plan: PushPlan) => Promise<void>;

/** Token 提供者：默认读环境变量 GITHUB_TOKEN / GITEE_TOKEN，不落盘 */
export type TokenProvider = (host: RepoHost) => string | undefined;

export interface PushServiceDeps {
  /** git 工作区与项目前缀存在性判断根（默认 process.cwd()；测试注入临时工作区） */
  cwd?: string;
  whitelist?: RepoWhitelist;
  runGit?: GitRunner;
  preflight?: Preflight;
  tokenProvider?: TokenProvider;
  /** 审计日志路径（测试注入） */
  auditPath?: string;
}

export interface PushOptions {
  message?: string;
  scope?: PushScope;
}

export class PushService {
  private readonly cwd: string;
  private readonly whitelist: RepoWhitelist;
  private readonly runGit: GitRunner;
  private readonly preflight: Preflight;
  private readonly tokenProvider: TokenProvider;
  private readonly auditPath: string;

  constructor(deps: PushServiceDeps = {}) {
    this.cwd = deps.cwd ?? process.cwd();
    this.whitelist = deps.whitelist ?? new RepoWhitelist();
    this.runGit = deps.runGit ?? defaultGitRunner(this.cwd);
    this.preflight = deps.preflight ?? defaultPreflight();
    this.tokenProvider = deps.tokenProvider ?? defaultTokenProvider();
    this.auditPath = deps.auditPath ?? join(process.cwd(), 'data', 'repo-push-events.jsonl');
  }

  /** 本地变更清单（§11.4 上传流程第一步），只读不写 */
  plan(repo: RepoIdentity, options: PushOptions = {}): PushPlan {
    // 部分 git 版本 --short 只剥 refs/（返回 heads/v0.2b），归一为 v0.2b（对齐 push-to-hosts 的 replace）
    const branch = (this.tryGit(['symbolic-ref', '--short', 'HEAD']) || 'main').replace(/^heads\//, '').replace(/^refs\/heads\//, '');
    const statusOut = this.tryGit(['status', '--porcelain']);
    if (statusOut === null) {
      throw new Error('git status 失败：无法读取本地变更清单');
    }
    const lines = statusOut.split('\n').filter((line) => line.trim().length > 0);
    const changes =
      (options.scope ?? 'project') === 'all'
        ? lines
        : lines.filter((line) => PROJECT_PREFIXES.some((prefix) => line.includes(prefix)));
    return {
      repo,
      branch,
      changes,
      message: options.message ?? DEFAULT_COMMIT_MESSAGE,
      url: bareUrl(repo),
      authorized: this.whitelist.isAuthorized(repo),
      missingTokenHosts: this.tokenProvider(repo.host) ? [] : [repo.host],
    };
  }

  async push(repo: RepoIdentity, options: PushOptions = {}): Promise<PushResult> {
    // 参数校验：显式拒绝明文 token（§11.4 Token 禁止明文落盘/注入）
    if ((options as Record<string, unknown>).token !== undefined) {
      return { ok: false, repo, error: '明文 token 不允许：Token 只能通过 tokenProvider（环境变量）注入，禁止作为参数传入' };
    }
    if (!this.whitelist.isAuthorized(repo)) {
      return { ok: false, repo, error: `仓库 ${repo.host}/${repo.owner}/${repo.name} 未授权：新增仓库需显式授权后才可推送` };
    }
    let plan: PushPlan;
    try {
      plan = this.plan(repo, options);
    } catch (err) {
      return { ok: false, repo, error: `读取本地变更失败：${err instanceof Error ? err.message : String(err)}` };
    }
    if (plan.missingTokenHosts.includes(repo.host)) {
      return { ok: false, repo, error: `${repo.host} token 未配置：请从环境变量注入（不落盘）后重试` };
    }
    try {
      await this.preflight(plan);
    } catch (err) {
      const error = `预检失败：${err instanceof Error ? err.message : String(err)}`;
      this.audit(plan, { ok: false, error });
      return { ok: false, repo, error };
    }
    if (plan.changes.length === 0) {
      this.audit(plan, { ok: true, url: plan.url });
      return { ok: true, repo, url: plan.url, error: '没有可提交的变更' };
    }
    try {
      const commit = this.commitAndPush(plan, options);
      this.audit(plan, { ok: true, commit, url: plan.url });
      return { ok: true, repo, commit, url: plan.url };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const conflict = isConflictError(detail);
      this.audit(plan, { ok: false, conflict, error: detail });
      return {
        ok: false,
        repo,
        error: detail,
        conflict,
        hint: conflict ? CONFLICT_HINT : undefined,
      };
    }
  }

  private commitAndPush(plan: PushPlan, options: PushOptions): string {
    const run = (args: string[]): string => this.guardedRun(args);
    if ((options.scope ?? 'project') === 'all') {
      run(['add', '-A']);
    } else {
      // 只 add 实际存在的项目路径，避免新仓库/局部仓库因缺失 pathspec 硬失败
      const existing = PROJECT_PREFIXES.filter((prefix) => existsSync(join(this.cwd, prefix)));
      if (existing.length > 0) run(['add', ...existing]);
    }
    const staged = run(['diff', '--cached', '--name-only']);
    if (!staged.trim()) {
      throw new Error('没有可提交的变更（暂存区为空）');
    }
    run(['commit', '-m', plan.message]);
    const commit = run(['rev-parse', 'HEAD']);
    // URL 内联直推：Token 只在进程内存携带，不写入 .git/config（§11.4 禁止明文落盘）
    const pushUrl = this.remoteUrlWithToken(plan.repo);
    run(['push', pushUrl, `HEAD:${plan.branch}`]);
    return commit;
  }

  private guardedRun(args: string[]): string {
    const cmdline = gitCmdline(args);
    const check = checkCommand(cmdline);
    if (!check.allowed) {
      throw new Error(`命令白名单拒绝：${check.reason ?? '未知原因'}`);
    }
    const result = this.runGit(args);
    if (result.status !== 0) {
      const detail = `${result.stderr || result.stdout || ''}`.trim();
      throw new Error(`${cmdline} 失败：${detail.slice(0, 300)}`);
    }
    return result.stdout.trim();
  }

  private tryGit(args: string[]): string | null {
    const result = this.runGit(args);
    return result.status === 0 ? result.stdout.trim() : null;
  }

  private remoteUrlWithToken(repo: RepoIdentity): string {
    const token = this.tokenProvider(repo.host);
    if (!token) {
      throw new Error(`${repo.host} token 未配置`);
    }
    return `https://${repo.owner}:${token}@${repo.host}/${repo.owner}/${repo.name}.git`;
  }

  private audit(
    plan: PushPlan,
    partial: { ok: boolean; commit?: string; url?: string; conflict?: boolean; error?: string },
  ): void {
    logPushEvent(
      {
        host: plan.repo.host,
        owner: plan.repo.owner,
        repo: plan.repo.name,
        branch: plan.branch,
        ...partial,
      },
      this.auditPath,
    );
  }
}

/** 裸仓库 URL（不含 token，展示/审计可读） */
export function bareUrl(repo: RepoIdentity): string {
  return `https://${repo.host}/${repo.owner}/${repo.name}`;
}

function gitCmdline(args: string[]): string {
  const quoted = args.map((arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg));
  return `git ${quoted.join(' ')}`;
}

function isConflictError(detail: string): boolean {
  return /non-fast-forward|fetch first|failed to push some refs|rejected/i.test(detail);
}

function defaultGitRunner(cwd: string): GitRunner {
  return (args) => {
    const result = spawnSync('git', args, { encoding: 'utf-8', cwd });
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 };
  };
}

/** 默认预检：npm test + npm run build（§11.4 push 前自动跑测试/build） */
function defaultPreflight(): Preflight {
  return async () => {
    runNpm(['test']);
    runNpm(['run', 'build']);
  };
}

function runNpm(args: string[]): void {
  const npmCli = process.env.npm_execpath ?? 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js';
  const result = spawnSync(process.execPath, [npmCli, ...args], { encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} failed\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  }
}

function defaultTokenProvider(): TokenProvider {
  return (host) => (host === 'github.com' ? process.env.GITHUB_TOKEN : process.env.GITEE_TOKEN);
}

