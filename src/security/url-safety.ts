/**
 * 浏览器抓取 URL 安全校验（S1，架构审计 2026-08-23）
 *
 * 防 SSRF：fetchPage/downloadFile 只允许 http/https，拒绝回环 / 未指定 / 链路本地 /
 * IPv6 ULA / IPv4-mapped 回环——带登录态的浏览器不再被网页提示注入驱动访问本机
 * sidecar（127.0.0.1:8420）或本机管理页，结果回填进回答。
 *
 * 范围说明：RFC1918 局域网（10/8、172.16/12、192.168/16）保留放行——嵌入式工程师常用
 * 内网 datasheet 服务器；主要 SSRF 面（回环与链路本地）全部拦截。
 */

export function isBlockedBrowserUrl(raw: string): { blocked: boolean; reason?: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { blocked: true, reason: '非法 URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { blocked: true, reason: `不支持的协议：${url.protocol}` };
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isInternalAddress(host)) {
    return { blocked: true, reason: `拒绝内网/本机地址：${url.hostname}` };
  }
  return { blocked: false };
}

export function assertSafeBrowserUrl(raw: string): void {
  const check = isBlockedBrowserUrl(raw);
  if (check.blocked) throw new Error(`浏览器抓取 URL 被安全策略拒绝（${check.reason}）：${raw}`);
}

function isInternalAddress(host: string): boolean {
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return true;
  // IPv4-mapped IPv6：拆出内嵌 IPv4 再判（Node 会规范化为 ::ffff:7f00:1 十六进制形式）
  if (host.startsWith('::ffff:')) {
    const mapped = host.slice(7);
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(mapped)) return isInternalAddress(mapped);
    const groups = mapped.split(':').map((g) => parseInt(g || '0', 16));
    if (groups.length === 2 && groups.every((g) => Number.isFinite(g))) {
      const ipv4 = [
        (groups[0] >> 8) & 0xff,
        groups[0] & 0xff,
        (groups[1] >> 8) & 0xff,
        groups[1] & 0xff,
      ].join('.');
      return isInternalAddress(ipv4);
    }
    return false;
  }
  if (/^127\./.test(host)) return true; // 127.0.0.0/8 回环
  if (/^169\.254\./.test(host)) return true; // 链路本地
  if (/^fe80:/i.test(host) || /^fc/i.test(host) || /^fd/i.test(host)) return true; // fe80::/10、fc00::/7 ULA
  return false;
}
