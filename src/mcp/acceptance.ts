/** E414：MCP 动作验收契约——区分夹具与真实业务工程，默认 dry-run。 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

export type AcceptanceProjectClass = 'fixture' | 'business';
export type AcceptanceAction = 'build' | 'erc' | 'simulate';

export interface AcceptanceTarget {
  id: string;
  class: AcceptanceProjectClass;
  agentId: 'keil' | 'stm32-gcc' | 'kicad' | 'ltspice';
  action: AcceptanceAction;
  toolName: string;
  args: Record<string, unknown>;
  path: string;
  note?: string;
}

export interface AcceptanceManifest {
  version: 1;
  generatedAt?: string;
  targets: AcceptanceTarget[];
}

export interface AcceptancePlan {
  mode: 'dry_run' | 'execute';
  businessTargetCount: number;
  fixtureTargetCount: number;
  executableTargets: AcceptanceTarget[];
  blocked: Array<{ reason: string; detail?: string }>;
  message: string;
}

export interface AcceptanceCaseResult {
  id: string;
  class: AcceptanceProjectClass;
  agentId: string;
  action: AcceptanceAction;
  toolName: string;
  path: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  outputSha256?: string;
  outputBytes?: number;
  untrusted?: true;
  facts?: Record<string, unknown>;
  error?: string;
}

const FIXTURE_MARKERS = ['e410-mcp-evidence', 'e414-fixture', 'mcp-evidence'];

export function classifyProjectPath(path: string, workspaceRoot = process.cwd()): AcceptanceProjectClass {
  const rel = relative(resolve(workspaceRoot), resolve(path)).replace(/\\/g, '/').toLowerCase();
  if (FIXTURE_MARKERS.some((marker) => rel.includes(marker))) return 'fixture';
  return 'business';
}

export function discoverBusinessProjects(workspaceRoot = process.cwd()): string[] {
  const root = resolve(workspaceRoot, 'projects');
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        if (FIXTURE_MARKERS.some((marker) => entry.name.toLowerCase().includes(marker))) continue;
        walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (['.uvprojx', '.kicad_sch', '.asc'].includes(ext) || entry.name === 'CMakeLists.txt') {
        if (classifyProjectPath(path, workspaceRoot) === 'business') {
          found.push(relative(workspaceRoot, path).replace(/\\/g, '/'));
        }
      }
    }
  };
  walk(root);
  return found.sort((a, b) => a.localeCompare(b));
}

export function defaultFixtureManifest(workspaceRoot = process.cwd()): AcceptanceManifest {
  const base = 'projects/e410-mcp-evidence';
  const targets: AcceptanceTarget[] = [
    {
      id: 'fixture-keil-build',
      class: 'fixture',
      agentId: 'keil',
      action: 'build',
      toolName: 'keil.BuildProject',
      args: { projectPath: `${base}/keil/demo.uvprojx` },
      path: `${base}/keil/demo.uvprojx`,
      note: '最小夹具构建；不等于业务工程验收',
    },
    {
      id: 'fixture-stm32-gcc-build',
      class: 'fixture',
      agentId: 'stm32-gcc',
      action: 'build',
      toolName: 'stm32-gcc.BuildProject',
      args: {
        root: `${base}/stm32-gcc`,
        buildDir: `${base}/stm32-gcc/build`,
      },
      path: `${base}/stm32-gcc`,
      note: '最小夹具 CMake 构建；不等于业务工程验收',
    },
    {
      id: 'fixture-kicad-erc',
      class: 'fixture',
      agentId: 'kicad',
      action: 'erc',
      toolName: 'kicad.RunErc',
      args: { schematicPath: `${base}/kicad/demo.kicad_sch` },
      path: `${base}/kicad/demo.kicad_sch`,
      note: '最小夹具 ERC；不等于业务工程验收',
    },
    {
      id: 'fixture-ltspice-simulate',
      class: 'fixture',
      agentId: 'ltspice',
      action: 'simulate',
      toolName: 'ltspice.RunSimulation',
      args: { schematicPath: `${base}/ltspice/demo.asc` },
      path: `${base}/ltspice/demo.asc`,
      note: '最小夹具批仿真；不等于业务工程验收',
    },
  ];
  return {
    version: 1,
    targets: targets.map((target) => ({
      ...target,
      path: relative(workspaceRoot, resolve(workspaceRoot, target.path)).replace(/\\/g, '/'),
    })),
  };
}

/**
 * 用户真实工程清单（相对 workspaceRoot 下的 projects/）。
 * 当前登记：M:/projects 下 Led_Key / EDA/LED_Key / OpAmps（workspaceRoot 应为 M:/）。
 */
