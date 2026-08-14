/**
 * Skill: color-recognition（Week 3）
 * L1 语义色名（VLM）→ L2 主色调 HEX（VLM JSON，解析失败时用语义名兜底）。
 */

import { toDataUrl } from '../../agent/multimodal-preprocessor.js';
import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { RawFileLike, SkillDeps } from '../deps.js';

const COLOR_HEX: Record<string, string> = {
  红: '#E60012',
  橙: '#FF7F00',
  黄: '#FFD700',
  绿: '#00A650',
  青: '#00A0E9',
  蓝: '#005BAC',
  紫: '#7B2D8B',
  粉: '#FFC0CB',
  黑: '#222222',
  白: '#FFFFFF',
  灰: '#808080',
  棕: '#8B5A2B',
  金: '#D4AF37',
  银: '#C0C0C0',
};

const COLOR_NAMES = Object.keys(COLOR_HEX);

function parseSemantic(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of COLOR_NAMES) {
    if (text.includes(name) && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function parsePalette(text: string): Array<{ name: string; hex: string }> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      colors?: Array<{ name?: unknown; hex?: unknown }>;
    };
    if (!Array.isArray(parsed.colors)) return null;
    const palette = parsed.colors
      .filter(
        (c) =>
          typeof c.name === 'string' &&
          typeof c.hex === 'string' &&
          /^#[0-9a-fA-F]{6}$/.test(c.hex),
      )
      .map((c) => ({ name: c.name as string, hex: (c.hex as string).toUpperCase() }));
    return palette.length > 0 ? palette : null;
  } catch {
    return null;
  }
}

function firstImage(input: SkillInput): RawFileLike | undefined {
  return input.rawFiles.find((f) => f.type.startsWith('image/'));
}

export function createColorRecognitionSkill(): ExecutableSkill {
  return {
    name: 'color-recognition',
    version: '0.1.0',
    triggers: ['颜色', '配色', '色号', '主色', '色彩', 'color', 'hex'],
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      const image = firstImage(input);
      if (!image) {
        return {
          result: { error: 'need_image', semantic: [], palette: [] },
          confidence: 0.2,
          followUpAction: '请上传图片后重试。',
        };
      }

      const wantsPalette = /色号|主色|调色板|配色|取色|hex/i.test(input.query);
      const dataUrl = await toDataUrl(image);
      try {
        if (wantsPalette) {
          const raw = await deps.callVLM(
            {
              image: dataUrl,
              prompt:
                '提取这张图片的主色调，最多5个，只输出 JSON：{"colors":[{"name":"红色","hex":"#E60012"}]}。',
            },
            { maxTokens: 200 },
          );
          const palette =
            parsePalette(raw) ??
            parseSemantic(raw).map((name) => ({ name, hex: COLOR_HEX[name] }));
          return {
            result: {
              semantic: palette.map((c) => c.name),
              palette,
              raw,
            },
            confidence: 0.85,
            followUpAction: '需要更精确的色值？我可以继续做逐点取色。',
          };
        }

        const raw = await deps.callVLM(
          {
            image: dataUrl,
            prompt:
              '用一句话描述这张图片，并列出主要颜色（中文语义色名，最多5个，用顿号分隔）。',
          },
          { maxTokens: 100 },
        );
        const semantic = parseSemantic(raw);
        return {
          result: { semantic, raw },
          confidence: 0.85,
          followUpAction: '要提取精确色号（HEX）的话，告诉我一声。',
        };
      } catch (err) {
        return {
          result: {
            error: err instanceof Error ? err.message : String(err),
            semantic: [],
            palette: [],
          },
          confidence: 0.2,
          followUpAction: '可以重新上传一张更清晰的图片。',
        };
      }
    },
  };
}
