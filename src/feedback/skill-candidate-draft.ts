import type { CorrectionPatternKey, SkillCandidateEntry } from './skill-candidate-store.js';

export interface SkillCandidateDraft {
  candidateId: string;
  name: string;
  version: '0.1.0';
  description: string;
  triggers: string[];
  permissions: ['none'];
  scope: 'answer_postprocess';
  instructions: string[];
  evidence: {
    sampleCount: number;
    latestSample: string;
  };
  skillMarkdown: string;
  installable: boolean;
  installBlocker: string | null;
}

const INSTRUCTIONS: Record<CorrectionPatternKey, string[]> = {
  conclusion_first: ['回复开头先给结论或明确建议。', '必要说明放在结论之后。'],
  structured_steps: ['把执行建议整理为有序步骤。', '每个步骤只表达一个主要动作。'],
  concise_style: ['减少背景铺垫。', '只保留回答问题所需的关键结论。'],
  source_backed: ['关键事实附上来源或证据。', '无法提供依据时明确说明不确定性。'],
  risk_first: ['在执行建议前列出关键风险或确认项。', '风险说明保持简短且可操作。'],
  technical_precision: ['工程回答优先核对具体器件、接口和参数。', '不确定的技术数值不得猜测。'],
};

function renderMarkdown(entry: SkillCandidateEntry, draft: Omit<SkillCandidateDraft, 'skillMarkdown'>): string {
  const rules = draft.instructions.map((instruction) => `- ${instruction}`).join('\n');
  const sample = entry.latestSample.replace(/^/gm, '> ');
  return `# ${entry.title}\n\n## 适用范围\n\n回答后处理（answer_postprocess）\n\n## 回复规则\n\n${rules}\n\n## 候选证据\n\n- 样本数：${entry.sampleCount}\n- 最近修订：\n\n${sample}\n`;
}

/** 只构造内存预览；不写文件、不注册或安装 Skill。 */
export function buildSkillCandidateDraft(entry: SkillCandidateEntry): SkillCandidateDraft {
  if (entry.status !== 'accepted') throw new Error('仅 accepted 候选可生成草案');
  const draft: Omit<SkillCandidateDraft, 'skillMarkdown'> = {
    candidateId: entry.id,
    name: `reply-${entry.pattern.replace(/_/g, '-')}`,
    version: '0.1.0',
    description: entry.description,
    triggers: [entry.title],
    permissions: ['none'],
    scope: 'answer_postprocess',
    instructions: [...INSTRUCTIONS[entry.pattern]],
    evidence: {
      sampleCount: entry.sampleCount,
      latestSample: entry.latestSample,
    },
    installable: entry.pattern === 'conclusion_first',
    installBlocker:
      entry.pattern === 'conclusion_first'
        ? null
        : '当前运行时尚未支持该回复规则的确定性执行；不可启用。',
  };
  return { ...draft, skillMarkdown: renderMarkdown(entry, draft) };
}
