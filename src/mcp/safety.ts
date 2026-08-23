/**
 * v1.0 S3：MCP 工具调用安全（§10）
 * 执行动作白名单：工具名必须落在子 Agent 的 toolPrefix 前缀内；参数必须 JSON
 * 可序列化（拒绝函数/undefined/symbol/bigint/循环引用）；MCP 工具返回一律进
 * untrusted_data 域，由调度器标记 untrusted 供下游只读使用。
 */

import type { SubAgentMeta } from './types.js';

export interface McpCallValidation {
  ok: boolean;
  reason?: string;
}

export function validateMcpCall(
  meta: SubAgentMeta,
  toolName: string,
  args: Record<string, unknown>,
): McpCallValidation {
  if (!toolName.startsWith(meta.toolPrefix)) {
    return { ok: false, reason: `工具名 ${toolName} 不在 ${meta.id} 白名单（前缀 ${meta.toolPrefix}）内` };
  }
  if (!isJsonSerializable(args)) {
    return { ok: false, reason: '参数必须为 JSON 可序列化值（拒绝函数/undefined/symbol/bigint/循环引用）' };
  }
  return { ok: true };
}

export function isJsonSerializable(value: unknown, seen: Set<unknown> = new Set()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return value.every((item) => isJsonSerializable(item, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.entries(value).every(([key, item]) => isJsonSerializable(item, seen));
  }
  return false;
}
