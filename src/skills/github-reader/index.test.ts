import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  createGithubReaderSkill,
  extractRepo,
  type GithubContract,
} from './index.js';
import type { SkillDeps } from '../deps.js';

// ── mock fetch 基础设施（不引入新依赖；按 URL 路由返回 fixture）──

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
  respond: (url: string) => Response | null; // null → 继续下一个路由
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

const NOW = Date.parse('2026-08-26T12:00:00Z');

const REPO_API = 'https://api.github.com/repos/zephyrproject-rtos/zephyr';

const REPO_META = {
  full_name: 'zephyrproject-rtos/zephyr',
  stargazers_count: 15_045,
  forks_count: 1_234,
  open_issues_count: 438,
  license: { spdx_id: 'Apache-2.0' },
  language: 'TypeScript',
  default_branch: 'main',
  pushed_at: '2026-08-26T12:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  description: 'Open source AI agent platform for the enterprise',
  topics: ['ai', 'agent'],
};

const README_MD = `# Zephyr AI Agent

An open-source AI agent platform that helps embedded engineers automate
datasheet lookup, schematic review and firmware build.

## Architecture

Pipeline: query → intent routing → skill execution → answer synthesis.

## Quick Start

\`\`\`bash
git clone https://github.com/zephyrproject-rtos/zephyr
npm install && npm run dev
\`\`\`

## Use Cases

- 芯片选型与替代
- 电路审查
- 固件工程协作`;

const ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>v0.2.1</title>
    <link rel="alternate" type="text/html" href="https://github.com/andrewyng/openworker/releases/tag/v0.2.1"/>
    <published>2026-08-20T10:00:00Z</published>
  </entry>
  <entry>
    <title>v0.1.0</title>
    <link rel="alternate" type="text/html" href="https://github.com/andrewyng/openworker/releases/tag/v0.1.0"/>
    <published>2025-06-01T10:00:00Z</published>
  </entry>
