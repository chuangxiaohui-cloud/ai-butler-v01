/**
 * Skill: engineer（代码实现执行器）
 * 有文本 LLM 时按需求生成代码/实现方案；无 LLM 时诚实提示。
 */

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';
import { workflowPromptBlock } from '../delivery-workflow/index.js';

export function createEngineerSkill(): ExecutableSkill {
  return {
    name: 'engineer',
    version: '0.1.0',
    triggers: ['代码', '实现', '开发', '接口', '模块', 'App', '前端', '后端', 'PCB', '固件'],
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      if (!deps.complete) {
        return {
          result: {
            answer: 'project_manager/plan：工程师执行器已就绪，文本 LLM 接入后即可生成代码。',
          },
          confidence: 0.3,
          followUpAction: '接入 LLM 后我可以直接产出实现。',
        };
      }
      try {
        const content = await deps.complete.complete(
          [
          {
            role: 'user',
            content:
              `根据需求生成代码或实现方案（Markdown，含关键代码与说明）。\n\n` +
              `请先按以下工作流约束执行，不要跳过验证：\n${workflowPromptBlock(input.query)}\n\n` +
              `需求：\n${input.query}`,
          },
          ],
          { temperature: 0.3, maxTokens: 1500 },
        );
        return {
          result: { answer: content.trim() },
          confidence: 0.8,
          followUpAction: '需要继续拆分、补测试或生成文档，随时说。',
        };
      } catch (err) {
        return {
          result: {
            error: err instanceof Error ? err.message : String(err),
            answer: '代码生成失败，可以稍后重试。',
          },
          confidence: 0.2,
        };
      }
    },
  };
}
