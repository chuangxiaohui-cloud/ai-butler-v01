/**
 * 视频结果识别：从搜索证据中筛出 B站/YouTube/抖音等视频链接。
 * 只做“有结果才展示”，不主动强塞视频。
 */

export type VideoPlatform = 'bilibili' | 'youtube' | 'douyin' | 'other';

export interface VideoResult {
  title: string;
  url: string;
  platform: VideoPlatform;
}

export function classifyVideoUrl(url: string): VideoPlatform | null {
  const lower = url.toLowerCase();
  if (/bilibili\.com\/video\/|b23\.tv/.test(lower)) return 'bilibili';
  if (/youtube\.com\/watch|youtu\.be\//.test(lower)) return 'youtube';
  if (/douyin\.com\/video\/|v\.douyin\.com/.test(lower)) return 'douyin';
  if (/v\.qq\.com|iqiyi\.com|youku\.com/.test(lower)) return 'other';
  return null;
}

export function collectVideoResults(
  sources: Array<{ title: string; url: string }>,
  limit = 3,
): VideoResult[] {
  const out: VideoResult[] = [];
  for (const source of sources) {
    const platform = classifyVideoUrl(source.url);
    if (!platform) continue;
    out.push({
      title: source.title || source.url,
      url: source.url,
      platform,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function buildVideoBlock(videos: VideoResult[]): string {
  if (videos.length === 0) return '';
  return (
    '\n\n相关视频教程：\n' +
    videos.map((v) => `- [${v.title}](${v.url})（${v.platform}）`).join('\n')
  );
}
