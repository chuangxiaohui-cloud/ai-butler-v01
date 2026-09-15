import type { UiMode } from '../agent/mode-mapper.js';

export interface AnswerPostprocessContext {
  query: string;
  userId: string;
  mode?: UiMode;
  sourceSkillName?: string;
}

export interface AnswerPostprocessRule {
  name: string;
  apply(answer: string, context: AnswerPostprocessContext): string | null;
}

export interface AnswerPostprocessResult {
  answer: string;
  appliedSkillNames: string[];
}

/**
 * 最小回答后处理运行时：规则按注册顺序执行；单条失败、空输出或未改动均不污染回答。
 * 规则来源由调用方显式注入，本类不扫描候选或安装目录。
 */
export class AnswerPostprocessRuntime {
  constructor(private readonly rules: readonly AnswerPostprocessRule[]) {}

  apply(answer: string, context: AnswerPostprocessContext): AnswerPostprocessResult {
    let current = answer;
    const appliedSkillNames: string[] = [];
    for (const rule of this.rules) {
      try {
        const next = rule.apply(current, context);
        if (typeof next !== 'string' || !next.trim() || next === current) continue;
        current = next;
        appliedSkillNames.push(rule.name);
      } catch {
        // 单条用户规则失败不得破坏主回答或阻断后续规则。
      }
    }
    return { answer: current, appliedSkillNames };
  }
}