export function userBusinessManifest(workspaceRoot = process.cwd()): AcceptanceManifest {
  const targets: AcceptanceTarget[] = [
    {
      id: 'business-keil-led-key',
      class: 'business',
      agentId: 'keil',
      action: 'build',
      toolName: 'keil.BuildProject',
      args: { projectPath: 'projects/Led_Key/MDK-ARM/F103_Moduel.uvprojx' },
      path: 'projects/Led_Key/MDK-ARM/F103_Moduel.uvprojx',
      note: 'Led_Key Keil MDK 构建',
    },
    {
      id: 'business-stm32-led-key',
      class: 'business',
      agentId: 'stm32-gcc',
      action: 'build',
      toolName: 'stm32-gcc.BuildProject',
      args: {
        root: 'projects/Led_Key',
        buildDir: 'projects/Led_Key/build/Debug',
      },
      path: 'projects/Led_Key',
      note: 'Led_Key STM32Cube CMake（build/Debug）',
    },
    {
      id: 'business-kicad-led-key',
      class: 'business',
      agentId: 'kicad',
      action: 'erc',
      toolName: 'kicad.RunErc',
      args: { schematicPath: 'projects/EDA/LED_Key/LED_Key.kicad_sch' },
      path: 'projects/EDA/LED_Key/LED_Key.kicad_sch',
      note: 'LED_Key KiCad ERC',
    },
    {
      id: 'business-ltspice-lm741',
      class: 'business',
      agentId: 'ltspice',
      action: 'simulate',
      toolName: 'ltspice.RunSimulation',
      args: { schematicPath: 'projects/OpAmps/LM741.asc' },
      path: 'projects/OpAmps/LM741.asc',
      note: 'LM741 LTspice 批仿真',
    },
  ];
  return {
    version: 1,
    targets: targets.map((target) => ({
      ...target,
      path: relative(workspaceRoot, resolve(workspaceRoot, target.path)).replace(/\\/g, '/'),
    })),
  };
}

export function mergeManifests(...manifests: AcceptanceManifest[]): AcceptanceManifest {
  const seen = new Set<string>();
  const targets: AcceptanceTarget[] = [];
  for (const manifest of manifests) {
    for (const target of manifest.targets) {
      if (seen.has(target.id)) continue;
      seen.add(target.id);
      targets.push(target);
    }
  }
  return { version: 1, targets };
}

export function planAcceptance(input: {
  manifest: AcceptanceManifest;
  confirm: boolean;
  includeFixture?: boolean;
  requireBusiness?: boolean;
  workspaceRoot?: string;
}): AcceptancePlan {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const includeFixture = input.includeFixture !== false;
  const requireBusiness = input.requireBusiness === true;
  const business = discoverBusinessProjects(workspaceRoot);
  const blocked: AcceptancePlan['blocked'] = [];

  if (requireBusiness && business.length === 0) {
    blocked.push({
      reason: 'business_project_missing',
      detail: 'projects/ 下未发现非夹具业务工程（.uvprojx / CMakeLists.txt / .kicad_sch / .asc）',
    });
  }

  const selected = input.manifest.targets.filter((target) => {
    if (target.class === 'fixture') return includeFixture;
    return true;
  });

  for (const target of selected) {
    const abs = resolve(workspaceRoot, target.path);
    if (!existsSync(abs)) {
      blocked.push({ reason: 'path_missing', detail: `${target.id}: ${target.path}` });
    }
  }

  const executableTargets = selected.filter((target) => existsSync(resolve(workspaceRoot, target.path)));
  if (!input.confirm) {
    return {
      mode: 'dry_run',
      businessTargetCount: business.length,
      fixtureTargetCount: selected.filter((t) => t.class === 'fixture').length,
      executableTargets,
      blocked: [
        ...blocked,
        { reason: 'confirmation_required', detail: '未传 --confirm；默认零构建/ERC/仿真副作用' },
      ],
      message: '验收计划已生成（dry-run）。确认后才会调用构建/ERC/仿真工具。',
    };
  }

  return {
    mode: 'execute',
    businessTargetCount: business.length,
    fixtureTargetCount: selected.filter((t) => t.class === 'fixture').length,
    executableTargets,
    blocked,
    message: blocked.some((item) => item.reason === 'business_project_missing')
      ? '已确认执行夹具目标；真实业务工程仍缺失，不得将结果签认为业务验收。'
      : '已确认执行验收目标。',
  };
}

