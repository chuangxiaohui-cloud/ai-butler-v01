/**
 * E313：市场 Skill 主动预判（proactive-assistant）
 * §2.5 行为指标「有眼力见儿」：命中规则后在回复末尾附加"建议"，仅建议、不自动执行（§2.3 人类裁决）。
 * 规则（纯函数，无 IO）：日期+地点→查航班/酒店；报销→报销单模板；开会→日历事件+议程；连续工作≥2h→提醒休息。
 */

export interface ProactiveSuggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  /** 建议动作（等用户确认，不自动执行） */
  suggestedAction: string;
}

const DATE_RE = /(?:下|本|这)?周[一二三四五六日天]|明天|后天|下周|下个月|月底|月初|过两天|最近/;
const TRAVEL_VERB_RE = /(?:去|到|前往|飞往|出差|拜访|跑一趟)\s*([\u4e00-\u9fa5]{2,4}(?:市)?)/;
const CITY_RE = /深圳|北京|上海|广州|杭州|成都|武汉|南京|东莞|苏州|无锡|佛山|珠海|长沙|重庆|西安|合肥|青岛|宁波|厦门|天津|郑州|济南/;
const WORK_RE = /连续(?:工作|干活|写代码|coding|开发)\s*(\d+)\s*(?:小时|h)/;

/** 检测「日期 + 地点」出行意图（如「下周三要去深圳见供应商」） */
export function detectTravelIntent(text: string): boolean {
  if (!DATE_RE.test(text)) return false;
  if (TRAVEL_VERB_RE.test(text) && CITY_RE.test(text)) return true;
  return CITY_RE.test(text) && /出差|供应商|拜访|现场|开会|客户/.test(text);
}

/** 规则引擎：命中即返回对应建议（可能多条）；无命中返回空数组 */
export function proactiveSuggestions(
  text: string,
  opts: { workedMinutes?: number } = {},
): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];
  if (detectTravelIntent(text)) {
    suggestions.push({
      id: 'travel',
      priority: 'high',
      title: '差旅安排',
      detail: '检测到日期 + 地点，可能有出行计划。',
      suggestedAction: '要不要我帮你查航班/高铁和酒店？',
    });
  }
  if (/报销|贴票|报账|发票/.test(text)) {
    suggestions.push({
      id: 'reimbursement',
      priority: 'medium',
      title: '报销单',
      detail: '提到报销/发票，可能要走报销流程。',
      suggestedAction: '要不要我帮你生成报销单模板？',
    });
  }
  if (/开会|会议|评审|例会|站会|碰头|周会/.test(text)) {
    suggestions.push({
      id: 'meeting',
      priority: 'medium',
      title: '会议安排',
      detail: '提到开会/会议，可能有日程要排。',
      suggestedAction: '要不要我创建日历事件 + 准备议程？',
    });
  }
  const workedMinutes =
    opts.workedMinutes ?? (WORK_RE.exec(text) ? Number(WORK_RE.exec(text)?.[1]) * 60 : 0);
  if (workedMinutes >= 120) {
    suggestions.push({
      id: 'rest',
      priority: 'low',
      title: '注意休息',
      detail: '连续工作已超过 2 小时。',
      suggestedAction: '要不要休息一下？',
    });
  }
  return suggestions;
}

/** 把建议格式化为回复末尾追加文本（无命中返回空串） */
export function formatProactiveSuggestions(suggestions: ProactiveSuggestion[]): string {
  if (suggestions.length === 0) return '';
  const lines = ['💡 主动建议（§2.5 有眼力见儿，仅建议、不自动执行，需要就说一声）：'];
  for (const suggestion of suggestions) {
    lines.push(`- ${suggestion.title}：${suggestion.detail} ${suggestion.suggestedAction}`);
  }
  return lines.join('\n');
}
