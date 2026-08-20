/**
 * 显式“记住：...”指令解析。
 * 命中后由 pipeline 写入长期事实，不走搜索。
 */

const REMEMBER_RE = /^(?:请)?(?:帮我)?记住[：:]\s*(.+)$/;

export function extractRememberInstruction(query: string): string | null {
  const m = query.trim().match(REMEMBER_RE);
  if (!m) return null;
  const content = m[1].trim();
  return content || null;
}