</feed>`;

/** 全成功路由：API 元数据 + contributors + commits + releases + raw README + package.json */
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
            { tag_name: 'v1.7.0', published_at: '2026-05-01T00:00:00Z', draft: false },
            { tag_name: 'v1.6.0', published_at: '2026-04-01T00:00:00Z', draft: false },
            { tag_name: 'v1.5.0', published_at: '2026-03-01T00:00:00Z', draft: false },
          ]),
        ),
    },
    {
      match: matches(`${REPO_API}/contributors?per_page=100`),
      respond: () => okText(jsonBody(Array.from({ length: 15 }, (_, i) => ({ id: i })))),
    },
    {
      match: matches(`${REPO_API}/commits?per_page=100`),
      respond: () => okText(jsonBody(Array.from({ length: 100 }, (_, i) => ({ sha: String(i) })))),
    },
    { match: (url) => url === REPO_API, respond: () => okText(jsonBody(REPO_META)) },
    {
      match: matches('raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/package.json'),
      respond: () =>
        okText(
          jsonBody({
            dependencies: {
              'zlib-old': '1.0.0',
              'beta-mid': '2.0.1',
              'alpha-new': '2.3.4',
            },
          }),
        ),
    },
    {
      match: matches('raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/README.md'),
      respond: () => okText(README_MD),
    },
  ];
}

async function runSkill(
  query: string,
  routes: MockRoute[],
  opts: { timeoutMs?: number; now?: () => number } = {},
): Promise<{ contract: GithubContract; answer: string; evidence: unknown[]; confidence: number }> {
  const skill = createGithubReaderSkill({
    fetchImpl: mockFetch(routes),
    timeoutMs: opts.timeoutMs ?? 500,
    now: opts.now ?? (() => NOW),
  });
  const output = await skill.execute(
    { query, attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '' } as SkillDeps,
  );
  const result = output.result as {
    contract: GithubContract;
    answer: string;
    evidence: unknown[];
    confidence: number;
  };
  return result;
}

// ── 1. 契约结构：8 字段 + depth + evidence（api+raw）+ README 级标注 ──
test('github-reader: 契约结构与健康分 82（对齐 POC-C openworker 冒烟口径）', async () => {
  const { contract, answer } = await runSkill(
    'https://github.com/zephyrproject-rtos/zephyr 这项目是做什么用的？',
    fullSuccessRoutes(),
  );
  assert.equal(contract.repo, 'zephyrproject-rtos/zephyr');
  assert.equal(contract.depth, 'README 级判断');
  assert.ok(contract.positioning.includes('AI agent platform'));
  assert.ok(contract.architecture.includes('Pipeline'));
  assert.ok(contract.usage.includes('git clone'));
  assert.ok(contract.scenarios.includes('芯片选型'));
  assert.ok(contract.tech_stack.includes('主语言：TypeScript'));
  assert.equal(contract.health_score, 82);
  assert.ok(contract.health_basis.some((b) => b.includes('Star 15,045（18 分）')));
  assert.ok(contract.health_basis.some((b) => b.includes('近6月提交 100（22 分）')));
  assert.ok(contract.health_basis.some((b) => b.includes('Open Issues 438（5 分）')));
  assert.ok(contract.meta.license === 'Apache-2.0');
  assert.ok(contract.meta.topics.includes('ai'));
  assert.equal(contract.evidence.some((e) => e.type === 'api'), true);
  assert.equal(contract.evidence.some((e) => e.type === 'raw'), true);
  // 无 LLM：诚实提示 + 结构化契约
  assert.ok(answer.includes('L1 结构化解读'));
});

// ── 2. LLM 合成注入《专业审阅协议 §一》──
test('github-reader: deps.complete 时注入审阅协议并按契约合成', async () => {
  const skill = createGithubReaderSkill({
    fetchImpl: mockFetch(fullSuccessRoutes()),
    timeoutMs: 500,
    now: () => NOW,
  });
  let systemPrompt = '';
  let userPrompt = '';
  const complete = {
    complete: async (
      messages: Array<{ role: string; content: string }>,
    ): Promise<string> => {
      systemPrompt = messages[0].content;
      userPrompt = messages[1].content;
      return '一句话结论：值得关注的开源项目。';
    },
  };
  const output = await skill.execute(
    { query: 'https://github.com/zephyrproject-rtos/zephyr 值不值得用？', attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '', complete } as unknown as SkillDeps,
  );
  const result = output.result as {
    answer: string;
    contract: GithubContract;
    evidence: unknown[];
    confidence: number;
  };
  assert.equal(result.answer, '一句话结论：值得关注的开源项目。');
  assert.ok(systemPrompt.includes('README 级判断'));
  assert.ok(systemPrompt.includes('诚实边界'));
  assert.ok(systemPrompt.includes('一句话结论 → 定位 → 架构与栈'));
  assert.ok(userPrompt.includes('X.6 契约 JSON'));
  assert.ok(userPrompt.includes('zephyrproject-rtos/zephyr'));
  assert.equal(result.confidence, 0.85);
});

// ── 3. API 全失败降级：raw README + releases.atom 兜底 ──
test('github-reader: API 全失败时走 raw + releases.atom 降级，缺字段显式未获取', async () => {
  const routes: MockRoute[] = [
    { match: (url) => url.includes('api.github.com'), respond: () => null },
    {
      match: matches('raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/README.md'),
      respond: () => okText(README_MD),
    },
    {
      match: matches('/releases.atom'),
      respond: () => okText(ATOM_XML),
    },
  ];
  const { contract, answer } = await runSkill(
    'github.com/zephyrproject-rtos/zephyr 这个项目怎么样',
    routes,
  );
  assert.ok(contract.positioning.includes('AI agent platform'));
  assert.equal(contract.tech_stack.includes('未获取（主语言'), true);
  assert.equal(contract.meta.latest_release, 'v0.2.1');
  assert.equal(contract.meta.releases_6m, 1);
  assert.equal(contract.evidence.some((e) => e.type === 'raw'), true);
  assert.equal(contract.evidence.some((e) => e.type === 'web'), true);
  assert.equal(contract.health_score, 3); // Release 1→8 分，License 缺失 -5
  assert.ok(contract.health_basis.some((b) => b.includes('近6月 Release 1（8 分）')));
  assert.ok(answer.includes('未获取'));
});

// ── 4. API 部分失败：contributors/commits/releases 各自缺失仍出解读 ──
test('github-reader: API 部分失败（contributors/commits/releases 缺失）仍出解读', async () => {
  const routes: MockRoute[] = [
    {
      match: matches(`${REPO_API}/releases?per_page=30`),
      respond: () => okText('Forbidden', 403),
    },
    {
      match: matches(`${REPO_API}/contributors?per_page=100`),
      respond: () => okText('Forbidden', 403),
    },
    {
      match: matches(`${REPO_API}/commits?per_page=100`),
      respond: () => okText('Forbidden', 403),
    },
    { match: (url) => url === REPO_API, respond: () => okText(jsonBody(REPO_META)) },
    {
      match: matches('raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/README.md'),
      respond: () => okText(README_MD),
    },
  ];
  const { contract } = await runSkill(
    'https://github.com/zephyrproject-rtos/zephyr',
    routes,
  );
  assert.equal(contract.meta.contributors, null);
  assert.equal(contract.meta.commits_6m, null);
  assert.equal(contract.meta.releases_6m, null);
  assert.ok(contract.health_basis.includes('近6月提交 未获取'));
  assert.ok(contract.health_basis.includes('贡献者 未获取'));
  assert.ok(contract.health_basis.includes('近6月 Release 未获取'));
  assert.ok(contract.positioning.includes('AI agent platform'));
  // 只有 Star/Issue/推送/许可证参与计分：18 + 5 + 10 + 0 = 33
  assert.equal(contract.health_score, 33);
});

// ── 5. README 缺失 / manifest 缺失 ──
test('github-reader: README 与 manifest 全缺失时字段显式未获取且带风险', async () => {
  const routes: MockRoute[] = [
    { match: (url) => url === REPO_API, respond: () => okText(jsonBody(REPO_META)) },
    {
      match: matches(`${REPO_API}/releases?per_page=30`),
      respond: () => okText(jsonBody([])),
    },
    {
      match: matches(`${REPO_API}/contributors?per_page=100`),
      respond: () => okText(jsonBody([])),
    },
    {
      match: matches(`${REPO_API}/commits?per_page=100`),
      respond: () => okText(jsonBody([])),
    },
  ];
  const { contract } = await runSkill(
    'https://github.com/zephyrproject-rtos/zephyr',
    routes,
  );
  assert.ok(contract.positioning.includes('未获取（README 缺失）'));
  assert.ok(contract.architecture.includes('未获取（README 缺失）'));
  assert.ok(contract.usage.includes('未获取（README 缺失）'));
  assert.ok(contract.scenarios.includes('未获取（README 缺失）'));
  assert.ok(contract.tech_stack.includes('主语言：TypeScript'));
  assert.ok(contract.tech_stack.includes('未获取（manifest'));
  assert.ok(contract.risks.some((r) => r.includes('README 未获取')));
});

// ── 6. health_score 边界：全无数据 → 0；License 缺失扣分 ──
test('github-reader: 全无数据时健康分 0 且逐项注明未获取', async () => {
  const { contract } = await runSkill(
    'https://github.com/zephyrproject-rtos/zephyr',
    [{ match: () => false, respond: () => null }],
  );
  assert.equal(contract.health_score, 0);
  for (const b of contract.health_basis) {
    assert.ok(b.includes('未获取') || b.includes('License 缺失'), b);
  }
  assert.ok(contract.risks.some((r) => r.includes('许可')));
});

test('github-reader: License 缺失时 -5 分并记风险（不给法律建议）', async () => {
  const metaNoLicense = { ...REPO_META, license: null };
  const routes: MockRoute[] = [
    { match: (url) => url === REPO_API, respond: () => okText(jsonBody(metaNoLicense)) },
    {
      match: matches(`${REPO_API}/releases?per_page=30`),
      respond: () => okText(jsonBody([])),
    },
    {
      match: matches(`${REPO_API}/contributors?per_page=100`),
      respond: () => okText(jsonBody([])),
    },
    {
      match: matches(`${REPO_API}/commits?per_page=100`),
      respond: () => okText(jsonBody([])),
    },
    {
      match: matches('raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/README.md'),
      respond: () => okText(README_MD),
    },
  ];
  const { contract } = await runSkill('https://github.com/zephyrproject-rtos/zephyr', routes);
  assert.ok(contract.health_basis.some((b) => b.includes('License 缺失/NOASSERTION（-5 分）')));
  // 18 + 0 + 3 + 5 + 3 + 10 - 5 = 34
  assert.equal(contract.health_score, 34);
  assert.ok(contract.risks.some((r) => r.includes('自行确认许可')));
  assert.ok(contract.risks.some((r) => r.includes('不构成法律建议')));
});

// ── 7. manifest 解析：五类清单 + package.json 版本倒序 ──
test('github-reader: manifest 五类解析且 package.json 按版本倒序', async () => {
  const routes: MockRoute[] = [
    { match: (url) => url === REPO_API, respond: () => okText(jsonBody(REPO_META)) },
    {
      match: matches(`${REPO_API}/releases?per_page=30`),
      respond: () => okText(jsonBody([])),
    },
    {
      match: matches(`${REPO_API}/contributors?per_page=100`),
      respond: () => okText(jsonBody([])),
    },
    {
      match: matches(`${REPO_API}/commits?per_page=100`),
      respond: () => okText(jsonBody([])),
    },
    {
      match: matches('raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/README.md'),
      respond: () => okText(README_MD),
    },
    {
      match: matches('/package.json'),
      respond: () =>
        okText(
          jsonBody({
            dependencies: {
              'zlib-old': '1.0.0',
              'beta-mid': '2.0.1',
              'alpha-new': '2.3.4',
            },
          }),
        ),
    },
    {
      match: matches('/pyproject.toml'),
      respond: () =>
        okText('[project]\ndependencies = ["requests>=2.0", "flask==3.0.0", "numpy"]\n'),
    },
    {
      match: matches('/requirements.txt'),
      respond: () => okText('# deps\nrequests>=2.28\nnumpy==1.24\n- torch\n'),
    },
    {
      match: matches('/go.mod'),
      respond: () =>
        okText('module github.com/foo/bar\n\ngo 1.21\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.0\n\tk8s.io/api v0.28.0\n)\n'),
    },
    {
      match: matches('/Cargo.toml'),
      respond: () =>
        okText('[package]\nname = "myproj"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\ntokio = { version = "1.30", features = ["full"] }\n'),
    },
  ];
  const { contract } = await runSkill('https://github.com/zephyrproject-rtos/zephyr', routes);
  const stack = contract.tech_stack;
  const pkgIdx = stack.indexOf('alpha-new@2.3.4');
  const midIdx = stack.indexOf('beta-mid@2.0.1');
  const oldIdx = stack.indexOf('zlib-old@1.0.0');
  assert.ok(pkgIdx >= 0 && midIdx >= 0 && oldIdx >= 0);
  assert.ok(pkgIdx < midIdx && midIdx < oldIdx, 'package.json 依赖应按版本倒序');
  assert.ok(stack.includes('package.json：'));
  assert.ok(stack.includes('pyproject.toml：requests, flask, numpy'));
  assert.ok(stack.includes('requirements.txt：requests, numpy'));
  assert.ok(stack.includes('go.mod：module github.com/foo/bar, github.com/gin-gonic/gin, k8s.io/api'));
  assert.ok(stack.includes('Cargo.toml：serde, tokio'));
});

// ── 8. URL 提取边界：.git、查询参数、中文紧贴、非 github.com ──
test('github-reader: URL 提取边界（.git/查询参数/中文紧贴/非 github.com）', () => {
  assert.deepEqual(extractRepo('https://github.com/foo/bar.git'), { owner: 'foo', repo: 'bar' });
  assert.deepEqual(extractRepo('https://github.com/foo/bar?tab=readme-ov-file'), {
    owner: 'foo',
    repo: 'bar',
  });
  assert.deepEqual(extractRepo('分析https://github.com/zephyrproject-rtos/zephyr这个项目'), {
    owner: 'zephyrproject-rtos',
    repo: 'zephyr',
  });
  assert.equal(extractRepo('https://example.com/foo/bar'), null);
  assert.equal(extractRepo('https://github.com/foo'), null);
  assert.equal(extractRepo('2026/08 的行情怎么样'), null); // 无 github 语境不抓文本
  assert.deepEqual(extractRepo('帮我看看 github 上 zephyrproject-rtos/zephyr'), {
    owner: 'zephyrproject-rtos',
    repo: 'zephyr',
  });
});

// ── 9. fetch 404 / 超时：不抛错、走降级 ──
test('github-reader: fetch 全部 404 不抛错，返回结构化兜底', async () => {
  const { contract, answer } = await runSkill(
    'https://github.com/zephyrproject-rtos/zephyr',
    [{ match: () => false, respond: () => null }],
  );
  assert.equal(contract.health_score, 0);
  assert.ok(contract.health_basis.every((b) => b.includes('未获取') || b.includes('License 缺失')));
  assert.ok(answer.includes('未获取'));
});

test('github-reader: fetch 超时（AbortSignal）不抛错', async () => {
  const neverFetch = (async (_url: string, init?: RequestInit) => {
    await new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) {
        reject(new Error('aborted'));
        return;
      }
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
    throw new Error('unreachable');
  }) as unknown as typeof fetch;
  const skill = createGithubReaderSkill({ fetchImpl: neverFetch, timeoutMs: 20, now: () => NOW });
  const output = await skill.execute(
    { query: 'https://github.com/zephyrproject-rtos/zephyr', attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '' } as SkillDeps,
  );
  const result = output.result as { contract: GithubContract; answer: string };
  assert.equal(result.contract.health_score, 0);
  assert.ok(result.answer.includes('未获取'));
});

// ── 10. 无 deps.complete 兜底：结构化契约 + 诚实提示 ──
test('github-reader: 无 deps.complete 返回结构化契约与诚实提示', async () => {
  const { contract, answer, confidence } = await runSkill(
    'https://github.com/zephyrproject-rtos/zephyr 值不值得用？',
    fullSuccessRoutes(),
  );
  assert.ok(contract.positioning);
  assert.equal(contract.health_score, 82);
  assert.ok(answer.includes('L1 结构化解读'));
  assert.equal(confidence, 0.7);
});

// ── 11. README 定位过滤：跳过徽章/导航/图片行 ──
test('github-reader: positioning 过滤图片/徽章/导航行', async () => {
  const readmeWithBadges = `<p align="center"><img src="https://img.shields.io/badge/build-passing-brightgreen"/></p>

