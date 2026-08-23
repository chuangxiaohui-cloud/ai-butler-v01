/**
 * Skill: video-learner（视频学习 → Skill）
 * 优先用 yt-dlp 拉取字幕；LLM 结构化理解后生成 Skill 定义并落盘。
 */

import { spawn } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';

const URL_RE = /https?:\/\/[^\s，。；,!！]+/;
const MAX_FRAMES = Number(process.env.VIDEO_LEARN_MAX_FRAMES ?? '6');
const FRAME_INTERVAL_SECONDS = 15;

export interface LearnedSkill {
  name: string;
  title: string;
  triggers: string[];
  intent: string;
  steps: string[];
  validation: string[];
  summary: string;
  sourceUrl: string;
  keywords: string[];
}

export function extractVideoUrl(query: string): string | null {
  return query.match(URL_RE)?.[0] ?? null;
}

export function extractBiliBvid(url: string): string | null {
  return url.match(/bilibili\.com\/video\/(BV[0-9A-Za-z]+)/i)?.[1] ?? null;
}

export function normalizeProtocolRelativeUrl(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url;
}

/** H10：yt-dlp 的 URL 必须是 http(s) 且不以 '-' 开头，避免被解析为选项 */
export function isSafeYtDlpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) && !url.startsWith('-');
}

export function cleanTranscript(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^WEBVTT/.test(line)) return false;
      if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(line)) return false;
      if (/^\d{2}:\d{2}\.\d{3}\s*-->/.test(line)) return false;
      if (/^NOTE\b/.test(line)) return false;
      if (/^kind:|^language:/.test(line)) return false;
      if (/^\d+$/.test(line)) return false;
      return true;
    })
    .filter((line) => !/^<[^>]+>$/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function runCommand(
  cmd: string,
  args: string[],
  timeoutMs = 600_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = '';
    let err = '';
    let settled = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c: string) => {
      out += c;
    });
    child.stderr.on('data', (c: string) => {
      err += c;
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`${cmd} timeout`));
    }, timeoutMs);
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim() || `${cmd} exit ${code}`));
    });
  });
}

function runYtDlp(args: string[]): Promise<string> {
  return runCommand('yt-dlp', args);
}

function runFfmpeg(args: string[]): Promise<string> {
  return runCommand('ffmpeg', args, 300_000);
}

async function downloadSubtitles(url: string, dir: string): Promise<string> {
  if (!isSafeYtDlpUrl(url)) return '';
  const output = join(dir, 'subs.%(ext)s');
  await runYtDlp([
    '--skip-download',
    '--write-auto-subs',
    '--write-subs',
    '--sub-langs',
    'zh-Hans,zh-CN,zh,en',
    '--sub-format',
    'vtt/srt',
    '--output',
    output,
    '--',
    url,
  ]);
  const files = readdirSync(dir)
    .filter((name) => /\.(srt|vtt)$/i.test(name))
    .sort();
  if (files.length === 0) return '';
  const raw = readFileSync(join(dir, files[0]), 'utf-8');
  return cleanTranscript(raw);
}

async function downloadMedia(url: string, dir: string): Promise<string> {
  if (!isSafeYtDlpUrl(url)) return '';
  const output = join(dir, 'media.%(ext)s');
  try {
    await runYtDlp(['--no-playlist', '-f', 'b', '--output', output, '--', url]);
  } catch {
    return '';
  }
  const files = readdirSync(dir)
    .filter((name) => name.startsWith('media.') && !/\.(json|part|ytdl)$/i.test(name))
    .sort();
  return files.length > 0 ? join(dir, files[0]) : '';
}

async function extractAudio(videoPath: string, dir: string): Promise<string> {
  const out = join(dir, 'audio.wav');
  try {
    await runFfmpeg(['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', out]);
    return out;
  } catch {
    return '';
  }
}

async function transcribeWithApi(audioPath: string, apiUrl: string): Promise<string> {
  const apiKey = process.env.WHISPER_API_KEY ?? process.env.LLM_PRIMARY_API_KEY ?? '';
  if (!apiKey) throw new Error('WHISPER_API_KEY 未配置');
  const url = /\/audio\/transcriptions$/.test(apiUrl)
    ? apiUrl
    : `${apiUrl.replace(/\/+$/, '')}/audio/transcriptions`;
  const buffer = readFileSync(audioPath);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'audio/wav' }), basename(audioPath));
  form.append('model', process.env.WHISPER_MODEL?.trim() || 'whisper-1');
  form.append('language', 'zh');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`ASR HTTP ${resp.status}: ${detail.slice(0, 120)}`);
  }
  const data = (await resp.json()) as {
    text?: unknown;
    data?: { text?: unknown };
  };
  const text = String(data.text ?? data.data?.text ?? '').trim();
  if (!text) throw new Error('ASR 返回空文本');
  return text;
}

