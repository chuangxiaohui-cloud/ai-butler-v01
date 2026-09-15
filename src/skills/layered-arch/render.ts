/**
 * Skill: layered-arch 单文件 HTML 交付（E364）
 * 把校验通过的分层 JSON 内联进 assets/viewer.html，
 * 产出可双击即看的单文件 HTML；同时保留同名 .json 供「改图只改 JSON」。
 */

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sanitizeText(value: unknown): unknown {
  return typeof value === 'string' ? escapeHtmlText(value) : value;
}

/** viewer.html 用 innerHTML 直插 name/detail/label/rules，先做文本转义防模型 JSON 夹脚本 */
export function sanitizeForViewer(data: unknown): unknown {
  if (Array.isArray(data)) return data.map((item) => sanitizeForViewer(item));
  if (typeof data !== 'object' || data === null) return sanitizeText(data);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (key === 'id' || key === 'role' || key === 'order' || key === 'highlight' || key === 'dot') {
      out[key] = value;
    } else {
      out[key] = sanitizeForViewer(value);
    }
  }
  return out;
}

/** 在模板脚本前注入 inline 数据，让 viewer 同步渲染并跳过外部 JSON 自加载链 */
export function buildStandaloneHtml(viewerHtml: string, data: unknown): string {
  const safe = sanitizeForViewer(data);
  const json = JSON.stringify(safe).replace(/</g, '\\u003c');
  const script = `<script>window.__LAYERED_INLINE__ = ${json};</script>\n`;
  const firstScript = viewerHtml.indexOf('<script>');
  if (firstScript === -1) return viewerHtml + script;
  return viewerHtml.slice(0, firstScript) + script + viewerHtml.slice(firstScript);
}