export function summarizeAcceptanceFacts(
  action: AcceptanceAction,
  data: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!data) return { structuredOutput: false };
  if (action === 'build') {
    return {
      structuredOutput: true,
      ok: data.ok === true,
      exitCode: data.exitCode ?? null,
      errorCount: data.errorCount ?? null,
      warningCount: data.warningCount ?? null,
      target: data.target ?? null,
    };
  }
  if (action === 'erc') {
    return {
      structuredOutput: true,
      ok: data.ok === true,
      errorCount: data.errorCount ?? null,
      warningCount: data.warningCount ?? null,
      sourceUnchanged: data.sourceUnchanged === true,
      reportRetained: data.reportRetained === false ? false : data.reportRetained ?? null,
    };
  }
  return {
    structuredOutput: true,
    ok: data.ok === true,
    simulationExecuted: data.simulationExecuted === true,
    outputFileCount: Array.isArray(data.outputFiles) ? data.outputFiles.length : 0,
    batchArgs: Array.isArray(data.batchArgs) ? data.batchArgs : [],
  };
}

export function buildP10GapSnapshot(input: {
  maturityLevel: string;
  docLintClean: boolean;
  fullRegressionRun: boolean;
  businessAccepted: boolean;
  fixtureExecuted: boolean;
  ownerSignoff: boolean;
}): Array<{ condition: string; status: 'pass' | 'fail' | 'pending'; note: string }> {
  return [
    {
      condition: '① S1-S8 全功能切片与回归',
      status: input.businessAccepted && input.fullRegressionRun ? 'pass' : 'fail',
      note: input.businessAccepted
        ? (input.fullRegressionRun ? '业务验收与回归已完成' : '业务动作有证据，但本轮未跑全量回归')
        : (input.fixtureExecuted
          ? '仅有夹具动作证据；业务工程验收未完成'
          : '专业链动作验收未完成'),
    },
    {
      condition: '② P-07/P-12/P-08 既有验收',
      status: 'pending',
      note: '本轮按成本纪律未复跑基准',
    },
    {
      condition: '③ 成熟度 L2+',
      status: /^L(?:2|3)/.test(input.maturityLevel) ? 'pass' : 'fail',
      note: `当前 ${input.maturityLevel}`,
    },
    {
      condition: '④ doc-lint 0 FAIL + 全量测试/集成绿',
      status: input.docLintClean && input.fullRegressionRun ? 'pass' : 'fail',
      note: input.docLintClean
        ? (input.fullRegressionRun ? '文档与全量测试绿' : '文档侧无新增失败，但未跑全量/集成')
        : 'doc-lint 未确认 0 FAIL（可设 E414_DOC_LINT_CLEAN=1）',
    },
    {
      condition: '⑤ 附录 C 无相反证据 + owner 签认',
      status: input.ownerSignoff ? 'pass' : 'pending',
      note: input.ownerSignoff ? '已签认' : '待 owner 签认；夹具结果不得自动签认',
    },
  ];
}

export function targetLabel(target: AcceptanceTarget): string {
  return `${target.id}｜${target.class}｜${target.agentId}.${basename(target.toolName)}｜${target.path}`;
}

export function parentDirOf(path: string): string {
  return dirname(path);
}
