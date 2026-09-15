/**
 * 显式“记住：...”指令解析。
 * 命中后由 pipeline 写入长期事实，不走搜索。
 */

const REMEMBER_RE = /^(?:请)?(?:帮我)?记住[：:]\s*(.+)$/;
const CORRECT_RE =
  /^(?:请)?(?:帮我)?(?:纠正|更正)记忆[：:]\s*(.+?)\s*(?:→|->|改为)\s*(.+)$/;

export interface MemoryCorrection {
  oldContent: string;
  newContent: string;
}

export function extractRememberInstruction(query: string): string | null {
  const m = query.trim().match(REMEMBER_RE);
  if (!m) return null;
  const content = m[1].trim();
  return content || null;
}

export function extractMemoryCorrection(query: string): MemoryCorrection | null {
  const match = query.trim().match(CORRECT_RE);
  if (!match) return null;
  const oldContent = match[1].trim();
  const newContent = match[2].trim();
  return oldContent && newContent ? { oldContent, newContent } : null;
}