[![Build Status](https://ci.example.com/badge.svg)](https://ci.example.com)

[![Coverage](https://img.shields.io/coverage.svg)](https://example.com)

# Title

Real content line: an AI agent platform for embedded engineers.

## Quick Start

npm install
`;
  const routes: MockRoute[] = [
    { match: (url) => url === REPO_API, respond: () => okText(jsonBody(REPO_META)) },
    {
      match: matches(`${REPO_API}/releases?per_page=30`),
      respond: () => okText(jsonBody([])),
    },
    {
      match: matches(`${REPO_API}/contributors?per_page=100`),
      respond: () => okText(jsonBody([])),
    },
    {
      match: matches(`${REPO_API}/commits?per_page=100`),
      respond: () => okText(jsonBody([])),
    },
    {
      match: matches('raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/README.md'),
      respond: () => okText(readmeWithBadges),
    },
  ];
  const { contract } = await runSkill('https://github.com/zephyrproject-rtos/zephyr', routes);
  assert.ok(contract.positioning.includes('Real content line'));
  assert.equal(contract.positioning.includes('Build Status'), false);
  assert.equal(contract.positioning.includes('img.shields'), false);
  assert.ok(contract.usage.includes('npm install'));
});

// ── 12. LLM 合成失败兜底 ──
test('github-reader: LLM 合成抛错时落到结构化契约兜底', async () => {
  const skill = createGithubReaderSkill({
    fetchImpl: mockFetch(fullSuccessRoutes()),
    timeoutMs: 500,
    now: () => NOW,
  });
  const complete = {
    complete: async (): Promise<string> => {
      throw new Error('LLM timeout');
    },
  };
  const output = await skill.execute(
    { query: 'https://github.com/zephyrproject-rtos/zephyr', attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '', complete } as unknown as SkillDeps,
  );
  const result = output.result as { contract: GithubContract; answer: string };
  assert.equal(result.contract.health_score, 82);
  assert.ok(result.answer.includes('L1 结构化解读'));
});

// ── 13. 无仓库链接给出引导 ──
test('github-reader: 无仓库链接时请求提供链接', async () => {
  const skill = createGithubReaderSkill({ fetchImpl: mockFetch([]), timeoutMs: 50 });
  const output = await skill.execute(
    { query: '帮我分析一个开源项目', attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '' } as SkillDeps,
  );
  const result = output.result as { error: string; answer: string };
  assert.equal(result.error, 'no_repo');
  assert.ok(result.answer.includes('GitHub 仓库链接'));
});




