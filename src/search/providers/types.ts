/**
 * 搜索引擎适配器统一类型（v0.1 仅 Bocha + AnySearch）
 */

export type ProviderId = 'bocha' | 'anysearch' | 'tavily';

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
}

export interface SearchProvider {
  id: ProviderId;
  search(query: string, opts?: { timeoutMs?: number }): Promise<SearchProviderResult>;
}
