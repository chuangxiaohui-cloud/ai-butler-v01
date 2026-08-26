/**
 * E244：S6 真实推送 CLI 编排（§11.4 GitHub/Gitee）
 * 三条命令（scripts/repo-*.ts 为薄壳，本模块编排可注入便于测试）：
 *   repo:push       —— --dry-run 只读计划 / --yes 真实推送
 *                      （PushService：白名单 → token 校验 → 预检 → commit → push → 审计）
 *   repo:whitelist  —— --authorize / --revoke / --list 仓库白名单
 *   repo:audit      —— 读取 data/repo-push-events.jsonl（--limit N，倒序）
 * 安全：与 PushService 同约束——token 仅经环境变量注入不落盘；真实推送必须显式 --yes；
 *       git 命令逐条过 §10.2 命令白名单；输出 JSON，失败退出码 1（对齐 scripts/im-gate.ts 风格）。
 */

import { join } from 'node:path';
import { readJsonlCached } from '../log/jsonl.js';
import type { PushAuditEntry } from './push-audit.js';
import { PushService } from './push-service.js';
import type { PushOptions } from './push-service.js';
import { RepoWhitelist } from './repo-whitelist.js';
import type { PushPlan, PushResult, RepoHost, RepoIdentity, PushScope } from './types.js';

export interface RepoCliDeps {
  /** 工作区与 data/ 落盘根（默认 process.cwd()） */
  cwd?: string;
  /** 环境变量（默认 process.env；测试注入） */
  env?: Record<string, string | undefined>;
  /** 可注入 PushService（默认 new PushService()） */
  service?: PushService;
  whitelistPath?: string;
  auditPath?: string;
}

export interface CliOutcome {
  exit: number;
  output: unknown;
}

const HOSTS: RepoHost[] = ['github.com', 'gitee.com'];

const DEFAULT_OWNERS: Record<RepoHost, string> = {
  'github.com': 'chuangxiaohui-cloud',
  'gitee.com': 'cxv138',
};

const IDENT_PATTERN = /^[A-Za-z0-9_.-]+$/;

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function argValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  if (inline !== undefined && inline !== '') return inline;
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

function parseIdentity(
  args: string[],
  env: Record<string, string | undefined>,
): { repo?: RepoIdentity; error?: string } {
  const hostRaw = argValue(args, 'host') ?? 'github.com';
  const host = hostRaw.toLowerCase() as RepoHost;
  if (!HOSTS.includes(host)) {
    return { error: `不支持的代码托管主机 ${hostRaw}：仅支持 ${HOSTS.join(' / ')}` };
  }
  const owner =
    argValue(args, 'owner') ??
    (host === 'gitee.com' ? env.GITEE_USER : env.GITHUB_USER) ??
    DEFAULT_OWNERS[host];
  const name = argValue(args, 'repo') ?? 'ai-butler-v01';
  if (!IDENT_PATTERN.test(owner) || !IDENT_PATTERN.test(name)) {
    return { error: `仓库标识不合法（owner=${owner} repo=${name}）：仅允许字母/数字/._-` };
  }
  return { repo: { host, owner, name } };
}

function parseScope(args: string[]): { scope?: PushScope; error?: string } {
  const raw = argValue(args, 'scope') ?? 'project';
  if (raw !== 'project' && raw !== 'all') {
    return { error: `scope 仅支持 project|all（当前 ${raw}）` };
  }
  return { scope: raw };
}

function defaultService(deps: RepoCliDeps): PushService {
  return deps.service ?? new PushService();
}

/**
 * repo:push 命令。
 * 必须显式 --dry-run（只读计划，含变更清单/目标 URL/授权状态）或 --yes（真实推送）。
 */
