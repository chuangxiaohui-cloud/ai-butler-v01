/**
 * Skill 依赖契约（DI，Week 1 只建类型 + mock，不引具体 client）
 */

import type { LLMClient } from '../search/llm.js';

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

export interface SkillDeps {
  callVLM: VLMClient;
  parseDocument?: (file: RawFileLike) => Promise<string>; // Week 3 文档解析用
  complete?: LLMClient; // 文本 LLM，文档 QA/摘要用（Week 3 起）
  now?: () => number; // 衰减逻辑可测时间
}
