/**
 * v1.0 S7：市场 Skill 可执行 handler（§8.2.3 执行链，E243）
 * 安装落盘（MarketInstaller）之后的本环：加载已安装 manifest → §10.2 命令白名单逐条校验 →
 * §10.1 文件沙箱 cwd（sandbox/market-skills/<name>）内 shell:false 执行 steps →
 * 成功后跑 verify → 有界输出。
 * 权限门禁：未声明 command 权限的 Skill 拒绝执行任何步骤（§8.2.3：包不得自提权限）。
 * 可执行内容只来自已过安装门禁的 manifest steps（非用户输入），命令拒绝即中止并自动写审计。
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCommand, tokenize } from '../../security/command-whitelist.js';
import { createCdpBrowserDriver } from '../../browser/driver.js';
import { BrowserOperationRunner, parseBrowserStep, type BrowserDriver, type BrowserOpPolicy, type BrowserOpStep } from '../../browser/operations.js';
import { DomainAuthStore } from '../../security/domain-auth.js';
import { validateMarketManifest } from './manifest.js';
import type { InstalledSkillWithTriggers } from './nl-router.js';
import { MarketStore } from './store.js';
import type { MarketSkillManifest } from './types.js';

/** 每条步骤 stdout/stderr 有界截断（Skill 内部常量，防止把 10MB 输出拉进上下文） */
const STEP_OUTPUT_MAX_CHARS = 4 * 1024;
/** E251：用户输入有界写入（防止把任意长查询写进沙箱） */
const INPUT_MAX_CHARS = 4 * 1024;
const STEP_MAX_BUFFER = 1024 * 1024;

export interface StepSpawnResult {
  status: number | null;
  stdout: string | null;
  stderr: string | null;
  error?: Error;
}

export interface StepSpawnOptions {
  cwd: string;
  encoding: 'utf-8';
  timeout: number | undefined;
  maxBuffer: number;
}

export type StepSpawnFn = (
  bin: string,
  args: string[],
  opts: StepSpawnOptions,
) => StepSpawnResult;

export interface MarketRunnerDeps {
  store?: MarketStore;
  /** 安装目录（测试注入；默认 data/market-skills） */
  installRoot?: string;
  /** 工作区根（测试注入；沙箱 cwd 基于此） */
  workspaceRoot?: string;
  check?: typeof checkCommand;
  spawn?: StepSpawnFn;
  /** E252：域名授权存储（测试注入；默认 data/domain-auth.jsonl） */
  domainAuth?: DomainAuthStore;
  /** E252：浏览器驱动工厂（测试注入 fake；缺省真实 CDP 驱动） */
  driverFactory?: () => BrowserDriver;
  /** E252：高风险动作审批回调（缺省拒绝；CLI --yes 显式放行） */
  confirmAction?: BrowserOpPolicy['confirm'];
}

export interface MarketStepResult {
  step: string;
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export interface MarketRunOutcome {
  ok: boolean;
  name: string;
  version: string;
  results: MarketStepResult[];
  error?: string;
  durationMs: number;
  /** E252：浏览器操作最终页 DOM 快照（有界截断，untrusted_data） */
  finalSnapshot?: string;
}

function truncateOutput(text: string | null | undefined): string {
  const value = text ?? '';
  if (value.length <= STEP_OUTPUT_MAX_CHARS) return value;
  return `${value.slice(0, STEP_OUTPUT_MAX_CHARS)}\n…（输出超长已截断，完整输出见沙箱/审计）`;
}

export class MarketSkillRunner {
  private readonly store: MarketStore;
  private readonly installRoot: string;
  private readonly workspaceRoot: string;
  private readonly check: typeof checkCommand;
  private readonly spawn: StepSpawnFn;
  private readonly domainAuth: DomainAuthStore;
  private readonly driverFactory?: () => BrowserDriver;
  private readonly confirmAction?: BrowserOpPolicy['confirm'];

