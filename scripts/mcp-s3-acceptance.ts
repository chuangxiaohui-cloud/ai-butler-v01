/** E414：MCP 构建/ERC/仿真验收入口；默认 dry-run，--confirm 才执行。 */

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { PARAMS } from '../src/config/params.js';
import {
  buildP10GapSnapshot,
  defaultFixtureManifest,
  discoverBusinessProjects,
  mergeManifests,
  planAcceptance,
  summarizeAcceptanceFacts,
  userBusinessManifest,
  type AcceptanceCaseResult,
  type AcceptanceManifest,
} from '../src/mcp/acceptance.js';
import {
  closeMcpAgents,
  createMcpAgents,
  loadMcpAgentConfig,
  type McpAgentConfigEntry,
} from '../src/mcp/config.js';
import { validateMcpCall } from '../src/mcp/safety.js';
import { resolveRealToolName } from '../src/mcp/types.js';

function argFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const confirm = argFlag('--confirm');
const businessOnly = argFlag('--business-only');
const includeFixture = !businessOnly;
const requireBusiness = !argFlag('--allow-fixture-only');
const workspaceRoot = resolve(argValue('--workspace-root') ?? process.cwd());
const repoRoot = process.cwd();
const reportPath = argValue('--report')
  ?? join(repoRoot, 'docs', 'reports', `mcp-s3-acceptance-${stamp()}.md`);

const fixture = defaultFixtureManifest(workspaceRoot);
const business = userBusinessManifest(workspaceRoot);
const manifest: AcceptanceManifest = businessOnly
  ? business
  : mergeManifests(fixture, business);

const businessPaths = discoverBusinessProjects(workspaceRoot);
const plan = planAcceptance({
  manifest,
  confirm,
  includeFixture,
  requireBusiness,
  workspaceRoot,
});

const entries = withWorkspaceRoot(
  loadMcpAgentConfig().filter((entry) =>
    plan.executableTargets.some((target) => target.agentId === entry.id),
  ),
  workspaceRoot,
  repoRoot,
);

const results: AcceptanceCaseResult[] = [];

