/**
 * 搜索引擎适配器统一类型（v0.1 仅 Bocha + AnySearch）
 */

export type ProviderId = 'bocha' | 'anysearch' | 'tavily' | 'browser';

export interface SearchResultItem {
  title: string;
  url: string;
  content: string;
  published?: string;
  provider: ProviderId;
}

export interface SearchProviderResult {
  provider: ProviderId;
  ok: boolean;
  results: SearchResultItem[];
  latencyMs: number;
  error?: string;
  answer?: string;
  /** 面向用户的非阻塞提示（如 Bocha 余额耗尽告警，§D.3） */
  notice?: string;
}

export interface SearchOptions {
  timeoutMs?: number;
  topic?: 'general' | 'news';
  days?: number;
  includeDomains?: string[];
}

export interface SearchProvider {
  id: ProviderId;
  search(query: string, opts?: SearchOptions): Promise<SearchProviderResult>;
}
