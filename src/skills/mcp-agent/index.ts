/**
 * Skill: mcp-agent（MCP 子 Agent 调度，E240 S3 真实接入）
 * 有可用子 Agent（真实 stdio MCP server，如 windows-mcp）时把查询 dispatch 到
 * 对应子 Agent 工具；返回一律标记 untrusted（§10，只读展示，不直接驱动动作）。
 * 支持显式工具调用语法 `windows.Process(mode=list,limit=5)`；未指定参数时
 * Process 工具默认只读 `mode=list`（§10：危险参数如 kill 默认拒绝）。
 * 无可用子 Agent 时诚实提示，不假装执行。
 */

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';

/** 显式工具调用语法：`windows.Process` / `windows.Process(mode=list,limit=5)` */
const TOOL_REF_RE = /([a-z][a-z0-9-]*\.[A-Za-z][A-Za-z0-9_.-]*)(?:\(([^)]*)\))?/;

/** E240：`windows.Process` 未指定参数时的只读默认；kill 等危险模式默认拒绝 */
const DANGEROUS_ARGS: Array<[string, unknown]> = [['mode', 'kill']];

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  const args: Record<string, unknown> = {};
  for (const part of raw.split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (/^-?\d+$/.test(val)) args[key] = Number(val);
    else if (val === 'true') args[key] = true;
    else if (val === 'false') args[key] = false;
    else args[key] = val;
  }
  return args;
}

export function createMcpAgentSkill(): ExecutableSkill {
  return {
    name: 'mcp-agent',
    version: '0.1.0',
    triggers: ['进程', '窗口', '桌面', '系统工具', '子agent', '子 Agent', 'mcp', 'windows.'],
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      if (!deps.subAgent) {
        return {
          result: 'MCP 子 Agent 调度未装配，无法执行系统/工具类操作。',
          confidence: 0.2,
          followUpAction: '配置 configs/mcp-agents.json 启用真实 MCP server 后可用。',
        };
      }
      const match = input.query.match(TOOL_REF_RE);
      const toolRef = match?.[1];
      let args = parseArgs(match?.[2]);
      for (const [key, value] of DANGEROUS_ARGS) {
        if (args[key] === value) {
          return {
            result: `危险参数 ${key}=${value} 默认拒绝（§10 双闸），如需执行请人工审批。`,
            confidence: 0.3,
            followUpAction: '本工具默认只读，危险操作不自动执行。',
          };
        }
      }
      if (toolRef?.endsWith('.Process') && Object.keys(args).length === 0) {
        args = { mode: 'list', limit: 20 };
      }
      const options = toolRef
        ? { toolName: toolRef, args }
        : { category: 'system' as const, args };
      const result = await deps.subAgent.dispatch(input.query, options);
      if (result.ok) {
        return {
          result: result.output || '子 Agent 执行完成，无文本输出。',
          confidence: 0.8,
          followUpAction: '输出来自 MCP 工具（untrusted 域，仅作展示/证据，未直接驱动后续动作）。',
        };
      }
      return {
        result: result.error ? `子 Agent 执行失败：${result.error}` : '子 Agent 当前不可用。',
        confidence: 0.3,
        followUpAction: '请确认对应软件已安装并配置 configs/mcp-agents.json。',
      };
    },
  };
}