export async function runRepoPush(args: string[], deps: RepoCliDeps = {}): Promise<CliOutcome> {
  const env = deps.env ?? process.env;
  const dryRun = hasFlag(args, 'dry-run');
  const yes = hasFlag(args, 'yes');
  if (!dryRun && !yes) {
    return {
      exit: 1,
      output: {
        ok: false,
        error: '必须显式 --dry-run 或 --yes（真实推送需确认）',
        hint: '用法：npm run repo:push -- [--dry-run|--yes] [--host github.com|gitee.com] [--owner <owner>] [--repo <name>] [--message "..."] [--scope project|all]',
      },
    };
  }
  const scopeParsed = parseScope(args);
  if (scopeParsed.error) return { exit: 1, output: { ok: false, error: scopeParsed.error } };
  const parsed = parseIdentity(args, env);
  if (parsed.error) return { exit: 1, output: { ok: false, error: parsed.error } };
  const repo = parsed.repo!;
  const options: PushOptions = { scope: scopeParsed.scope };
  const message = argValue(args, 'message');
  if (message !== undefined) options.message = message;

  try {
    const service = defaultService(deps);
    if (dryRun) {
      const plan: PushPlan = service.plan(repo, options);
      return { exit: 0, output: { ok: true, dryRun: true, plan, hint: planHint(plan) } };
    }
    const result: PushResult = await service.push(repo, options);
    return { exit: result.ok ? 0 : 1, output: result };
  } catch (err) {
    return { exit: 1, output: { ok: false, repo, error: err instanceof Error ? err.message : String(err) } };
  }
}

/**
 * repo:whitelist 命令：--list / --authorize / --revoke 三选一。
 */
export function runRepoWhitelist(args: string[], deps: RepoCliDeps = {}): CliOutcome {
  const env = deps.env ?? process.env;
  const list = hasFlag(args, 'list');
  const authorize = hasFlag(args, 'authorize');
  const revoke = hasFlag(args, 'revoke');
  const actionCount = [list, authorize, revoke].filter(Boolean).length;
  if (actionCount !== 1) {
    return {
      exit: 1,
      output: {
        ok: false,
        error: '必须且只能指定 --list / --authorize / --revoke 之一',
        hint: '用法：npm run repo:whitelist -- --list | --authorize --host <host> --owner <owner> --repo <name> | --revoke --host <host> --owner <owner> --repo <name>',
      },
    };
  }
  const cwd = deps.cwd ?? process.cwd();
  const whitelist = new RepoWhitelist(deps.whitelistPath ?? join(cwd, 'data', 'repo-whitelist.jsonl'));
  if (list) return { exit: 0, output: { list: whitelist.list() } };

  const parsed = parseIdentity(args, env);
  if (parsed.error) return { exit: 1, output: { ok: false, error: parsed.error } };
  const repo = parsed.repo!;
  if (authorize) whitelist.authorize(repo);
  else whitelist.revoke(repo);
  return {
    exit: 0,
    output: {
      action: authorize ? 'authorize' : 'revoke',
      repo,
      authorized: whitelist.isAuthorized(repo),
      count: whitelist.list().length,
    },
  };
}

/**
 * repo:audit 命令：读取 push 审计 JSONL，倒序输出最近 --limit 条（默认 50）。
 */
export function runRepoAudit(args: string[], deps: RepoCliDeps = {}): CliOutcome {
  const limitRaw = argValue(args, 'limit');
  const limit = limitRaw === undefined ? 50 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1) {
    return { exit: 1, output: { ok: false, error: `--limit 需为正整数（当前 ${limitRaw}）` } };
  }
  const cwd = deps.cwd ?? process.cwd();
  const auditPath = deps.auditPath ?? join(cwd, 'data', 'repo-push-events.jsonl');
  const events = readJsonlCached<PushAuditEntry>(auditPath, (line) => {
    try {
      return JSON.parse(line) as PushAuditEntry;
    } catch {
      return null; // 损坏行忽略（与 RepoWhitelist 同策略）
    }
  });
  return { exit: 0, output: { total: events.length, events: events.slice(-limit).reverse() } };
}

/** dry-run 计划附带的可操作提示（未授权 / 缺 token） */
function planHint(plan: PushPlan): string | undefined {
  const hints: string[] = [];
  if (!plan.authorized) {
    hints.push(
      `仓库 ${plan.url} 未授权：先执行 npm run repo:whitelist -- --authorize --host ${plan.repo.host} --owner ${plan.repo.owner} --repo ${plan.repo.name}`,
    );
  }
  if (plan.missingTokenHosts.includes(plan.repo.host)) {
    hints.push(`${plan.repo.host} token 未配置：从环境变量 GITHUB_TOKEN/GITEE_TOKEN 注入（不落盘）后重试`);
  }
  return hints.length > 0 ? hints.join('；') : undefined;
}

