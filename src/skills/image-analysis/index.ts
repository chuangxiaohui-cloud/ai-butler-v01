/**
 * Skill: image-analysis（pipeline 接入后转 available）
 * 通用图片描述：VLM 一次调用，按需触发，不占预处理成本。
 */

import { toDataUrl } from '../../agent/multimodal-preprocessor.js';
import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { RawFileLike, SkillDeps } from '../deps.js';

function firstImage(input: SkillInput): RawFileLike | undefined {
  return input.rawFiles.find((f) => f.type.startsWith('image/'));
}

export function createImageAnalysisSkill(): ExecutableSkill {
  return {
    name: 'image-analysis',
    version: '0.1.0',
    triggers: ['图片', '截图', '这张图', '这个图', 'image', 'screenshot'],
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      const image = firstImage(input);
      if (!image) {
        return {
          result: { error: 'need_image', description: '' },
          confidence: 0.2,
          followUpAction: '请上传图片后重试。',
        };
      }
      try {
        const dataUrl = await toDataUrl(image);
        const raw = await deps.callVLM(
          {
            image: dataUrl,
            prompt: '用 3-5 句话描述这张图片的内容、主体和可读文字。',
          },
          { maxTokens: 200 },
        );
        return {
          result: { description: raw.trim(), raw },
          confidence: 0.85,
          followUpAction: '需要进一步识别文字、颜色或提取信息，告诉我一声。',
        };
      } catch (err) {
        return {
          result: {
            error: err instanceof Error ? err.message : String(err),
            description: '',
          },
          confidence: 0.2,
          followUpAction: '图片解析失败，可以重新上传一张。',
        };
      }
    },
  };
}