  constructor(deps: MarketRunnerDeps = {}) {
    this.store = deps.store ?? new MarketStore();
    this.installRoot = deps.installRoot ?? join(process.cwd(), 'data', 'market-skills');
    this.workspaceRoot = deps.workspaceRoot ?? process.cwd();
    this.check = deps.check ?? checkCommand;
    this.spawn = deps.spawn ?? defaultStepSpawn;
    this.domainAuth = deps.domainAuth ?? new DomainAuthStore();
    this.driverFactory = deps.driverFactory;
    this.confirmAction = deps.confirmAction;
  }

  /** 当前已安装（status=installed）的市场 Skill（供 CLI --list） */
  listInstalled(): Array<{ name: string; version: string }> {
    return this.store.installed().map((record) => ({ name: record.name, version: record.version }));
  }

  /** 已安装市场 Skill 及其触发词（E243 自然语言路由输入；manifest 损坏的条目跳过） */
  listInstalledWithTriggers(): InstalledSkillWithTriggers[] {
    return this.store
      .installed()
      .map((record) => {
        try {
          const raw = readFileSync(join(this.installRoot, record.name, 'manifest.json'), 'utf-8');
          const manifest = validateMarketManifest(JSON.parse(raw));
          return { name: record.name, triggers: manifest.triggers };
        } catch {
          return null;
        }
      })
      .filter((entry): entry is InstalledSkillWithTriggers => entry !== null);
  }

  /**
   * 真实执行已安装市场 Skill 的 steps + verify（全程 §10 白名单 + 沙箱 cwd）。
   * E251 输入通道：manifest 声明 input:'query' 时，把 opts.input（有界 4KB）写入沙箱 input.txt，
   * 并将步骤中的字面量 @input 替换为该文件绝对路径——用户文本永不进入命令行（无注入面）。
   */
  run(name: string, opts: { input?: string } = {}): MarketRunOutcome {
    const started = Date.now();
    const fail = (error: string, results: MarketStepResult[] = [], version = ''): MarketRunOutcome => ({
      ok: false,
      name,
      version,
      results,
      error,
      durationMs: Date.now() - started,
    });

    const status = this.store.statusOf(name);
    if (status !== 'installed') {
      return fail(`Skill ${name} 未安装或已卸载（当前状态：${status}），请先安装后执行`);
    }

    let manifest: MarketSkillManifest;
    try {
      const raw = readFileSync(join(this.installRoot, name, 'manifest.json'), 'utf-8');
      manifest = validateMarketManifest(JSON.parse(raw));
    } catch (err) {
      return fail(`加载 Skill manifest 失败：${err instanceof Error ? err.message : String(err)}`);
    }

    // E252：浏览器操作 Skill 需交互式用户确认（高风险默认拒绝），走 runBrowser 异步通道
    if (manifest.permissions.includes('browser')) {
      return fail(
        `浏览器操作 Skill 需交互式用户确认，请用 CLI/桌面入口执行：npm run skill:market:run -- ${name}${manifest.input === 'query' ? ' --query "<输入>"' : ''}（高风险动作默认拒绝）`,
        [],
        manifest.version,
      );
    }
    if (!manifest.permissions.includes('command')) {
      return fail('Skill 未声明 command 权限，拒绝执行任何步骤（§8.2.3 权限门禁）', [], manifest.version);
    }

    // §10.1 文件沙箱：cwd 固定在工作区 sandbox/ 白名单根内，shell:false 无解释路径
    const cwd = join(this.workspaceRoot, 'sandbox', 'market-skills', name);
    try {
      mkdirSync(cwd, { recursive: true });
    } catch (err) {
      return fail(`创建沙箱工作目录失败：${err instanceof Error ? err.message : String(err)}`, [], manifest.version);
    }

    // E251：声明 input:'query' 时把用户输入写入沙箱 input.txt（@input 指向它）
    let inputPath: string | null = null;
    if (manifest.input === 'query' && opts.input !== undefined) {
      inputPath = join(cwd, 'input.txt');
      try {
        writeFileSync(inputPath, opts.input.slice(0, INPUT_MAX_CHARS), 'utf-8');
      } catch (err) {
        return fail(`写入 Skill 输入文件失败：${err instanceof Error ? err.message : String(err)}`, [], manifest.version);
      }
    }

    const results: MarketStepResult[] = [];
    const steps = [...(manifest.steps ?? []), ...(manifest.verify ?? [])];
    for (const rawStep of steps) {
      // E251：@input 字面量替换为输入文件绝对路径（固定生成路径，无用户文本进命令行）
      const step = inputPath ? rawStep.replace('@input', inputPath) : rawStep;
      const checked = this.check(step);
      if (!checked.allowed) {
        results.push({
          step,
          ok: false,
          status: null,
          stdout: '',
          stderr: '',
        });
        return fail(`步骤被 §10.2 命令白名单拒绝：${checked.reason}`, results, manifest.version);
      }
      const argv = tokenize(step);
      if (argv.length === 0) {
        results.push({ step, ok: false, status: null, stdout: '', stderr: '' });
        return fail('步骤为空命令', results, manifest.version);
      }
      const run = this.spawn(argv[0], argv.slice(1), {
        cwd,
        encoding: 'utf-8',
        timeout: checked.timeoutMs,
        maxBuffer: STEP_MAX_BUFFER,
      });
      const timedOut = run.error?.message?.includes('ETIMEDOUT') ?? false;
      const result: MarketStepResult = {
        step,
        ok: run.status === 0,
        status: run.status,
        stdout: truncateOutput(run.stdout),
        stderr: truncateOutput(run.stderr),
        ...(timedOut ? { timedOut } : {}),
      };
      results.push(result);
      if (!result.ok) {
        return fail(`步骤执行失败（exit=${run.status ?? 'null'}${timedOut ? '，超时' : ''}）`, results, manifest.version);
      }
    }
    return { ok: true, name, version: manifest.version, results, durationMs: Date.now() - started };
  }