async function transcribeWithLocalWhisper(audioPath: string, dir: string): Promise<string> {
  const outDir = join(dir, 'whisper-out');
  mkdirSync(outDir, { recursive: true });
  await runCommand(
    'whisper',
    [
      audioPath,
      '--language',
      'zh',
      '--model',
      process.env.WHISPER_LOCAL_MODEL?.trim() || 'base',
      '--output_format',
      'txt',
      '--output_dir',
      outDir,
      '--verbose',
      'False',
      '--fp16',
      'False',
    ],
    600_000,
  );
  const files = readdirSync(outDir)
    .filter((name) => /\.txt$/i.test(name))
    .sort();
  if (files.length === 0) return '';
  return readFileSync(join(outDir, files[0]), 'utf-8').trim();
}

async function transcribeAudio(audioPath: string, dir: string): Promise<string> {
  const apiUrl = process.env.WHISPER_API_URL?.trim();
  if (apiUrl) {
    try {
      return await transcribeWithApi(audioPath, apiUrl);
    } catch {
      // API 失败时尝试本地 whisper，都不行再返回空
    }
  }
  try {
    return await transcribeWithLocalWhisper(audioPath, dir);
  } catch {
    return '';
  }
}

type BrowserLike = NonNullable<SkillDeps['browserSession']>;
interface BiliMediaPaths {
  videoPath: string;
  audioPath: string;
}

interface BiliPlayInfo {
  audioUrl: string;
  videoUrl: string;
}

interface BiliContentResult extends BiliMediaPaths {
  transcript: string;
}

async function fetchBiliJson(
  browser: BrowserLike,
  url: string,
  dest: string,
): Promise<unknown | null> {
  const result = await browser.downloadFile(url, dest, {
    Referer: 'https://www.bilibili.com',
  });
  if (!result.ok || result.size === 0) return null;
  try {
    return JSON.parse(readFileSync(dest, 'utf-8')) as unknown;
  } catch {
    return null;
  }
}

async function getBiliViewInfo(
  browser: BrowserLike,
  bvid: string,
  dir: string,
): Promise<{ cid: number; title: string } | null> {
  const data = await fetchBiliJson(
    browser,
    `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
    join(dir, 'bili-view.json'),
  );
  const body = data as {
    code?: number;
    data?: { cid?: unknown; title?: unknown };
  } | null;
  if (body?.code !== 0 || body.data?.cid == null) return null;
  return {
    cid: Number(body.data.cid),
    title: String(body.data.title ?? ''),
  };
}

type SubtitleItem = { content?: unknown; text?: unknown };

export function parseBiliSubtitle(raw: unknown): string {
  const body = raw as { body?: unknown } | null;
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(body?.body)
      ? body.body
      : [];
  return (arr as SubtitleItem[])
    .map((item) => String(item.content ?? item.text ?? ''))
    .filter(Boolean)
    .join('\n');
}

async function getBiliSubtitle(
  browser: BrowserLike,
  bvid: string,
  cid: number,
  dir: string,
): Promise<string> {
  const data = await fetchBiliJson(
    browser,
    `https://api.bilibili.com/x/player/wbi/v2?bvid=${bvid}&cid=${cid}`,
    join(dir, 'bili-player.json'),
  );
  const body = data as {
    data?: {
      subtitle?: {
        subtitles?: Array<{ lan?: string; subtitle_url?: string }>;
      };
    };
  } | null;
  const subs = body?.data?.subtitle?.subtitles ?? [];
  const sub = subs.find((item) => /^zh/i.test(item.lan ?? '')) ?? subs[0];
  if (!sub?.subtitle_url) return '';
  const subtitleUrl = normalizeProtocolRelativeUrl(sub.subtitle_url);
  const dest = join(dir, 'bili-subtitle.json');
  const result = await browser.downloadFile(subtitleUrl, dest, {
    Referer: `https://www.bilibili.com/video/${bvid}`,
  });
  if (!result.ok || result.size === 0) return '';
  try {
    return parseBiliSubtitle(JSON.parse(readFileSync(dest, 'utf-8')) as unknown);
  } catch {
    return '';
  }
}

