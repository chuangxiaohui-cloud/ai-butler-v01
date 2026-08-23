/**
 * v1.0 S3：MCP 子 Agent 类型（§4.1.2 工程开发栏 + §10 安全）
 * 子 Agent 类别对齐工程开发栏 EDA/结构/编码/仿真分类；MCP 工具返回一律进
 * untrusted_data 域（§10：返回值不可信，只作展示/证据，不直接驱动动作）。
 */

/** 子 Agent 类别（§4.1.2：EDA/结构/编码/仿真；build 归入编译类） */
export type SubAgentCategory = 'eda' | 'structure' | 'code' | 'simulation' | 'build';

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
}

export interface McpClient {
  listTools(): Promise<McpTool[]>;
  /** timeoutMs 覆盖 [P-41] 心跳超时（调度器降级/重试场景可收紧） */
  callTool(name: string, args: Record<string, unknown>, timeoutMs?: number): Promise<McpCallResult>;
  close(): void;
}