  /** 当前已安装 Skill 是否为浏览器操作类型（CLI 分支入口；manifest 损坏视为非浏览器） */
  isBrowserSkill(name: string): boolean {
    try {
      const raw = readFileSync(join(this.installRoot, name, 'manifest.json'), 'utf-8');
      return validateMarketManifest(JSON.parse(raw)).permissions.includes('browser');
    } catch {
      return false;
    }
  }

  /**
   * 浏览器操作 Skill 执行链（E252）：manifest steps（DSL）→ 动作白名单/域名白名单/SSRF
   * → 高风险审批（默认拒绝，A7）→ 有界执行（[P-124]/[P-125]）→ 动作留痕（A8）。
   * 命令 Skill 走同步 run()；浏览器 Skill 必须经此异步通道（用户确认 + CDP 驱动）。
   */
  async runBrowser(name: string, opts: { input?: string } = {}): Promise<MarketRunOutcome> {
    const started = Date.now();
    const fail = (error: string, results: MarketStepResult[] = [], version = ''): MarketRunOutcome => ({
      ok: false,
      name,
      version,
      results,
      error,
      durationMs: Date.now() - started,
    });
    const status = this.store.statusOf(name);
    if (status !== 'installed') {
      return fail(`Skill ${name} 未安装或已卸载（当前状态：${status}），请先安装后执行`);
    }
    let manifest: MarketSkillManifest;
    try {
      const raw = readFileSync(join(this.installRoot, name, 'manifest.json'), 'utf-8');
      manifest = validateMarketManifest(JSON.parse(raw));
    } catch (err) {
      return fail(`加载 Skill manifest 失败：${err instanceof Error ? err.message : String(err)}`);
    }
    if (!manifest.permissions.includes('browser')) {
      return fail('Skill 未声明 browser 权限，请使用 run() 命令执行通道');
    }
    const domains = manifest.domains ?? [];
    if (domains.length === 0) {
      return fail('browser 权限 Skill 未声明 domains，拒绝执行（§8.2.3 安装/执行拒绝）');
    }
    const parsed = (manifest.steps ?? []).map((line) => parseBrowserStep(line, opts.input));
    const invalid = parsed.find((r): r is { ok: false; error: string } => !r.ok);
    if (invalid) return fail(`浏览器步骤解析失败：${invalid.error}`);
    const steps = parsed.map((r) => (r as { ok: true; step: BrowserOpStep }).step);
    const policy: BrowserOpPolicy = {
      skill: name,
      domains,
      allowedActions: manifest.actions ? new Set(manifest.actions) : undefined,
      isAuthorized: (domain) => this.domainAuth.isAuthorized(name, domain),
      confirm: this.confirmAction,
    };
    const driver = this.driverFactory ? this.driverFactory() : createCdpBrowserDriver();
    const opRunner = new BrowserOperationRunner({ driver });
    const outcome = await opRunner.run(steps, policy);
    const results: MarketStepResult[] = outcome.results.map((r) => ({
      step: r.step.raw,
      ok: r.ok,
      status: null,
      stdout: r.ok ? `${r.step.action} ${describeBrowserStep(r.step)}（${r.durationMs}ms）` : '',
      stderr: r.error ?? '',
      ...(r.timedOut ? { timedOut: true } : {}),
    }));
    return {
      ok: outcome.ok,
      name,
      version: manifest.version,
      results,
      ...(outcome.error !== undefined ? { error: outcome.error } : {}),
      ...(outcome.finalSnapshot ? { finalSnapshot: outcome.finalSnapshot.text.slice(0, STEP_OUTPUT_MAX_CHARS) } : {}),
      durationMs: Date.now() - started,
    };
  }
}

/** E252：浏览器步骤执行摘要（goto/download 带解析后 URL，@query 已替换——留痕可审计） */
function describeBrowserStep(step: BrowserOpStep): string {
  if (step.action === 'goto' || step.action === 'download') return step.url ?? '';
  if (step.action === 'type') return `${step.ref ?? ''} "${step.text ?? ''}"`;
  if (step.action === 'select') return `${step.ref ?? ''} -> ${step.option ?? ''}`;
  if (step.action === 'scroll') return step.dy === 100_000 ? 'bottom' : `${step.dx ?? 0} ${step.dy ?? 0}`;
  if (step.action === 'wait') return `${step.ms ?? 0}ms`;
  return step.ref ?? '';
}

/** E250：命令串是否可安全经 cmd.exe 执行——仅字母数字、路径/参数分隔符，
 *  无任何 cmd 元字符（&|<>^()%!*?" 等一律拒绝），经 cmd 执行也不会有解释余地，
 *  保持白名单校验的 shell:false 语义（Windows .cmd shim 支持）。 */
export function isCmdSafeCommandLine(cmdline: string): boolean {
  return /^[A-Za-z0-9 _@+./\\:-]+$/.test(cmdline);
}

function defaultStepSpawn(bin: string, args: string[], opts: StepSpawnOptions): StepSpawnResult {
  const result = spawnSync(bin, args, {
    cwd: opts.cwd,
    encoding: opts.encoding,
    timeout: opts.timeout,
    maxBuffer: opts.maxBuffer,
    // shell:false：白名单校验的是完整命令串，argv 由 tokenize 拆分，不做 shell 解释
  });
  // E250：Windows 下 npm/pnpm 等是 .cmd shim，shell:false 直接 spawn 会 ENOENT；
  // 仅当命令串通过安全守卫（无 cmd 元字符）时，改经 cmd.exe /d /s /c 执行同一命令串。
  if (
    process.platform === 'win32' &&
    result.error?.message?.includes('ENOENT') &&
    isCmdSafeCommandLine([bin, ...args].join(' '))
  ) {
    const cmdline = [bin, ...args].join(' ');
    const viaCmd = spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', cmdline], {
      cwd: opts.cwd,
      encoding: opts.encoding,
      timeout: opts.timeout,
      maxBuffer: opts.maxBuffer,
    });
    return { status: viaCmd.status, stdout: viaCmd.stdout, stderr: viaCmd.stderr, error: viaCmd.error };
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error };
}