interface BiliPlayItem {
  id?: unknown;
  baseUrl?: unknown;
  base_url?: unknown;
  backupUrl?: unknown[];
  backup_url?: unknown[];
}

function pickBiliMediaUrl(item?: BiliPlayItem): string {
  return String(
    item?.baseUrl ??
      item?.base_url ??
      item?.backupUrl?.[0] ??
      item?.backup_url?.[0] ??
      '',
  );
}

async function getBiliPlayInfo(
  browser: BrowserLike,
  bvid: string,
  cid: number,
  dir: string,
): Promise<BiliPlayInfo | null> {
  const data = await fetchBiliJson(
    browser,
    `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=16&fnval=16&fourk=1`,
    join(dir, 'bili-play.json'),
  );
  const body = data as {
    data?: { dash?: { audio?: BiliPlayItem[]; video?: BiliPlayItem[] } };
  } | null;
  const dash = body?.data?.dash;
  const audio = dash?.audio?.[0];
  const video =
    dash?.video?.find((item) => String(item.id) === '16') ?? dash?.video?.[0];
  const audioUrl = pickBiliMediaUrl(audio);
  const videoUrl = pickBiliMediaUrl(video);
  if (!audioUrl && !videoUrl) return null;
  return { audioUrl, videoUrl };
}

async function downloadBiliMedia(
  browser: BrowserLike,
  bvid: string,
  cid: number,
  dir: string,
): Promise<BiliMediaPaths> {
  const info = await getBiliPlayInfo(browser, bvid, cid, dir);
  const out: BiliMediaPaths = { videoPath: '', audioPath: '' };
  if (info?.audioUrl) {
    const dest = join(dir, 'bili-audio.m4s');
    const result = await browser.downloadFile(info.audioUrl, dest, {
      Referer: 'https://www.bilibili.com',
    });
    if (result.ok && result.size > 0) out.audioPath = dest;
  }
  if (info?.videoUrl) {
    const dest = join(dir, 'bili-video.m4s');
    const result = await browser.downloadFile(info.videoUrl, dest, {
      Referer: 'https://www.bilibili.com',
    });
    if (result.ok && result.size > 0) out.videoPath = dest;
  }
  return out;
}

async function downloadBiliContent(
  url: string,
  browser: BrowserLike,
  dir: string,
): Promise<BiliContentResult> {
  const bvid = extractBiliBvid(url);
  const empty: BiliContentResult = { transcript: '', videoPath: '', audioPath: '' };
  if (!bvid) return empty;
  try {
    const view = await getBiliViewInfo(browser, bvid, dir);
    if (!view) return empty;
    const transcript = await getBiliSubtitle(browser, bvid, view.cid, dir);
    const media = await downloadBiliMedia(browser, bvid, view.cid, dir);
    return { transcript, ...media };
  } catch {
    return empty;
  }
}

function listFrames(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => /\.(jpe?g|png)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => join(dir, name));
}

async function extractKeyframes(
  videoPath: string,
  dir: string,
  maxFrames = MAX_FRAMES,
): Promise<string[]> {
  const frameDir = join(dir, 'frames');
  mkdirSync(frameDir, { recursive: true });
  const pattern = join(frameDir, 'frame_%03d.jpg');
  try {
    await runFfmpeg([
      '-y',
      '-i',
      videoPath,
      '-vf',
      "select='gt(scene,0.3)',scale=640:-1",
      '-vsync',
      'vfr',
      '-frames:v',
      String(maxFrames),
      pattern,
    ]);
  } catch {
    // 场景抽帧失败时用定间隔兜底
  }
  let frames = listFrames(frameDir);
  if (frames.length === 0) {
    try {
      await runFfmpeg([
        '-y',
        '-i',
        videoPath,
        '-vf',
        `fps=1/${FRAME_INTERVAL_SECONDS},scale=640:-1`,
        '-frames:v',
        String(maxFrames),
        pattern,
      ]);
    } catch {
      // 抽帧整体失败时返回空，不阻塞字幕链路
    }
    frames = listFrames(frameDir);
  }
  return frames;
}

