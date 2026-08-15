/**
 * 魔鬼训练 v2.5 评分工作表渲染（v0.1/v0.2a 同款格式）。
 * 每题一个区块：query / confidence / 预期行为 / 证据来源 / 完整回答 / 空评分位。
 */

interface DevilEvidence {
  title: string;
  url: string;
  domain: string;
  score: number;
  type: string;
}

export interface DevilWorksheetEntry {
  row: {
    id: string;
    volume: string;
    query: string;
    expected: string;
    focus: string;
  };
  result?: {
    answer: string;
    confidence: number;
    gate_triggered: string;
    evidence: DevilEvidence[];
  };
  error?: string;
  autoScore?: number;
}

export function renderWorksheetV01(
  entries: DevilWorksheetEntry[],
  scoresById: Map<string, { score: number; initialScore?: number }>,
): string {
  const sections = entries
    .map((e) => {
      const r = e.result;
      const score = scoresById.get(e.row.id);
      const scoreLine =
        score === undefined
          ? '- 相关性(0-3)：____'
          : score.initialScore === undefined
            ? `- 相关性(0-3)：${score.score}`
            : `- 相关性(0-3)：${score.score}（初判：${score.initialScore}）`;
      const evidenceLines = r && r.evidence.length > 0
        ? r.evidence
            .map(
              (ev) =>
                `  - ${ev.type} | ${ev.domain} | ${ev.title} | ${ev.score.toFixed(2)} | ${ev.url}`,
            )
            .join('\n')
        : '  - 无搜索结果证据';
      const answer = r
        ? r.answer
        : e.error
          ? `（无回答：${e.error}）`
          : '（无回答）';
      return `## ${e.row.id}（${e.row.volume}）\n\n` +
        `- query：${e.row.query}\n` +
        `- confidence：${r ? r.confidence.toFixed(2) : '-'} | gate：${r ? r.gate_triggered : '-'} | evidence：${r ? r.evidence.length : 0}\n` +
        `- 预期行为：${e.row.expected}\n` +
        `- 考察点：${e.row.focus}\n` +
        `- 证据来源：\n${evidenceLines}\n` +
        `${scoreLine}\n\n` +
        `${answer}\n`;
    })
    .join('\n---\n\n');

  return `# 魔鬼训练 v2.5 评分工作表（整理版）

> C.2 标尺：0=完全无用 / 1=部分可用 / 2=可用但有缺 / 3=完全满足；相关性=是否切题，并对照“预期行为”判定。
> 判定基准：bench/devil-v25/scores.json（人工打分）；证据来源仅作辅助参考，不参与判定。
> 122 条中建议 ≥60% 相关性 ≥2 分，且无 0 分硬答；评完请将分数填入 bench/devil-v25/scores.json。

${sections}
`;
}
