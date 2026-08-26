/**
 * 成熟度五维指标计算（§12.4 判据，[P-25] 轻量自检）
 * 纯函数：输入可注入的数据源快照，输出五维指标与 L0-L3 判定，不读 IO。
 * 口径注记：
 * - 用户累积 Skill = 市场安装 Skill（预置不计数，§12.4 不自我夸大）
 * - 验收通过率 = accept / (accept + reject + correct)；n≥30 才做正式判定（对齐 E1 n=60 先例下限）
 * - 复用率 = 用户驱动 Skill 派发（direct + market_trigger）/ 回答事件；injected（上下文注入）不计入（E249 校准口径）
 * - 证据链完整度由审查报告抽样输入（未抽样时输出 null，不预设结论）
 */

export interface MaturitySkillStat {
  name: string;
  usageCount: number;
  thumbsDownCount: number;
}

export interface MaturityFeedbackSample {
  source?: string;
  feedback?: string | null;
}

export interface MaturityReuseObs {
  skillEvents: number;
  answerEvents: number;
}

export interface MaturityReuseObs {
  skillEvents: number;
  answerEvents: number;
}

/** E249 校准口径：复用率只计用户驱动派发（direct/market_trigger），injected 上下文注入不计入 */
export function countReuseEvents(
  events: Array<{ type?: string; skill?: { kind?: string } }>,
): MaturityReuseObs {
  let skillEvents = 0;
  let answerEvents = 0;
  for (const event of events) {
    if (event.type === 'answer') {
      answerEvents += 1;
    } else if (
      event.type === 'skill' &&
      (event.skill?.kind === 'direct' || event.skill?.kind === 'market_trigger')
    ) {
      skillEvents += 1;
    }
  }
  return { skillEvents, answerEvents };
}

export interface MaturityEvidenceSample {
  total: number;
  withEvidence: number;
}

export interface MaturityInputs {
  presetSkills: string[];
  skillStats: MaturitySkillStat[];
  installedMarketSkills: string[];
  feedbackSamples: MaturityFeedbackSample[];
  reuse: MaturityReuseObs;
  evidenceSample?: MaturityEvidenceSample;
}

export interface MaturityMetrics {
  skillCoverage: {
    presetTotal: number;
    presetUsed: number;
    userAccumulated: number;
  };
  acceptance: {
    accept: number;
    reject: number;
    correct: number;
    total: number;
    rate: number | null;
  };
  reuse: {
    skillEvents: number;
    answerEvents: number;
    rate: number | null;
  };
  evidenceChain: {
    total: number;
    withEvidence: number;
    rate: number | null;
  } | null;
  feedbackSignals: { total: number };
  level: 'L0' | 'L1' | 'L2' | 'L3';
  gaps: string[];
}

export function computeMaturityMetrics(input: MaturityInputs): MaturityMetrics {
  const presetSet = new Set(input.presetSkills);
  const presetUsed = input.skillStats.filter(
    (stat) => presetSet.has(stat.name) && stat.usageCount > 0,
  ).length;
  const userAccumulated = input.installedMarketSkills.length;

  let accept = 0;
  let reject = 0;
  let correct = 0;
  for (const sample of input.feedbackSamples) {
    if (sample.feedback === 'accept') accept += 1;
    else if (sample.feedback === 'reject') reject += 1;
    else if (sample.feedback === 'correct') correct += 1;
  }
  const feedbackTotal = accept + reject + correct;
  const acceptanceRate = feedbackTotal > 0 ? accept / feedbackTotal : null;

  const reuseRate =
    input.reuse.answerEvents > 0 ? input.reuse.skillEvents / input.reuse.answerEvents : null;

  const evidenceChain: MaturityMetrics['evidenceChain'] = input.evidenceSample
    ? {
        total: input.evidenceSample.total,
        withEvidence: input.evidenceSample.withEvidence,
        rate:
          input.evidenceSample.total > 0
            ? input.evidenceSample.withEvidence / input.evidenceSample.total
            : null,
      }
    : null;

  const gaps: string[] = [];
  if (userAccumulated < 50) {
    gaps.push(`用户累积 Skill ${userAccumulated}/50+（当前市场安装 ${userAccumulated} 个）`);
  }
  if (acceptanceRate === null || acceptanceRate < 0.8) {
    gaps.push(
      `验收通过率 ${
        acceptanceRate === null ? '无样本' : `${(acceptanceRate * 100).toFixed(0)}%`
      }/80%+（样本 n=${feedbackTotal}，正式判定需 n≥30）`,
    );
  } else if (feedbackTotal < 30) {
    gaps.push(`验收样本不足：n=${feedbackTotal}<30（通过率已达 80%，待样本达标）`);
  }
  if (reuseRate === null || reuseRate < 0.6) {
    gaps.push(
      `复用率 ${
        reuseRate === null ? '未观测' : `${(reuseRate * 100).toFixed(1)}%`
      }/60%+（观察口径：直连 Skill 派发/回答事件）`,
    );
  }
  if (reuseRate !== null && reuseRate < 0.3) {
    gaps.push(`复用率观察值低于 L1 判据 30%（口径：direct+market_trigger 派发/回答事件，injected 不计入）`);
  }
  if (evidenceChain && evidenceChain.rate !== null && evidenceChain.rate < 0.5) {
    gaps.push(`证据链完整度 ${(evidenceChain.rate * 100).toFixed(0)}%<50%（抽样审查）`);
  }

  const l2Base =
    userAccumulated >= 50 &&
    acceptanceRate !== null &&
    acceptanceRate >= 0.8 &&
    reuseRate !== null &&
    reuseRate >= 0.6;
  let level: MaturityMetrics['level'];
  if (
    l2Base &&
    acceptanceRate !== null &&
    acceptanceRate >= 0.9 &&
    reuseRate !== null &&
    reuseRate >= 0.8
  ) {
    level = 'L3';
  } else if (l2Base) {
    level = 'L2';
  } else if (input.presetSkills.length > 0) {
    level = 'L1';
  } else {
    level = 'L0';
  }

  return {
    skillCoverage: {
      presetTotal: input.presetSkills.length,
      presetUsed,
      userAccumulated,
    },
    acceptance: { accept, reject, correct, total: feedbackTotal, rate: acceptanceRate },
    reuse: {
      skillEvents: input.reuse.skillEvents,
      answerEvents: input.reuse.answerEvents,
      rate: reuseRate,
    },
    evidenceChain,
    feedbackSignals: { total: feedbackTotal },
    level,
    gaps,
  };
}