import { createHash } from 'node:crypto';

import { closeMcpAgents, createMcpAgents, loadMcpAgentConfig } from '../src/mcp/config.js';
import { validateMcpCall } from '../src/mcp/safety.js';
import { resolveRealToolName } from '../src/mcp/types.js';

const CASES = [
  { agentId: 'keil', toolName: 'keil.InspectProjectProfile', args: { projectPath: 'projects/e410-mcp-evidence/keil/demo.uvprojx' } },
  { agentId: 'vscode', toolName: 'vscode.InspectWorkspace', args: { root: 'projects/e410-mcp-evidence/vscode' } },
  { agentId: 'stm32-gcc', toolName: 'stm32-gcc.InspectProjectProfile', args: { root: 'projects/e410-mcp-evidence/stm32-gcc' } },
  { agentId: 'kicad', toolName: 'kicad.InspectProject', args: { projectPath: 'projects/e410-mcp-evidence/kicad/demo.kicad_pro' } },
  { agentId: 'ltspice', toolName: 'ltspice.InspectSchematic', args: { schematicPath: 'projects/e410-mcp-evidence/ltspice/demo.asc' } },
] as const;

const entries = loadMcpAgentConfig().filter((entry) => CASES.some((item) => item.agentId === entry.id));
const { metas, clients } = createMcpAgents(entries);

try {
  const results = [];
  for (const item of CASES) {
    const meta = metas.find((candidate) => candidate.id === item.agentId);
    const client = clients.get(item.agentId);
    if (!meta || !client) {
      results.push({ agentId: item.agentId, ok: false, error: 'Agent 未配置' });
      continue;
    }
    const validation = validateMcpCall(meta, item.toolName, item.args);
    const realTool = resolveRealToolName(meta, item.toolName);
    if (!validation.ok || !realTool) {
      results.push({ agentId: item.agentId, ok: false, error: validation.reason ?? '工具未通过白名单' });
      continue;
    }
    try {
      const tools = await client.listTools();
      if (!tools.some((tool) => tool.name === realTool)) throw new Error(`server 未声明 ${realTool}`);
      const call = await client.callTool(realTool, item.args, meta.heartbeatMs);
      const parsed = call.ok ? parseOutput(call.output) : null;
      results.push({
        agentId: item.agentId,
        ok: call.ok,
        initializePassed: true,
        declaredToolCount: tools.length,
        declaredTools: tools.map((tool) => tool.name),
        checkedTool: realTool,
        fixture: Object.values(item.args)[0],
        outputSha256: createHash('sha256').update(call.output, 'utf8').digest('hex'),
        outputBytes: Buffer.byteLength(call.output, 'utf8'),
        untrusted: call.untrusted,
        facts: summarize(item.agentId, parsed),
        ...(call.error ? { error: call.error } : {}),
      });
    } catch (error) {
      results.push({
        agentId: item.agentId,
        ok: false,
        initializePassed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const ok = results.length === CASES.length && results.every((result) => result.ok);
  console.log(JSON.stringify({ ok, scope: 'fixture-read-only', results }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  closeMcpAgents(clients);
}

function parseOutput(output: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(output);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function summarize(agentId: string, data: Record<string, unknown> | null): Record<string, unknown> {
  if (!data) return { structuredOutput: false };
  if (agentId === 'keil' || agentId === 'stm32-gcc') {
    const profile = record(data.profile);
    return {
      structuredOutput: Boolean(profile),
      platform: profile?.platform ?? null,
      chip: profile?.chip ?? null,
      targets: Array.isArray(profile?.targets) ? profile.targets : [],
      buildCapabilityObserved: record(profile?.build) !== null,
      flashCapabilityObserved: record(profile?.flash) !== null,
    };
  }
  if (agentId === 'vscode') {
    return {
      structuredOutput: true,
      taskCount: Array.isArray(data.tasks) ? data.tasks.length : 0,
      cppConfigurationCount: Array.isArray(data.cppConfigurations) ? data.cppConfigurations.length : 0,
      liveDiagnosticsAvailable: data.liveDiagnosticsAvailable === true,
    };
  }
  if (agentId === 'kicad') {
    return {
      structuredOutput: true,
      schematicCount: data.schematicCount ?? 0,
      boardCount: data.boardCount ?? 0,
      symbolCount: data.symbolCount ?? 0,
      cliAvailable: data.cliAvailable === true,
    };
  }
  return {
    structuredOutput: true,
    componentCount: data.componentCount ?? 0,
    simulationDirectiveCount: Array.isArray(data.simulationDirectives) ? data.simulationDirectives.length : 0,
    executableAvailable: data.executableAvailable === true,
    simulationExecuted: data.simulationExecuted === true,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