async function describeFrames(
  framePaths: string[],
  callVLM: SkillDeps['callVLM'],
): Promise<string[]> {
  const descriptions: string[] = [];
  for (const path of framePaths) {
    try {
      const dataUrl = `data:image/jpeg;base64,${readFileSync(path).toString('base64')}`;
      const text = await callVLM(
        {
          image: dataUrl,
          prompt: '这是教学视频的关键帧。用一句中文描述画面中的操作步骤、界面、器件或注意事项。',
        },
        { maxTokens: 120 },
      );
      if (text?.trim()) descriptions.push(text.trim());
    } catch {
      // 单帧 VLM 失败跳过，避免整条链路中断
    }
  }
  return descriptions;
}

export function buildFrameEvidence(descriptions: string[]): string {
  return descriptions
    .map((text, index) => `[画面${index + 1}] ${text.trim()}`)
    .filter(Boolean)
    .join('\n');
}

export function buildVideoMaterial(
  transcript: string,
  frameEvidence: string,
): string {
  const parts: string[] = [];
  if (transcript.trim()) parts.push(`完整文字稿：\n${transcript.trim()}`);
  if (frameEvidence.trim()) parts.push(`关键帧画面描述：\n${frameEvidence.trim()}`);
  return parts.join('\n\n');
}

function fallbackSkill(url: string, title: string): LearnedSkill {
  return {
    name: `video-${Date.now()}`,
    title: title || '视频学习',
    triggers: [],
    intent: 'how_to',
    steps: ['观看视频并整理步骤'],
    validation: ['步骤可复现'],
    summary: '已提取视频内容，等待 LLM 生成结构化 Skill。',
    sourceUrl: url,
    keywords: [],
  };
}

/** H7（架构审计 2026-08-23）：每次执行用独立临时目录，杜绝并发互删 */
export function createLearnerWorkDir(outDir?: string): string {
  const baseDir = outDir ?? join(process.cwd(), 'data', 'learned-videos');
  mkdirSync(baseDir, { recursive: true });
  return mkdtempSync(join(baseDir, 'learn-'));
}

