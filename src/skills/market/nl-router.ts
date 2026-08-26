/**
 * E243 收口：市场 Skill 自然语言路由（§8.2.3）
 * 命中已安装 Skill 的 triggers 触发词 → 直连执行（进 pipeline），绕开搜索；
 * 最长触发词优先；安全/专用意图由 pipeline 在调用前短路排除。
 */

export interface InstalledSkillWithTriggers {
  name: string;
  triggers: string[];
}

export interface MarketSkillTriggerHit {
  skillName: string;
  triggerLength: number;
}

/** 最长触发词优先的纯函数匹配（无 IO，便于单测） */
export function matchInstalledSkillTrigger(
  query: string,
  installed: ReadonlyArray<InstalledSkillWithTriggers>,
  minTriggerLength = 2,
): MarketSkillTriggerHit | null {
  const lower = query.toLowerCase();
  let best: MarketSkillTriggerHit | null = null;
  for (const skill of installed) {
    for (const trigger of skill.triggers) {
      const normalized = trigger.trim().toLowerCase();
      if (normalized.length < minTriggerLength) continue;
      if (!lower.includes(normalized)) continue;
      if (!best || normalized.length > best.triggerLength) {
        best = { skillName: skill.name, triggerLength: normalized.length };
      }
    }
  }
  return best;
}

/** 把 MarketRunOutcome 渲染为可读答案（有界截断，无文本输出时给摘要兜底） */
export function renderMarketSkillAnswer(outcome: {
  name: string;
  version: string;
  results: Array<{ ok: boolean; step: string; stdout: string; stderr: string }>;
}): string {
  const parts: string[] = [];
  for (const result of outcome.results) {
    if (result.stdout && result.stdout.trim()) {
      parts.push(result.stdout.trim());
    } else if (!result.ok && result.stderr && result.stderr.trim()) {
      parts.push(`⚠️ 步骤「${result.step}」：${result.stderr.trim().slice(0, 200)}`);
    }
  }
  const joined = parts.join('\n\n').slice(0, 4000);
  return (
    joined ||
    `✅ 市场 Skill「${outcome.name} v${outcome.version}」执行完成（${outcome.results.length} 步，无文本输出）。`
  );
}