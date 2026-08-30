import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runGithubProjectCommand } from './github-project.js';
import type { GithubContract } from '../github-reader/index.js';
import type { HttpCacheLike } from '../deps.js';

// ── mock fetch 基建（不引入新依赖；按 URL 路由返回 fixture）──

function jsonBody(obj: unknown): string {
  return JSON.stringify(obj);
}

function okText(text: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as unknown as Response;
}

type MockRoute = {
  match: (url: string) => boolean;
  respond: (url: string) => Response | null;
};

function mockFetch(routes: MockRoute[]): typeof fetch {
  const impl = async (url: string): Promise<Response> => {
    for (const route of routes) {
      if (route.match(url)) {
        const resp = route.respond(url);
        if (resp) return resp;
      }
    }
    return okText('Not Found', 404);
  };
  return impl as unknown as typeof fetch;
}

const matches = (fragment: string) => (url: string) => url.includes(fragment);

const REPO_API = 'https://api.github.com/repos/andrewyng/openworker';

const REPO_META = {
  full_name: 'andrewyng/openworker',
  stargazers_count: 15_045,
  forks_count: 1_234,
  open_issues_count: 438,
  license: { spdx_id: 'Apache-2.0' },
  language: 'TypeScript',
  default_branch: 'main',
  pushed_at: '2026-08-20T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  description: 'Open source AI agent platform for the enterprise',
  topics: ['ai', 'agent'],
};

const README_MD = `# OpenWorker

An open-source AI agent platform that helps teams automate delivery.

## Architecture

Pipeline: query → intent routing → skill execution → answer synthesis.

## Quick Start

git clone https://github.com/andrewyng/openworker

## Use Cases

- 自动化交付
- 工程协作`;

/** 全成功路由 */
function fullSuccessRoutes(): MockRoute[] {
  return [
    {
      match: matches(`${REPO_API}/releases?per_page=30`),
      respond: () =>
        okText(
          jsonBody([
            { tag_name: 'v2.0.0', published_at: '2026-08-01T00:00:00Z', draft: false },
            { tag_name: 'v1.9.0', published_at: '2026-07-01T00:00:00Z', draft: false },
            { tag_name: 'v1.8.0', published_at: '2026-06-01T00:00:00Z', draft: false },
          ]),
        ),
    },
    {
      match: matches(`${REPO_API}/contributors?per_page=100`),
      respond: () => okText(jsonBody(Array.from({ length: 12 }, (_, i) => ({ id: i })))),
    },
    {
      match: matches(`${REPO_API}/commits?per_page=100`),
      respond: () => okText(jsonBody(Array.from({ length: 60 }, (_, i) => ({ sha: String(i) })))),
    },
    { match: (url) => url === REPO_API, respond: () => okText(jsonBody(REPO_META)) },
    {
      match: matches('raw.githubusercontent.com/andrewyng/openworker/main/README.md'),
      respond: () => okText(README_MD),
    },
  ];
}

test('github-project: 无仓库链接 → no_repo 诚实引导', async () => {
  const result = await runGithubProjectCommand('帮我看下这个项目怎么样', {
    fetchImpl: mockFetch([]),
    complete: undefined,
  });
  assert.equal(result.ok, false);
  assert.equal(result.action, 'no_repo');
  assert.ok(result.error !== undefined && result.error.includes('GitHub'));
});

test('github-project: 全成功 → X.6 契约 + health_score + evidence', async () => {
  const result = await runGithubProjectCommand(
    'https://github.com/andrewyng/openworker 这项目是做什么用的？',
    { fetchImpl: mockFetch(fullSuccessRoutes()), timeoutMs: 500, complete: undefined },
  );
  assert.equal(result.ok, true);
  assert.equal(result.action, 'analyze');
  const contract = result.contract as GithubContract;
  assert.equal(contract.repo, 'andrewyng/openworker');
  assert.equal(contract.depth, 'README 级判断');
  assert.ok(contract.health_score > 0);
  assert.ok(contract.health_basis.length > 0);
  assert.ok((contract.evidence ?? []).length > 0);
  assert.ok(result.answer !== undefined);
});

test('github-project: API 全失败 → 降级 raw/网页 + 显式未获取', async () => {
  const result = await runGithubProjectCommand('https://github.com/andrewyng/openworker', {
    fetchImpl: mockFetch([]),
    timeoutMs: 500,
    complete: undefined,
  });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'analyze');
  const contract = result.contract as GithubContract;
  assert.ok(contract.positioning.includes('未获取') || contract.meta.stars === null);
});

test('github-project: 无 LLM 注入 → 结构化契约兜底（不抛错）', async () => {
  const result = await runGithubProjectCommand(
    'https://github.com/andrewyng/openworker 值不值得用？',
    { fetchImpl: mockFetch(fullSuccessRoutes()), timeoutMs: 500, complete: undefined },
  );
  assert.equal(result.ok, true);
  assert.ok(result.answer !== undefined);
  assert.ok(result.answer.includes('README 级判断'));
});




test('github-project: httpCache 注入后二次运行 GitHub API 命中缓存（E290）', async () => {
  let apiFetches = 0;
  const routes = fullSuccessRoutes();
  const fetchImpl = (async (url: string): Promise<Response> => {
    if (url.includes('api.github.com')) apiFetches++;
    for (const route of routes) {
      const resp = route.respond(url);
      if (resp) return resp;
    }
    return okText('Not Found', 404);
  }) as unknown as typeof fetch;
  const store = new Map<string, string>();
  const httpCache: HttpCacheLike = {
    get: (url) => store.get(url) ?? null,
    set: (url, body) => {
      store.set(url, body);
    },
  };
  const opts = { fetchImpl, timeoutMs: 500, complete: undefined, httpCache };
  const first = await runGithubProjectCommand('https://github.com/andrewyng/openworker 这项目是做什么用的？', opts);
  assert.equal(first.ok, true);
  const firstRunApiFetches = apiFetches;
  assert.ok(firstRunApiFetches >= 4, '首次运行应抓取 repo/contributors/commits/releases 四个 API');
  const second = await runGithubProjectCommand('https://github.com/andrewyng/openworker 这项目是做什么用的？', opts);
  assert.equal(second.ok, true);
  const secondRunApiFetches = apiFetches - firstRunApiFetches;
  assert.ok(
    secondRunApiFetches <= 1,
    `二次运行 GitHub API 调用应 ≤1（repo/contributors/releases 命中 [P-142] 缓存，仅 commits since 秒级变动可 miss），实际 ${secondRunApiFetches}`,
  );
  assert.ok(secondRunApiFetches < firstRunApiFetches, '缓存应显著减少二次运行的 API 调用');
});
