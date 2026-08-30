/**
 * 浏览器抓取 URL 安全校验（S1，架构审计 2026-08-23）
 *
 * 防 SSRF：fetchPage/downloadFile 只允许 http/https，拒绝回环 / 未指定 / 链路本地 /
 * IPv6 ULA / IPv4-mapped 回环——带登录态的浏览器不再被网页提示注入驱动访问本机
 * sidecar（127.0.0.1:8420）或本机管理页，结果回填进回答。
 *
 * 范围说明（E292 收紧，owner 拍板 2026-08-30）：RFC1918 局域网（10/8、172.16/12、
 * 192.168/16）一并拦截——浏览器带登录态，禁止被引导访问内网资产；十进制/十六进制
 * 整数 IP（如 2130706433、0x7f000001，浏览器会解析为 127.0.0.1）归一化后同判。
 * 已知影响：嵌入式内网 datasheet 服务器（http://192.168.x.x/ 等）不再可经浏览器抓取。
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
  if (/^10\./.test(host)) return true; // 10.0.0.0/8 RFC1918（E292 收紧）
  if (/^192\.168\./.test(host)) return true; // 192.168.0.0/16 RFC1918（E292 收紧）
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true; // 172.16.0.0/12 RFC1918（E292 收紧）
  const numericIp = numericHostToIpv4(host);
  if (numericIp && isInternalAddress(numericIp)) return true; // 十进制/十六进制整数 IP 归一化后同判
  return false;
}

/** 浏览器会把纯十进制/十六进制整数 host 当作 32 位 IPv4（如 2130706433 → 127.0.0.1），归一化避免绕过。 */
function numericHostToIpv4(host: string): string | null {
  const parse = (s: string | number): number | null => {
    const n = Number(s);
    return Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff ? n : null;
  };
  let n: number | null = null;
  if (/^\d+$/.test(host)) n = parse(host);
  else if (/^0x[0-9a-f]+$/i.test(host)) n = parse(parseInt(host.slice(2), 16));
  if (n === null) return null;
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join(".");
}
