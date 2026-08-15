/**
 * 强时效查询判定（E81）
 * “现在/当前/今天/实时/最新/在轨/驻留”等词表示用户要的是当前状态，
 * 检索、融合与合成都必须按新闻时效处理，旧闻只能作背景，不能当现状。
 */

const RECENCY_SENSITIVE_RE =
  /现在|当前|目前|当下|今天|今日|实时|最新|截至|进展|更新|行情|在轨|驻留|在位|现役|现任|在任|在役|现状/;

export function isRecencySensitiveQuery(query: string): boolean {
  return RECENCY_SENSITIVE_RE.test(query);
}
