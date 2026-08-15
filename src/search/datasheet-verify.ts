/**
 * datasheet 下载内容校验（E83）
 * 只按链接选 PDF 会把认证证书/错页资料存成目标型号；下载后先抽文本，
 * 用型号前缀判断是否真的匹配，避免“野史”文件冒充官方 datasheet。
 */

export const MIN_PART_PREFIX_LEN = 6;

export function normalizePart(part: string): string {
  return part.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function datasheetPrefixMatch(text: string, part: string): number {
  const normalizedText = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normalizedPart = normalizePart(part);
  const maxLen = Math.min(normalizedPart.length, normalizedText.length);
  for (let len = maxLen; len >= MIN_PART_PREFIX_LEN; len -= 1) {
    if (normalizedText.includes(normalizedPart.slice(0, len))) return len;
  }
  return 0;
}

export function verifyDatasheetText(text: string, part: string): boolean {
  const normalizedPart = normalizePart(part);
  if (normalizedPart.length < MIN_PART_PREFIX_LEN) return true;
  return datasheetPrefixMatch(text, part) >= MIN_PART_PREFIX_LEN;
}
