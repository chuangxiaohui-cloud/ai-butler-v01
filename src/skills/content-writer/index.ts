/**
 * Skill: content-writer（文档/PRD 生成）
 * 有文本 LLM 时按 query 生成结构化文档；无 LLM 时诚实报未接入。
 */

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';
import { workflowPromptBlock } from '../delivery-workflow/index.js';

export function createContentWriterSkill(): ExecutableSkill {
  return {
    name: 'content-writer',
    version: '0.1.0',
    triggers: ['PRD', '文档', '方案', '需求', '报告', '写作', 'write'],
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      if (!deps.complete) {
        return {
          result: { error: 'content_writer_requires_llm' },
          confidence: 0.2,
          followUpAction: '文本 LLM 未接入，暂时无法生成文档。',
        };
      }
      try {
        const content = await deps.complete.complete(
          [
          {
            role: 'user',
            content:
              `根据用户要求生成一份结构清晰的中文文档（Markdown），包含标题、目标、范围、要点、下一步。不要加开场白。\n\n` +
              `请先按以下工作流约束执行：\n${workflowPromptBlock(input.query)}\n\n` +
              `如果用户需求仍有不清楚之处，在文档末尾列“待确认问题”，不要编造缺失信息。\n\n` +
              `要求：${input.query}`,
          },
          ],
          { temperature: 0.4, maxTokens: 1200 },
        );
        const title =
          content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '新建文档';
        return {
          result: { title, content: content.trim() },
          confidence: 0.8,
          followUpAction: '需要调整结构、扩写某一节或导出成文件，随时说。',
        };
      } catch (err) {
        return {
          result: {
            error: err instanceof Error ? err.message : String(err),
          },
          confidence: 0.2,
          followUpAction: '文档生成失败，可以稍后重试。',
        };
      }
    },
  };
}
