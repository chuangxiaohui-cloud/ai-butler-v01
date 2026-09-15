/**
 * v1.0 S3：MCP 子 Agent 类型（§4.1.2 工程开发栏 + §10 安全）
 * 子 Agent 类别对齐工程开发栏 EDA/结构/编码/仿真分类；MCP 工具返回一律进
 * untrusted_data 域（§10：返回值不可信，只作展示/证据，不直接驱动动作）。
 * E240（S3 真实接入）：真实 stdio MCP server 的工具名通常不带 agent 前缀，
 * 通过 toolMap/defaultTool 做「内部带前缀名 → 真实工具名」映射，allowedTools
 * 为真实工具名白名单（§10，缺省全拒）。
 */

/** 子 Agent 类别（§4.1.2：EDA/结构/编码/仿真；build 归入编译类；system 为真实接入的系统控制类） */
export type SubAgentCategory = 'eda' | 'structure' | 'code' | 'simulation' | 'build' | 'system';

export interface SubAgentMeta {
  /** 唯一 id（kebab-case，如 kicad/keil） */
  id: string;
  /** 展示名（如 KiCad） */
  name: string;
  category: SubAgentCategory;
  /** 工具名前缀（如 'kicad.'），调度与白名单共用 */
  toolPrefix: string;
  /** 是否已接入可用（默认占位 false，配置可启用） */
  available: boolean;
  /** stdio 启动命令；空数组 = 未接入占位 */
  command: string[];
  /** [P-41] 子 Agent 心跳/调用超时（ms），缺省读 PARAMS */
  heartbeatMs?: number;
  /** [P-57] 子 Agent 启动延迟（ms），缺省读 PARAMS */
  startTimeoutMs?: number;
  /**
   * E240：真实 MCP 工具名映射。key = 内部工具名（带 toolPrefix，如 'windows.Process'），
   * value = server 真实工具名（如 'Process'）。缺省映射 = 剥掉 toolPrefix。
   */
  toolMap?: Record<string, string>;
  /** E240：未显式指定工具时的默认内部工具名（缺省 `${toolPrefix}run`） */
  defaultTool?: string;
  /** E240：无显式参数时合并的只读默认参数（如 windows Process 的 { mode: 'list' }） */
  defaultArgs?: Record<string, unknown>;
  /**
   * E240：§10 真实工具名白名单。真实 MCP server 工具多且含高危项（命令执行/文件系统/注册表/
   * UI 点击），未列出的真实工具默认拒绝。空/缺省 = 全部拒绝（安全默认）。
   */
  allowedTools?: string[];
}

export interface McpTool {
  name: string;
  description: string;
  /** JSON Schema 输入约束（最小集） */
  inputSchema: Record<string, unknown>;
}

/** MCP 工具调用结果：返回一律标记 untrusted（§10） */
export interface McpCallResult {
  ok: boolean;
  output: string;
  untrusted: true;
  elapsedMs: number;
  error?: string;
  timedOut?: boolean;
  cancelled?: boolean;
}

export interface McpClient {
  listTools(): Promise<McpTool[]>;
  /** timeoutMs 覆盖 [P-41] 心跳超时（调度器降级/重试场景可收紧） */
  callTool(name: string, args: Record<string, unknown>, timeoutMs?: number, signal?: AbortSignal): Promise<McpCallResult>;
  close(): void;
}

/**
 * E240：内部工具名 → 真实 MCP 工具名（§10 白名单校验后调用）。
 * 占位子 Agent（未配置 toolMap/allowedTools，E222 骨架语义）透传内部名
 * （server 工具名即 `前缀.工具`）；真实接入（配置了 toolMap 或 allowedTools）
 * 剥前缀/按 toolMap 映射，返回 null 表示不在 allowedTools 白名单内（默认拒绝）。
 */
export function resolveRealToolName(meta: SubAgentMeta, internalToolName: string): string | null {
  if (!internalToolName.startsWith(meta.toolPrefix)) return null;
  const isRealServer = meta.toolMap !== undefined || meta.allowedTools !== undefined;
  if (!isRealServer) return internalToolName;
  const mapped = meta.toolMap?.[internalToolName] ?? internalToolName.slice(meta.toolPrefix.length);
  if (meta.allowedTools && !meta.allowedTools.includes(mapped)) return null;
  return mapped || null;
}