if (plan.mode === 'dry_run') {
  for (const target of plan.executableTargets) {
    results.push({
      id: target.id,
      class: target.class,
      agentId: target.agentId,
      action: target.action,
      toolName: target.toolName,
      path: target.path,
      ok: false,
      skipped: true,
      reason: 'dry_run',
    });
  }
} else {
  const { metas, clients } = createMcpAgents(entries);
  try {
    for (const target of plan.executableTargets) {
      const meta = metas.find((item) => item.id === target.agentId);
      const client = clients.get(target.agentId);
      if (!meta || !client) {
        results.push({
          id: target.id,
          class: target.class,
          agentId: target.agentId,
          action: target.action,
          toolName: target.toolName,
          path: target.path,
          ok: false,
          error: 'Agent 未配置',
        });
        continue;
      }
      const validation = validateMcpCall(meta, target.toolName, target.args);
      const realTool = resolveRealToolName(meta, target.toolName);
      if (!validation.ok || !realTool) {
        results.push({
          id: target.id,
          class: target.class,
          agentId: target.agentId,
          action: target.action,
          toolName: target.toolName,
          path: target.path,
          ok: false,
          error: validation.reason ?? '工具未通过白名单',
        });
        continue;
      }
      try {
        const tools = await client.listTools();
        if (!tools.some((tool) => tool.name === realTool)) {
          throw new Error(`server 未声明 ${realTool}`);
        }
        const timeoutMs = target.action === 'erc'
          ? PARAMS.fileGenTimeoutMs
          : PARAMS.compileTimeoutMs;
        const call = await client.callTool(realTool, target.args, timeoutMs);
        const parsed = call.ok ? parseOutput(call.output) : null;
        results.push({
          id: target.id,
          class: target.class,
          agentId: target.agentId,
          action: target.action,
          toolName: target.toolName,
          path: target.path,
          ok: call.ok,
          outputSha256: createHash('sha256').update(call.output, 'utf8').digest('hex'),
          outputBytes: Buffer.byteLength(call.output, 'utf8'),
          untrusted: true,
          facts: summarizeAcceptanceFacts(target.action, parsed),
          ...(call.error ? { error: call.error } : {}),
        });
      } catch (error) {
        results.push({
          id: target.id,
          class: target.class,
          agentId: target.agentId,
          action: target.action,
          toolName: target.toolName,
          path: target.path,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    closeMcpAgents(clients);
  }
}

const fixtureExecuted = results.some((item) => item.class === 'fixture' && item.ok && !item.skipped);
const businessAccepted = results.some((item) => item.class === 'business' && item.ok && !item.skipped);
const maturityLevel = process.env.E414_MATURITY_LEVEL ?? 'L1';
const docLintClean = process.env.E414_DOC_LINT_CLEAN === '1';
const fullRegressionRun = process.env.E414_FULL_REGRESSION === '1';
const gaps = buildP10GapSnapshot({
  maturityLevel,
  docLintClean,
  fullRegressionRun,
  businessAccepted,
  fixtureExecuted,
  ownerSignoff: false,
});

const payload = {
  ok: false,
  scope: confirm ? 'execute' : 'dry_run',
  workspaceRoot,
  plan,
  businessPaths,
  results,
  p10: {
    passed: false,
    gaps,
  },
};

console.log(JSON.stringify(payload, null, 2));
writeFileSync(reportPath, renderReport(payload), 'utf8');
console.error(`E414 report written: ${reportPath}`);
process.exitCode = 0;

/** 业务工程在 M:/projects 时，把 MCP server 沙箱根切到 M:/，画像仍写回本仓库 data/。 */
function withWorkspaceRoot(
  entries: McpAgentConfigEntry[],
  mcpWorkspaceRoot: string,
  profileRepoRoot: string,
): McpAgentConfigEntry[] {
  const profileRoot = join(profileRepoRoot, 'data', 'project-profiles');
  return entries.map((entry) => {
    const command = [...entry.command];
    stripFlag(command, '--workspace-root');
    stripFlag(command, '--profile-root');
    command.push('--workspace-root', mcpWorkspaceRoot, '--profile-root', profileRoot);
    return { ...entry, command };
  });
}

function stripFlag(command: string[], flag: string): void {
  const index = command.indexOf(flag);
  if (index >= 0) command.splice(index, 2);
}

function parseOutput(output: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(output);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function stamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function renderReport(data: typeof payload): string {
  const lines = [
    '# MCP S3 动作验收与 [P-10] 差距报告',
    '',
    `> 证据时间：${new Date().toISOString()} · 范围：E414 · 模式：${data.scope} · workspaceRoot：\`${data.workspaceRoot}\` · 结论：[P-10] 未通过`,
    '',
    '## 1. 口径',
    '',
    '- 区分 `fixture`（最小夹具）与 `business`（用户真实业务工程）。',
    '- 默认 dry-run；仅 `--confirm` 才调用构建/ERC/仿真工具。',
    '- 夹具成功只证明工具链可运行，**不等于**业务工程验收，也不得自动签认 [P-10]。',
    '',
    '## 2. 发现',
    '',
    `- 业务工程路径：${data.businessPaths.length ? data.businessPaths.join('、') : '无'}`,
    `- 计划：${data.plan.message}`,
    `- 阻塞：${data.plan.blocked.map((item) => `${item.reason}${item.detail ? `(${item.detail})` : ''}`).join('、') || '无'}`,
    '',
    '## 3. 动作结果',
    '',
    '| ID | 类别 | 动作 | 工具 | 路径 | 结果 | 证据 |',
    '|----|------|------|------|------|------|------|',
  ];
  for (const item of data.results) {
    const evidence = item.skipped
      ? 'skipped'
      : item.outputSha256
        ? `${item.outputBytes ?? 0}B / ${item.outputSha256.slice(0, 12)}…`
        : (item.error ?? 'n/a');
    lines.push(
      `| ${item.id} | ${item.class} | ${item.action} | ${item.toolName} | ${item.path} | ${item.skipped ? '跳过' : item.ok ? '✅' : '❌'} | ${evidence} |`,
    );
  }
  lines.push('', '## 4. [P-10] 差距', '', '| 条件 | 状态 | 说明 |', '|------|------|------|');
  for (const gap of data.p10.gaps) {
    const mark = gap.status === 'pass' ? '✅' : gap.status === 'pending' ? '⏸' : '❌';
    lines.push(`| ${gap.condition} | ${mark} ${gap.status} | ${gap.note} |`);
  }
  lines.push(
    '',
    '## 5. 结论',
    '',
    '- E414 本轮完成验收入口与差距复验；**[P-10] 仍不能判定通过**（除非五条件同时满足且 owner 签认）。',
    '- 下一动作：用户确认后再 `--confirm`；补全成熟度 L2+、doc-lint/全量回归与 owner 签认。',
    '',
  );
  return lines.join('\n');
}
