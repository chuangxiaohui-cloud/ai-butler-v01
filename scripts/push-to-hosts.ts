#!/usr/bin/env node
/**
 * GitHub/Gitee 联动推送（§11.4）
 * 用法：
 *   npm run push:hosts -- --dry-run
 *   npm run push:hosts -- --yes --repo <name> --message "chore: ..."
 *
 * 安全：
 *   - 默认只打印计划；真实推送必须显式 --yes。
 *   - push 前强制跑 npm test + npm run build。
 *   - Token 从环境变量读取，仅本次进程使用，不落盘。
 */

import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';

import { loadEnvFile } from '../src/config/env.js';

loadEnvFile();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const yes = args.includes('--yes');
const createRepo = args.includes('--create');
const scope = args.find((a) => a.startsWith('--scope='))?.split('=')[1] ?? 'project';
const repo = args.find((a) => a.startsWith('--repo='))?.split('=')[1] ?? 'ai-butler-v01';
const message =
  args.find((a) => a.startsWith('--message='))?.split('=')[1] ?? 'chore: sync from AI-Butler';

const GITHUB_USER = process.env.GITHUB_USER ?? 'chuangxiaohui-cloud';
const GITEE_USER = process.env.GITEE_USER ?? 'cxv138';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITEE_TOKEN = process.env.GITEE_TOKEN;

function run(cmd: string, cmdArgs: string[]): string {
  let exec = cmd;
  let args = cmdArgs;
  if (cmd === 'npm') {
    exec = process.execPath;
    args = [
      process.env.npm_execpath ?? 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js',
      ...cmdArgs,
    ];
  }
  const r = spawnSync(exec, args, { encoding: 'utf-8' });
  if (r.status !== 0) {
    throw new Error(
      `${cmd} ${cmdArgs.join(' ')} failed\n${r.stdout ?? ''}${r.stderr ?? ''}`,
    );
  }
  return (r.stdout ?? '').trim();
}

function branchName(): string {
  return run('git', ['symbolic-ref', '--short', 'HEAD']).replace(/^heads\//, '');
}

function changedFiles(): string[] {
  const out = run('git', ['status', '--porcelain']);
  const lines = out ? out.split('\n').filter(Boolean) : [];
  if (scope === 'all') return lines;
  const prefixes = [
    '.env.example',
    'package.json',
    'tsconfig.json',
    'README.md',
    'v0.1_MVP_实施规划.md',
    'v0.2a_MVP_实施规划.md',
    'v0.2b_MVP_实施规划.md',
    '一人公司AI-Agent需求文档_v2.5.md',
    'src/',
    'scripts/',
    'bench/',
    'docs/',
  ];
  return lines.filter((line) => prefixes.some((p) => line.includes(p)));
}

function remotes(): string[] {
  const out = run('git', ['remote']);
  return out ? out.split('\n').filter(Boolean) : [];
}

function logEvent(entry: Record<string, unknown>): void {
  const path = join(process.cwd(), 'data', 'hosting-events.jsonl');
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, 'utf-8');
}

async function ensureRemoteRepo(h: {
  host: 'github.com' | 'gitee.com';
  remote: string;
  url: string;
  hasToken: boolean;
}): Promise<void> {
  if (!createRepo || !h.hasToken) return;
  try {
    if (h.host === 'github.com') {
      await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'AI-Butler',
        },
        body: JSON.stringify({ name: repo, private: true }),
      });
    } else {
      await fetch('https://gitee.com/api/v5/user/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          access_token: GITEE_TOKEN ?? '',
          name: repo,
          private: 'true',
        }),
      });
    }
  } catch {
    // 仓库已存在或创建失败都不阻塞 push，push 阶段会给出真实错误
  }
}

function hostSpec(host: 'github.com' | 'gitee.com', user: string, token: string | undefined) {
  return {
    host,
    remote: `origin-${host.replace('.com', '')}`,
    url: `https://${user}:${token}@${host}/${user}/${repo}.git`,
    hasToken: Boolean(token),
  };
}

async function main(): Promise<void> {
  const branch = branchName();
  const changes = changedFiles();
  const currentRemotes = remotes();
  const hosts = [
    hostSpec('github.com', GITHUB_USER, GITHUB_TOKEN),
    hostSpec('gitee.com', GITEE_USER, GITEE_TOKEN),
  ];

  console.log(`仓库: ${repo}`);
  console.log(`范围: ${scope === 'all' ? '全部工作区' : '项目代码（src/scripts/bench/docs/需求文档/配置）'}`);
  console.log(`分支: ${branch}`);
  console.log(`变更: ${changes.length} 个文件`);
  for (const line of changes.slice(0, 20)) console.log(`  ${line}`);
  if (changes.length > 20) console.log(`  ...另有 ${changes.length - 20} 个`);
  console.log(`提交信息: ${message}`);
  for (const h of hosts) {
    console.log(
      `目标: ${h.host} ${userOf(h.host)}/${repo} ${h.hasToken ? '(token 已配置)' : '(token 缺失，将跳过)'}`,
    );
  }

  if (dryRun) {
    console.log('\nDRY RUN：未执行 add/commit/push。');
    return;
  }
  if (!yes) {
    console.error('\n需要显式 --yes 才会真实推送。');
    process.exitCode = 1;
    return;
  }
  if (!GITHUB_TOKEN && !GITEE_TOKEN) {
    console.error('缺少 GITHUB_TOKEN / GITEE_TOKEN，已中止。');
    process.exitCode = 1;
    return;
  }

  try {
    console.log('\n[1/4] 预检: npm test + build');
    run('npm', ['test']);
    run('npm', ['run', 'build']);

    console.log('[2/4] 暂存并提交');
    if (scope === 'all') {
      run('git', ['add', '-A']);
    } else {
      run('git', [
        'add',
        '.env.example',
        'package.json',
        'tsconfig.json',
        'README.md',
        'v0.1_MVP_实施规划.md',
        'v0.2a_MVP_实施规划.md',
        'v0.2b_MVP_实施规划.md',
        '一人公司AI-Agent需求文档_v2.5.md',
        'src/',
        'scripts/',
        'bench/',
        'docs/',
      ]);
    }
    const staged = run('git', ['diff', '--cached', '--name-only']);
    if (!staged) {
      console.log('没有可提交的变更，结束。');
      return;
    }
    run('git', ['commit', '-m', message]);

    console.log('[3/4] 推送 GitHub/Gitee');
    for (const h of hosts) {
      if (!h.hasToken) {
        console.log(`跳过 ${h.host}（token 未配置）`);
        continue;
      }
      if (!currentRemotes.includes(h.remote)) {
        run('git', ['remote', 'add', h.remote, h.url]);
      }
      await ensureRemoteRepo(h);
      const pushOut = run('git', ['push', h.remote, `HEAD:${branch}`]);
      console.log(`  ${h.host}: push 完成`);
      logEvent({ host: h.host, repo, branch, action: 'push', ok: true, output: pushOut.slice(0, 200) });
    }

    console.log('[4/4] 完成');
    for (const h of hosts) {
      if (h.hasToken) console.log(`  ${h.host}: https://${h.host}/${userOf(h.host)}/${repo}`);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`\n推送失败：${detail}`);
    logEvent({ repo, branch, action: 'push', ok: false, error: detail.slice(0, 300) });
    process.exitCode = 1;
  }
}

function userOf(host: string): string {
  return host === 'github.com' ? GITHUB_USER : GITEE_USER;
}

main().catch((err) => {
  console.error(`推送流程异常：${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