export function createVideoLearnerSkill(opts?: {
  outDir?: string;
  subtitles?: boolean;
  ytDlp?: boolean;
  media?: boolean;
  maxFrames?: number;
}): ExecutableSkill {
  return {
    name: 'video-learner',
    version: '0.1.0',
    triggers: ['学习这个视频', '视频学习', '视频总结', '总结这个视频'],
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      const url = extractVideoUrl(input.query);
      if (!url) {
        return {
          result: {
            answer: '请给我一个视频链接（B站/YouTube/抖音等），我可以提取字幕并生成 Skill。',
          },
          confidence: 0.4,
        };
      }

      let transcript = '';
      let transcriptSource: 'upload' | 'subtitle' | 'asr' = 'upload';
      const file = input.rawFiles.find(
        (f) => /\.(srt|vtt|txt|md)$/i.test(f.name),
      );
      if (file) {
        transcript = cleanTranscript(
          Buffer.from(await file.arrayBuffer()).toString('utf-8'),
        );
      }
      if (!transcript && /字幕[：:]|文字稿[：:]/.test(input.query)) {
        const inline = input.query
          .split(/字幕[：:]|文字稿[：:]/)[1]
          ?.split(/[，。；\n]/)[0];
        if (inline) transcript = inline.trim();
      }

      const workDir = createLearnerWorkDir(opts?.outDir);
      try {
        let biliMedia: BiliMediaPaths | null = null;
        if (!transcript && opts?.subtitles !== false) {
          if (opts?.ytDlp !== false) {
            try {
              transcript = await downloadSubtitles(url, workDir);
              transcriptSource = 'subtitle';
            } catch {
              transcript = '';
            }
          }
          if (!transcript && deps.browserSession && extractBiliBvid(url)) {
            const bili = await downloadBiliContent(
              url,
              deps.browserSession,
              workDir,
            );
            if (bili.transcript) {
              transcript = bili.transcript;
              transcriptSource = 'subtitle';
            }
            if (bili.videoPath || bili.audioPath) biliMedia = bili;
          }
        }

        const mediaEnabled = opts?.media !== false;
        let mediaPath = '';
        let frameDescriptions: string[] = [];
        if (mediaEnabled) {
          mediaPath = opts?.ytDlp !== false ? await downloadMedia(url, workDir) : '';
          if (!mediaPath && !biliMedia && deps.browserSession && extractBiliBvid(url)) {
            const bili = await downloadBiliContent(
              url,
              deps.browserSession,
              workDir,
            );
            if (bili.transcript && !transcript) {
              transcript = bili.transcript;
              transcriptSource = 'subtitle';
            }
            if (bili.videoPath || bili.audioPath) biliMedia = bili;
          }
          const audioSource = biliMedia?.audioPath || mediaPath;
          if (audioSource && !transcript) {
            const audioPath = await extractAudio(audioSource, workDir);
            if (audioPath) {
              const asrText = await transcribeAudio(audioPath, workDir);
              if (asrText) {
                transcript = asrText;
                transcriptSource = 'asr';
              }
            }
          }
          const frameSource = biliMedia?.videoPath || mediaPath;
          if (frameSource && deps.callVLM) {
            const frames = await extractKeyframes(
              frameSource,
              workDir,
              opts?.maxFrames ?? MAX_FRAMES,
            );
            frameDescriptions = await describeFrames(frames, deps.callVLM);
          }
        }

        const frameEvidence = buildFrameEvidence(frameDescriptions);
        const material = buildVideoMaterial(transcript, frameEvidence);
        if (!material) {
          return {
            result: {
              answer:
                '已尝试字幕与 ASR，但没有提取到可用文字稿，也没有可用关键帧画面。请提供文字稿/字幕文件，或配置 WHISPER_API_URL / 本地 whisper 后再试。',
            },
            confidence: 0.3,
          };
        }

        const outDir = opts?.outDir ?? join(process.cwd(), 'data', 'learned-videos');
        mkdirSync(outDir, { recursive: true });
        let skill: LearnedSkill;
        if (deps.complete) {
          const raw = await deps.complete.complete(
            [
              {
                role: 'user',
                content:
                  '根据视频内容（字幕和关键帧画面）生成一个可复用 Skill 定义，只输出 JSON：' +
                  '{"name":"video-xxx","title":"...","triggers":["..."],"intent":"how_to","steps":["..."],"validation":["..."],"summary":"...","keywords":["..."]}\n\n' +
                  `视频链接：${url}\n${material.slice(0, 14000)}`,
              },
            ],
            { temperature: 0.3, maxTokens: 1200, json: true },
          );
          const start = raw.indexOf('{');
          const end = raw.lastIndexOf('}');
          const parsed = start >= 0 && end > start
            ? (JSON.parse(raw.slice(start, end + 1)) as LearnedSkill)
            : null;
          skill = parsed?.name
            ? { ...parsed, sourceUrl: url }
            : fallbackSkill(url, '视频学习');
        } else {
          skill = fallbackSkill(url, '视频学习');
        }
        const safeName = skill.name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'video';
        const path = join(outDir, `${safeName}-${Date.now()}.json`);
        writeFileSync(path, JSON.stringify(skill, null, 2), 'utf-8');
        let lifecycleNote = '';
        if (deps.experienceManager) {
          try {
            deps.experienceManager.add({
              id: skill.name,
              skillName: `video:${skill.name}`,
              content:
                `${skill.summary}\n步骤：${skill.steps.join('；')}\n` +
                `验证：${skill.validation.join('；')}`,
              keywords: [...skill.triggers, ...skill.keywords],
              createdAt: Date.now(),
              lastUsedAt: null,
            });
            lifecycleNote = '，已接入经验库';
          } catch {
            // 经验库写入失败不阻塞落盘
          }
        }
        const contentNotes: string[] = [];
        if (transcriptSource === 'asr') contentNotes.push('已通过音频转文字提取字幕');
        if (biliMedia?.audioPath || biliMedia?.videoPath) {
          contentNotes.push('已通过B站浏览器会话获取播放流');
        }
        if (frameDescriptions.length > 0) {
          contentNotes.push(`已用 VLM 理解 ${frameDescriptions.length} 个关键帧`);
        }
        const contentNote = contentNotes.length > 0
          ? `（${contentNotes.join('；')}）`
          : '';
        return {
          result: {
            answer: `已生成视频学习 Skill：${path}${contentNote}${lifecycleNote}`,
            path,
            skill,
            transcriptLength: transcript.length,
            frameCount: frameDescriptions.length,
            transcriptSource,
          },
          confidence: transcript ? 0.8 : 0.55,
          followUpAction: '可以把它接入 Skill 生命周期，下次同类问题自动触发。',
        };
      } finally {
        rmSync(workDir, { recursive: true, force: true });
      }
    },
  };
}
