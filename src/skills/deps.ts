/**
 * Skill 依赖契约（DI，Week 1 只建类型 + mock，不引具体 client）
 */

import type { LLMClient } from '../search/llm.js';
import type { ExperienceManager } from '../memory/experience.js';
import type { BrowserFetcher } from '../search/search-loop.js';

/** Node CLI 无全局 File；浏览器 File 结构上天然兼容 */
export interface RawFileLike {
  name: string;
  type: string; // MIME
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** VLM 调用契约：image 必须为 data URL；真实实现 Week 3 进 src/search/llm.ts */
export interface VLMCallInput {
  image?: string;
  prompt: string;
}

export interface VLMCallOptions {
  maxTokens?: number;
}

export type VLMClient = (
  input: VLMCallInput,
  options?: VLMCallOptions,
) => Promise<string>;

/** HTTP 响应缓存（E284：github-reader L1 API JSON 复用；get 未命中返回 null） */
export interface HttpCacheLike {
  get(url: string): string | null;
  set(url: string, body: string, ttlMs: number): void;
}

export interface SkillDeps {
  callVLM: VLMClient;
  parseDocument?: (file: RawFileLike) => Promise<string>; // Week 3 文档解析用
  complete?: LLMClient; // 文本 LLM，文档 QA/摘要用（Week 3 起）
  /** 按 skill 名解析合成客户端（github-reader 等速读型 skill 切 medium 档；缺省回落 complete） */
  completeForSkill?: (skillName: string) => LLMClient | undefined;
  /** E284：HTTP 响应缓存（github-reader 等 L1 抓取复用；测试不注入即不缓存，保持隔离） */
  httpCache?: HttpCacheLike;
  now?: () => number; // 衰减逻辑可测时间
  experienceManager?: Pick<ExperienceManager, 'add'>; // 视频学习等 Skill 回写经验库
  browserSession?: BrowserFetcher; // B站等浏览器会话兜底
  /** E240（S3 真实接入）：MCP 子 Agent 调度（真实 stdio server 经 dispatcher 调用） */
  subAgent?: {
    dispatch(
      task: string,
      options?: import('../mcp/dispatcher.js').DispatchOptions,
    ): Promise<import('../mcp/dispatcher.js').DispatchResult>;
  };
  /** E408：统一工作流入口读取项目画像；测试可注入隔离 store，生产缺省使用 data/project-profiles。 */
  projectProfiles?: Pick<import('../mcp/project-profile-store.js').ProjectProfileStore, 'loadForPlanning'>;
  /** E411：设备白名单；缺省读 data/device-auth.jsonl，测试可注入隔离 store。 */
  deviceAuth?: Pick<import('../mcp/device-auth.js').DeviceAuthStore, 'isAuthorized'>;
  /** E412：工作流计划指纹持久化；测试可注入隔离 store。 */
  workflowPlans?: Pick<
    import('../mcp/workflow-plan-store.js').WorkflowPlanStore,
    'savePending' | 'verifyForResume' | 'markActive' | 'markDone' | 'markCancelled' | 'markFailed'
  >;
}
