/**
 * Skill: github-reader（GitHub 项目解读，X.6 契约）
 *
 * L1 结构化抓取（GitHub API 元数据 + raw README/manifest + Release/提交/贡献者）
 * → X.6 契约 → LLM 按《专业审阅协议 §一》顺序合成，带「README 级判断」诚实标注与
 * 可点来源 evidence[]。无 LLM 时返回结构化契约对象 + 诚实提示。
 *
 * 契约与降级链借鉴 POC-C `run_deep_github_analyze`（见 docs/borrowed-designs.md 2.5），
 * 代码为 TypeScript 重写：GitHub API → raw.githubusercontent → releases.atom/仓库主页 →
 * 显式「未获取（原因）」，任一环节失败只降级、不抛错。
 */

import { performance } from 'node:perf_hooks';

import { PARAMS } from '../../config/params.js';
import { isLengthTruncated } from '../../search/llm-client.js';
import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { HttpCacheLike, SkillDeps } from '../deps.js';

export type EvidenceType = 'api' | 'raw' | 'web';

export interface EvidenceEntry {
  type: EvidenceType;
  url: string;
  accessed_at: string; // ISO
}

export interface GithubMeta {
  stars: number | null;
  forks: number | null;
  open_issues: number | null;
  license: string; // SPDX 标识或「未获取（原因）」
  language: string;
  default_branch: string;
  pushed_at: string;
  created_at: string;
  description: string;
  topics: string[];
  contributors: number | null;
  commits_6m: number | null;
  latest_release: string;
  latest_published: string;
  releases_6m: number | null;
}

export interface GithubContract {
  repo: string;
  depth: string; // 「README 级判断」——只做 L1，不冒充源码级
  positioning: string;
  architecture: string;
  tech_stack: string;
  usage: string;
  scenarios: string;
  readme_excerpt: string;
  health_score: number;
  health_basis: string[];
  risks: string[];
  meta: GithubMeta;
  evidence: EvidenceEntry[];
}

/** P1 计时埋点：区分 L1 抓取与 LLM 合成各自耗时 */
export interface GithubSkillTiming {
  totalMs: number;
  fetchMs: number;
  synthesisMs: number;
  synthesisError?: string;
}

export interface GithubReaderOptions {
  /** 测试注入：API 基址（默认 https://api.github.com） */
  apiBase?: string;
  /** 测试注入：raw 基址（默认 https://raw.githubusercontent.com） */
  rawBase?: string;
  /** 测试注入：仓库主页基址（默认 https://github.com） */
  webBase?: string;
  /** 超时（默认 8s，对齐 POC-C 的 API/raw 各 8s） */
  timeoutMs?: number;
  /** 测试注入：时间源，6 月窗口与最近推送天数据此计算 */
  now?: () => number;
  /** 测试注入：fetch 实现，默认 globalThis.fetch */
  fetchImpl?: typeof fetch;
  /** E284：GitHub API JSON 响应缓存（repo/contributors/commits/releases；raw README/manifest 不缓存） */
  httpCache?: HttpCacheLike;
}

interface RepoApi {
  full_name?: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  license?: { spdx_id?: string } | null;
  language?: string | null;
  default_branch?: string | null;
  pushed_at?: string | null;
  created_at?: string | null;
  description?: string | null;
  topics?: string[];
}

interface ReleaseApi {
  tag_name?: string;
  published_at?: string | null;
  draft?: boolean;
}

const GITHUB_URL_RE = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/;
/** owner/repo 文本形式：需要前后非词字符边界，避免把路径/日期当仓库 */
const OWNER_REPO_RE =
  /(?:^|[\s（(，,；;：:"'`])([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9][A-Za-z0-9_.-]{0,99})(?=$|[\s，。；、？?）):："'`])/;

const README_CANDIDATES = [
  'README.md',
  'README_CN.md',
  'readme.md',
  'README.rst',
  'README.txt',
];
const MANIFEST_CANDIDATES = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
];
// HEAD 直连默认分支，优先试探可避免 main/master 逐分支串行 404
const BRANCH_CANDIDATES = ['HEAD', 'main', 'master'];
/** README 只读前 96KB（对齐 POC-C 大仓库策略；上下文有界，避免拉爆） */
const README_MAX_BYTES = 96 * 1024;
/** manifest 只读前 64KB（依赖摘要足够） */
const MANIFEST_MAX_BYTES = 64 * 1024;
/** README 章节提取上限字符数 */
const SECTION_MAX_CHARS = 600;
/** README 原文有界截取进契约，修复章节正则漏检时的空壳推断（LLM 直接可见正文） */
const README_EXCERPT_MAX_CHARS = 8000;
/** 每个 manifest 最多提取的依赖项数 */
const MANIFEST_MAX_ITEMS = 12;
/** github-reader 合成输出上限：首轮与截断重试均 4096（配合协议 ≤1200 字约束，正常输出远低于上限） */
const SYNTH_MAX_TOKENS_FIRST = 4096;
const SYNTH_MAX_TOKENS_RETRY = 4096;
/** 近 6 月窗口（183 天，对齐 POC-C since 参数） */
const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;
/** Cargo.toml 元数据键（name/version 等不属于依赖） */
const CARGO_METADATA_KEYS = new Set([
  'name',
  'version',
  'edition',
  'rust-version',
  'description',
  'authors',
  'license',
  'readme',
  'repository',
  'homepage',
  'documentation',
  'categories',
  'keywords',
  'default-run',
  'publish',
  'build',
  'links',
  'include',
  'exclude',
]);

/** 《专业审阅协议 §一》节选（注入 LLM system） */
const REVIEW_PROTOCOL_SYSTEM = `你是一个严谨的 GitHub 项目审阅助手。回答「这个 GitHub 项目是做什么的 / 值不值得用 / 能不能借鉴」时，只依据下方提供的 L1 抓取数据（X.6 契约）发言。

覆盖维度（内部检查清单，不是输出目录）：定位与解决的问题、适用场景、架构/模块/数据流、技术栈/运行时/部署、安装与使用、模型/工具/MCP/插件机制、活跃度（提交/Release/Issue）、许可证、隐私/安全/供应链风险、成熟度与隐藏成本、与同类项目差异、对当前项目的适配建议、可复用/改造/参考/放弃清单。

输出要求（硬性）：
- 总字数 ≤ 1200 字，只写有数据支撑的维度；数据缺失的维度不展开，在「仍需确认」一句带过。
- 输出顺序固定：一句话结论（仅当信息完整且 confidence > 0.6）→ 定位 → 架构与栈 → 使用 → 活跃度与许可证 → 风险 → 对当前项目的建议 → 仍需确认。
- 每节 1-3 句，禁止逐项编号展开覆盖清单。

数据边界（硬性）：
- 本次只抓取 README、manifest（package.json 等）、GitHub API 元数据（repo/contributors/commits/releases）与 evidence 列表；未出现在这些数据中的文件名、CLI 参数、功能描述、文件内容一律不得提及，只能写「未获取（未抓取）」。
- 字段值「未获取（原因）」或 null 表示数据缺失，禁止编造或补全。
- 深度分级：仅基于 README → 标注「README 级判断」；源码级结论需检查入口、目录、依赖、关键模块、许可证与运行路径，并注明检查范围与日期。

诚实边界：Star 数 ≠ 质量；README 宣称 ≠ 已实现；「活跃维护」必须有量化依据（近 N 月提交等）；License 只给事实，不给法律建议；confidence ≤ 0.6 或任一核心维度「未获取」时，禁止「值得关注」「解决的核心痛点」「一句话结论」等断言式措辞，改用「可能」「推测」「README 暗示」「需进一步验证」等限定词。`;

/** 缺失字段统一显式标注，不硬凑 */
function notFetched(reason: string): string {
  return `未获取（${reason}）`;
}

export function extractRepo(query: string): { owner: string; repo: string } | null {
  const urlMatch = query.match(GITHUB_URL_RE);
  if (urlMatch) {
    const owner = urlMatch[1];
    const repo = urlMatch[2].replace(/\.git$/, '').replace(/\/+$/, '');
    if (owner && repo) return { owner, repo };
  }
  // 文本形式需要 github 语境，避免误抓「2026/08」「src/skills」这类普通路径
  if (!/github|仓库|repo/i.test(query)) return null;
  const textMatch = query.match(OWNER_REPO_RE);
  if (textMatch) return { owner: textMatch[1], repo: textMatch[2] };
  return null;
}

/** 读取文本，超时/非 2xx/网络错误一律返回 null（降级链入口，不抛错） */
async function httpGetText(
  url: string,
  opts: GithubReaderOptions & { maxBytes?: number },
): Promise<string | null> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8_000);
  try {
    const resp = await fetchImpl(url, {
      headers: { 'User-Agent': 'ai-butler-github-reader' },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    if (opts.maxBytes === undefined || !resp.body) {
      const text = await resp.text();
      return opts.maxBytes === undefined ? text : text.slice(0, opts.maxBytes);
    }
    // 大文件流式限读：只取前 maxBytes，避免把 10MB+ README 全量拉进上下文
    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (received < opts.maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.length, opts.maxBytes - received);
      chunks.push(value.subarray(0, take));
      received += take;
      if (received >= opts.maxBytes) break;
    }
    void reader.cancel().catch(() => {});
    const decoder = new TextDecoder();
    let out = '';
    for (let i = 0; i < chunks.length; i++) {
      out += decoder.decode(chunks[i], { stream: i < chunks.length - 1 });
    }
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function httpGetJson<T>(
  url: string,
  opts: GithubReaderOptions,
): Promise<T | null> {
  if (opts.httpCache) {
    const hit = opts.httpCache.get(url);
    if (hit !== null) {
      try {
        return JSON.parse(hit) as T;
      } catch {
        // 坏缓存条目按 miss 处理，重抓后覆盖
      }
    }
  }
  const text = await httpGetText(url, opts);
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as T;
    // E284：仅成功解析的 JSON 才写缓存，避免把 200 状态的非 JSON 错误页缓存成永久 miss
    if (opts.httpCache) opts.httpCache.set(url, text, PARAMS.githubApiCacheTtlMs);
    return parsed;
  } catch {
    return null;
  }
}

function emptyMeta(): GithubMeta {
  return {
    stars: null,
    forks: null,
    open_issues: null,
    license: '',
    language: '',
    default_branch: '',
    pushed_at: '',
    created_at: '',
    description: '',
    topics: [],
    contributors: null,
    commits_6m: null,
    latest_release: '',
    latest_published: '',
    releases_6m: null,
  };
}

/** releases：API 失败时用仓库主页 releases.atom 兜底（web 证据） */
async function fetchReleases(
  owner: string,
  repo: string,
  opts: GithubReaderOptions,
  evidence: EvidenceEntry[],
  now: number,
): Promise<{ latest: string; published: string; count6m: number | null }> {
  const apiBase = (opts.apiBase ?? 'https://api.github.com').replace(/\/+$/, '');
  const webBase = (opts.webBase ?? 'https://github.com').replace(/\/+$/, '');
  const accessedAt = new Date(now).toISOString();
  const apiUrl = `${apiBase}/repos/${owner}/${repo}/releases?per_page=30`;
  const releases = await httpGetJson<ReleaseApi[]>(apiUrl, opts);
  if (Array.isArray(releases)) {
    evidence.push({ type: 'api', url: apiUrl, accessed_at: accessedAt });
    const nonDraft = releases.filter((r) => !r.draft);
    const first = nonDraft[0];
    const cutoff = now - SIX_MONTHS_MS;
    const count6m = nonDraft.filter((r) => {
      const t = r.published_at ? Date.parse(r.published_at) : NaN;
      return !Number.isNaN(t) && t >= cutoff;
    }).length;
    return {
      latest: first?.tag_name ?? '',
      published: first?.published_at ?? '',
      count6m: count6m,
    };
  }
  const atomUrl = `${webBase}/${owner}/${repo}/releases.atom`;
  const atom = await httpGetText(atomUrl, opts);
  if (atom === null) return { latest: '', published: '', count6m: null };
  evidence.push({ type: 'web', url: atomUrl, accessed_at: accessedAt });
  return parseReleasesAtom(atom, now);
}

/** releases.atom 解析：tag 从 <link href="…releases/tag/xxx"/> 尾部取（percent-decode） */
function parseReleasesAtom(
  atom: string,
  now: number,
): { latest: string; published: string; count6m: number | null } {
  const entries = [...atom.matchAll(/<entry>[\s\S]*?<\/entry>/g)];
  const cutoff = now - SIX_MONTHS_MS;
  let count6m = 0;
  let latest = '';
  let published = '';
  for (const entry of entries.slice(0, 10)) {
    const body = entry[0];
    const titleMatch = body.match(/<title>(.*?)<\/title>/);
    const linkMatch = body.match(/<link[^>]*href="([^"]*releases\/tag\/[^"]*)"/);
    const publishedMatch = body.match(/<published>(.*?)<\/published>/);
    const tag = linkMatch
      ? decodeURIComponent(linkMatch[1].split('/').pop() ?? '')
      : '';
    const title = titleMatch ? titleMatch[1].trim() : '';
    const when = publishedMatch ? publishedMatch[1].trim() : '';
    if (!latest) {
      latest = tag || title;
      published = when;
    }
    if (when) {
      const t = Date.parse(when);
      if (!Number.isNaN(t) && t >= cutoff) count6m += 1;
    }
  }
  return {
    latest,
    published,
    count6m: entries.length > 0 ? count6m : null,
  };
}

/** raw README + manifest：按分支候选逐个试，第一个成功即定分支 */
async function fetchRaw(
  owner: string,
  repo: string,
  defaultBranch: string,
  opts: GithubReaderOptions,
  evidence: EvidenceEntry[],
  now: number,
): Promise<{ readmeText: string | null; manifests: Array<{ file: string; summary: string[] }> }> {
  const rawBase = (opts.rawBase ?? 'https://raw.githubusercontent.com').replace(/\/+$/, '');
  const accessedAt = new Date(now).toISOString();
  const branchCandidates = [
    ...(defaultBranch ? [defaultBranch] : []),
    ...BRANCH_CANDIDATES,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  let readmeText: string | null = null;
  let branch: string | null = null;
  for (const candidate of branchCandidates) {
    for (const file of README_CANDIDATES) {
      const url = `${rawBase}/${owner}/${repo}/${candidate}/${file}`;
      const text = await httpGetText(url, { ...opts, maxBytes: README_MAX_BYTES });
      if (text !== null && text.trim()) {
        evidence.push({ type: 'raw', url, accessed_at: accessedAt });
        readmeText = text;
        branch = candidate;
        break;
      }
    }
    if (branch) break;
  }

  const manifests: Array<{ file: string; summary: string[] }> = [];
  const branchForManifest = branch ?? defaultBranch ?? 'HEAD';
  const manifestResults = await Promise.all(
    MANIFEST_CANDIDATES.map(async (file) => {
      const url = `${rawBase}/${owner}/${repo}/${branchForManifest}/${file}`;
      const text = await httpGetText(url, { ...opts, maxBytes: MANIFEST_MAX_BYTES });
      if (text === null || !text.trim()) return null;
      const summary = parseManifest(file, text);
      if (summary.length === 0) return null;
      return { file, summary, url };
    }),
  );
  for (const result of manifestResults) {
    if (!result) continue;
    evidence.push({ type: 'raw', url: result.url, accessed_at: accessedAt });
    manifests.push({ file: result.file, summary: result.summary });
  }
  return { readmeText, manifests };
}

/** README 首段定位提取：过滤标题/图片/纯链接/HTML 徽章行 */
function extractPositioning(readme: string): string {
  const first = readme
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .find((line) => {
      if (/^#+\s/.test(line)) return false; // 标题行
      if (line.includes('![')) return false; // 图片行
      if (/^\s*<[^>]*>\s*$/.test(line)) return false; // 整行 HTML 徽章
      const stripped = line.replace(/<[^>]*>/g, '').trim();
      if (stripped.length < 20) return false; // 剥标签后太短（徽章行）
      const linkTexts = [...line.matchAll(/\[([^\]]*)\]\([^)]*\)/g)].map((m) => m[1]);
      if (linkTexts.length > 0 && linkTexts.join('').length * 2 > line.length) {
        return false; // 纯导航链接行
      }
      const withoutLinks = line
        .replace(/\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s*[|·]\s*/g, ' ')
        .trim();
      if (withoutLinks.length < 12) return false; // 剥链接/分隔符后残余过短：语言切换行/导航行
      return true;
    });
  if (!first) return '';
  const cleaned = first
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, SECTION_MAX_CHARS);
}

/** README 章节提取：单趟扫描标题，按优先级分类（场景先于使用，避免「使用场景」被 usage 抢走） */
function extractSections(
  readme: string,
): { architecture: string; usage: string; scenarios: string } {
  const lines = readme.split('\n');
  const headings: Array<{ level: number; text: string; lineIndex: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,4})\s+(.+)$/);
    if (m) headings.push({ level: m[1].length, text: m[2].trim(), lineIndex: i });
  }
  const sectionContent = (idx: number): string => {
    const level = headings[idx].level;
    const out: string[] = [];
    for (let i = headings[idx].lineIndex + 1; i < lines.length; i++) {
      const h = lines[i].match(/^(#{1,4})\s+/);
      if (h) {
        if ((h[0].match(/^#+/)?.[0].length ?? 1) <= level) break;
        continue;
      }
      // 跳过 fenced code block 的 ```/~~~ 标记行，避免 `bash 等 fence 污染正文
      if (/^\s*(```+|~~~+)/.test(lines[i])) continue;
      if (lines[i].trim()) out.push(lines[i].trim());
    }
    return out.join(' ').replace(/\s+/g, ' ').trim().slice(0, SECTION_MAX_CHARS);
  };
  const rules: Array<['architecture' | 'usage' | 'scenarios', RegExp]> = [
    ['architecture', /架构|architecture|模块|module|设计|design|overview|数据流|结构/i],
    ['scenarios', /使用场景|适用场景|use\s*cases|use-case|scenarios|场景|应用场景|典型用户|适合谁/i],
    ['usage', /quick\s*start|getting\s*started|快速开始|安装|使用|usage|开始使用|install|\brun\b|\brunning\b|运行|启动|部署|deploy|how\s+to/i],
  ];
  const result = { architecture: '', usage: '', scenarios: '' };
  const used = new Set<number>();
  for (const [key, re] of rules) {
    const idx = headings.findIndex((h, i) => !used.has(i) && re.test(h.text));
    if (idx >= 0) {
      used.add(idx);
      result[key] = sectionContent(idx);
    }
  }
  return result;
}

/** manifest 解析：各取前 12 项（package.json 按版本号数值倒序） */
function parseManifest(file: string, content: string): string[] {
  switch (file) {
    case 'package.json': {
      try {
        const pkg = JSON.parse(content) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        return Object.entries(deps)
          .sort((a, b) => versionRank(b[1]) - versionRank(a[1]))
          .slice(0, MANIFEST_MAX_ITEMS)
          .map(([name, ver]) => `${name}@${ver}`);
      } catch {
        return [];
      }
    }
    case 'pyproject.toml': {
      const block = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
      if (!block) return [];
      return [...block[1].matchAll(/"([^"]+)"/g)]
        .map((m) => m[1].split(/[<>=!~[]/)[0].trim())
        .filter(Boolean)
        .slice(0, MANIFEST_MAX_ITEMS);
    }
    case 'requirements.txt': {
      return content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && !l.startsWith('-'))
        .map((l) => l.split(/[<>=!~[]/)[0].trim())
        .filter(Boolean)
        .slice(0, MANIFEST_MAX_ITEMS);
    }
    case 'go.mod': {
      const deps = [...content.matchAll(/^\s*(\S+)\s+v\d/gm)]
        .map((m) => m[1])
        .slice(0, MANIFEST_MAX_ITEMS);
      const moduleMatch = content.match(/^module\s+(\S+)/m);
      return moduleMatch ? [`module ${moduleMatch[1]}`, ...deps] : deps;
    }
    case 'Cargo.toml': {
      return [...content.matchAll(/^\s*([A-Za-z0-9_-]+)\s*=\s*(?:"[^"]*"|\{[^}]*\})/gm)]
        .map((m) => m[1])
        .filter((n) => !CARGO_METADATA_KEYS.has(n))
        .slice(0, MANIFEST_MAX_ITEMS);
    }
    default:
      return [];
  }
}

function versionRank(version: string): number {
  const m = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return 0;
  return Number(m[1]) * 1_000_000 + Number(m[2]) * 1000 + Number(m[3]);
}

/** health_score 加权（Star 20 / 近6月提交 25 / 贡献者 15 / Issue 10 / Release 20 / 推送 10，License 缺失 -5） */
function computeHealth(
  meta: GithubMeta,
  now: number,
): { score: number; basis: string[]; risks: string[] } {
  const basis: string[] = [];
  const risks: string[] = [];
  let score = 0;

  if (meta.stars !== null) {
    const s = meta.stars;
    const pts = s >= 50_000 ? 20 : s >= 10_000 ? 18 : s >= 1_000 ? 14 : s >= 100 ? 10 : s > 0 ? 6 : 0;
    score += pts;
    basis.push(`Star ${s.toLocaleString('en-US')}（${pts} 分）`);
  } else {
    basis.push('Star 未获取');
  }

  if (meta.commits_6m !== null) {
    const c = meta.commits_6m;
    const pts = c >= 200 ? 25 : c >= 100 ? 22 : c >= 50 ? 18 : c >= 20 ? 12 : c >= 5 ? 6 : 0;
    score += pts;
    basis.push(`近6月提交 ${c}（${pts} 分）`);
    if (c < 10) risks.push(`近 6 月提交仅 ${c} 次，维护活跃度低，谨慎采用。`);
  } else {
    basis.push('近6月提交 未获取');
  }

  if (meta.contributors !== null) {
    const c = meta.contributors;
    const pts = c >= 100 ? 15 : c >= 30 ? 13 : c >= 10 ? 10 : c >= 3 ? 7 : 3;
    score += pts;
    basis.push(`贡献者 ${c}（${pts} 分）`);
  } else {
    basis.push('贡献者 未获取');
  }

  if (meta.open_issues !== null) {
    const o = meta.open_issues;
    const pts = o < 50 ? 10 : o < 300 ? 8 : o < 1000 ? 5 : 2;
    score += pts;
    basis.push(`Open Issues ${o}（${pts} 分）`);
    if (o >= 500) risks.push(`Open Issues 达 ${o}，积压较多，Issue 响应速度需进一步核实。`);
  } else {
    basis.push('Open Issues 未获取');
  }

  if (meta.releases_6m !== null) {
    const r = meta.releases_6m;
    const pts = r >= 12 ? 20 : r >= 6 ? 17 : r >= 2 ? 12 : r >= 1 ? 8 : 3;
    score += pts;
    basis.push(`近6月 Release ${r}（${pts} 分）`);
  } else {
    basis.push('近6月 Release 未获取');
  }

  if (meta.pushed_at) {
    const days = (now - Date.parse(meta.pushed_at)) / 86_400_000;
    const pts = days <= 7 ? 10 : days <= 30 ? 8 : days <= 90 ? 6 : days <= 180 ? 3 : 0;
    score += pts;
    basis.push(`最近推送 ${Math.round(days)} 天前（${pts} 分）`);
    if (days > 180) risks.push(`最近推送已超过 180 天（约 ${Math.round(days)} 天），项目可能已停滞。`);
  } else {
    basis.push('最近推送 未获取');
  }

  if (!meta.license || meta.license === 'NOASSERTION') {
    score -= 5;
    basis.push('License 缺失/NOASSERTION（-5 分）');
    risks.push('未检出有效 License（缺失或 NOASSERTION），商用与复用需自行确认许可；本结论只给事实，不构成法律建议。');
  }

  return { score: Math.max(0, Math.min(100, score)), basis, risks };
}

function buildTechStack(
  meta: GithubMeta,
  manifests: Array<{ file: string; summary: string[] }>,
): string {
  const parts: string[] = [];
  parts.push(meta.language ? `主语言：${meta.language}` : notFetched('主语言（GitHub API 不可用）'));
  for (const m of manifests) {
    parts.push(`${m.file}：${m.summary.join(', ')}`);
  }
  if (manifests.length === 0) {
    parts.push(notFetched('manifest（仓库无常见清单文件或抓取失败）'));
  }
  return parts.join('；');
}

function buildMarkdownAnswer(contract: GithubContract): string {
  const lines = [
    `# ${contract.repo} 项目解读`,
    '',
    `> 深度：${contract.depth}`,
    '',
    '## 定位',
    '',
    contract.positioning,
    '',
    '## 架构',
    '',
    contract.architecture,
    '',
    '## 技术栈',
    '',
    contract.tech_stack,
    '',
    '## 使用',
    '',
    contract.usage,
    '',
    '## 适用场景',
    '',
    contract.scenarios,
    '',
    '## 健康分',
    '',
    `${contract.health_score}/100`,
    ...contract.health_basis.map((b) => `- ${b}`),
    '',
    '## 风险',
    '',
    ...(contract.risks.length > 0 ? contract.risks.map((r) => `- ${r}`) : ['- 无显著风险项']),
    '',
    '## 来源',
    '',
    ...contract.evidence.map((e) => `- [${e.type}] ${e.url}`),
    '',
    '> 说明：深度 LLM 合成未接入，以上为 L1 结构化解读（模板渲染）。',
  ];
  return lines.join('\n');
}

/** confidence 与信息完整度联动：每缺一个核心维度扣 0.1，LLM 合成基座 0.85、无 LLM 兜底 0.7 */
function computeConfidence(contract: GithubContract, llmSynthesized: boolean): number {
  const missing = [
    contract.positioning,
    contract.architecture,
    contract.tech_stack,
    contract.usage,
    contract.scenarios,
  ].filter((v) => v.includes('未获取')).length;
  const base = llmSynthesized ? 0.85 : 0.7;
  return Math.max(0.4, Math.round((base - missing * 0.1) * 100) / 100);
}

export function createGithubReaderSkill(opts: GithubReaderOptions = {}): ExecutableSkill {
  return {
    name: 'github-reader',
    version: '0.3.0',
    triggers: ['github', 'repo', '项目解读', '开源项目', '仓库'],
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      const repo = extractRepo(input.query);
      if (!repo) {
        return {
          result: {
            error: 'no_repo',
            answer: '请提供 GitHub 仓库链接或 owner/repo，例如 https://github.com/zephyrproject-rtos/zephyr。',
          },
          confidence: 0.2,
          followUpAction: '把仓库链接发给我即可开始分析。',
        };
      }
      const skillStartMs = performance.now();
      const now = opts.now?.() ?? Date.now();
      const evidence: EvidenceEntry[] = [];
      // E284：deps.httpCache 注入 L1 抓取（生产接线在 skillDeps；测试不注入即不缓存，保持隔离）
      const optsWithCache: GithubReaderOptions = deps.httpCache
        ? { ...opts, httpCache: deps.httpCache }
        : opts;
      const apiBase = (opts.apiBase ?? 'https://api.github.com').replace(/\/+$/, '');
      const accessedAt = new Date(now).toISOString();

      // ── L1：GitHub API 元数据（失败仅降级，不抛错）──
      const fetchStartMs = performance.now();
      const repoUrl = `${apiBase}/repos/${repo.owner}/${repo.repo}`;
      const contributorsUrl = `${apiBase}/repos/${repo.owner}/${repo.repo}/contributors?per_page=100`;
      const since = new Date(now - SIX_MONTHS_MS).toISOString();
      const commitsUrl = `${apiBase}/repos/${repo.owner}/${repo.repo}/commits?per_page=100&since=${encodeURIComponent(since)}`;
      const [repoData, contributors, commits, releases] = await Promise.all([
        httpGetJson<RepoApi>(repoUrl, optsWithCache),
        httpGetJson<unknown[]>(contributorsUrl, optsWithCache),
        httpGetJson<unknown[]>(commitsUrl, optsWithCache),
        fetchReleases(repo.owner, repo.repo, optsWithCache, evidence, now),
      ]);
      const meta = emptyMeta();
      if (repoData) {
        evidence.push({ type: 'api', url: repoUrl, accessed_at: accessedAt });
        meta.stars = repoData.stargazers_count ?? null;
        meta.forks = repoData.forks_count ?? null;
        meta.open_issues = repoData.open_issues_count ?? null;
        meta.license = repoData.license?.spdx_id ?? '';
        meta.language = repoData.language ?? '';
        meta.default_branch = repoData.default_branch ?? '';
        meta.pushed_at = repoData.pushed_at ?? '';
        meta.created_at = repoData.created_at ?? '';
        meta.description = repoData.description ?? '';
        meta.topics = repoData.topics ?? [];
      }

      if (Array.isArray(contributors)) {
        meta.contributors = contributors.length;
        evidence.push({ type: 'api', url: contributorsUrl, accessed_at: accessedAt });
      }

      if (Array.isArray(commits)) {
        meta.commits_6m = commits.length;
        evidence.push({ type: 'api', url: commitsUrl, accessed_at: accessedAt });
      }

      meta.latest_release = releases.latest;
      meta.latest_published = releases.published;
      meta.releases_6m = releases.count6m;

      // ── L1：raw README + manifest ──
      const raw = await fetchRaw(repo.owner, repo.repo, meta.default_branch, optsWithCache, evidence, now);
      const fetchMs = performance.now() - fetchStartMs;
      const readmeText = raw.readmeText;

      // ── X.6 契约组装（字段缺失显式「未获取（原因）」）──
      let positioning = '';
      let architecture = '';
      let usage = '';
      let scenarios = '';
      let readmeExcerpt = '';
      if (readmeText) {
        readmeExcerpt = readmeText.slice(0, README_EXCERPT_MAX_CHARS);
        positioning = extractPositioning(readmeText);
        const sections = extractSections(readmeText);
        architecture = sections.architecture;
        usage = sections.usage;
        scenarios = sections.scenarios;
        if (!positioning) positioning = notFetched('README 首段无有效定位文本');
        if (!architecture) architecture = notFetched('README 无架构/设计章节');
        if (!usage) usage = notFetched('README 无使用/安装章节');
        if (!scenarios) scenarios = notFetched('README 无场景章节');
      } else {
        const reason = 'README 缺失';
        positioning = notFetched(reason);
        architecture = notFetched(reason);
        usage = notFetched(reason);
        scenarios = notFetched(reason);
      }

      const contract: GithubContract = {
        repo: `${repo.owner}/${repo.repo}`,
        depth: 'README 级判断',
        positioning,
        architecture,
        tech_stack: buildTechStack(meta, raw.manifests),
        usage,
        scenarios,
        readme_excerpt: readmeExcerpt,
        health_score: 0,
        health_basis: [],
        risks: [],
        meta,
        evidence,
      };

      const health = computeHealth(meta, now);
      contract.health_score = health.score;
      contract.health_basis = health.basis;
      contract.risks = health.risks;
      if (!readmeText) {
        contract.risks.push('README 未获取，功能与宣称无法交叉验证。');
      }
      // meta 缺失字段在 JSON 里也显式标注原因（数值字段保持 null 由 LLM 端识别）
      if (!meta.default_branch) meta.default_branch = notFetched('GitHub API 不可用');
      if (!meta.language) meta.language = notFetched('GitHub API 不可用');
      if (!meta.license) meta.license = notFetched('GitHub API 不可用');
      if (!meta.pushed_at) meta.pushed_at = notFetched('GitHub API 不可用');
      if (!meta.created_at) meta.created_at = notFetched('GitHub API 不可用');
      if (!meta.description) meta.description = notFetched('GitHub API 不可用');

      // ── LLM 合成（《专业审阅协议 §一》注入）；无 LLM 或失败时返回结构化契约 ──
      let synthesisMs = 0;
      let synthesisError: string | undefined;
      if (deps.complete) {
        const synthesisStartMs = performance.now();
        try {
          const messages: Array<{ role: 'system' | 'user'; content: string }> = [
            {
              role: 'system',
              content:
                `${REVIEW_PROTOCOL_SYSTEM}\n\n` +
                '以下是 L1 抓取的结构化数据（X.6 契约）。字段值为「未获取（原因）」或 null 表示抓取失败/缺失，禁止编造。' +
                '回答须以「README 级判断」标注深度，健康分与依据直接引用，来源可点（evidence[]）。' +
                '篇幅与结构遵守协议输出要求（≤ 1200 字，只写有数据支撑的维度）。',
            },
            {
              role: 'user',
              content:
                `用户问题：${input.query}\n\n仓库：${contract.repo}\n\nX.6 契约 JSON：\n` +
                `${JSON.stringify(contract, null, 2)}\n\nconfidence：${computeConfidence(contract, true)}\n\nevidence：\n` +
                `${contract.evidence.map((e) => `- [${e.type}] ${e.url}（${e.accessed_at}）`).join('\n')}`,
            },
          ];
          // P-122 预算内：首轮 4096，截断时同预算重试一次（prompt 已限 2000 字内，双 4096 强制精简）；
          // 重试仍截断/失败才落结构化兜底，不无限重试。
          let answer: string | undefined;
          try {
            answer = await deps.complete.complete(messages, {
              temperature: 0.2,
              maxTokens: SYNTH_MAX_TOKENS_FIRST,
              rejectOnTruncate: true,
            });
          } catch (err) {
            if (isLengthTruncated(err)) {
              try {
                answer = await deps.complete.complete(messages, {
                  temperature: 0.2,
                  maxTokens: SYNTH_MAX_TOKENS_RETRY,
                  rejectOnTruncate: true,
                });
              } catch (retryErr) {
                synthesisError = retryErr instanceof Error ? retryErr.message : String(retryErr);
              }
            } else {
              synthesisError = err instanceof Error ? err.message : String(err);
            }
          }
          if (answer !== undefined) {
            synthesisMs = performance.now() - synthesisStartMs;
            const confidence = computeConfidence(contract, true);
            const timing: GithubSkillTiming = {
              totalMs: performance.now() - skillStartMs,
              fetchMs,
              synthesisMs,
            };
            return {
              result: {
                answer,
                contract,
                evidence: contract.evidence,
                confidence,
                timing,
              },
              confidence,
            };
          }
          synthesisMs = performance.now() - synthesisStartMs;
        } catch (err) {
          synthesisMs = performance.now() - synthesisStartMs;
          synthesisError = err instanceof Error ? err.message : String(err);
          // LLM 合成失败落到结构化契约兜底，不静默吞错
        }
      }

      const fallbackConfidence = computeConfidence(contract, false);
      const fallbackTiming: GithubSkillTiming = {
        totalMs: performance.now() - skillStartMs,
        fetchMs,
        synthesisMs,
        ...(synthesisError ? { synthesisError } : {}),
      };
      return {
        result: {
          answer: buildMarkdownAnswer(contract),
          contract,
          evidence: contract.evidence,
          confidence: fallbackConfidence,
          timing: fallbackTiming,
        },
        confidence: fallbackConfidence,
      };
    },
  };
}
