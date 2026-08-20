/**
 * 共享时间表达解析：今天/明天/后天 + 周X/下周X/星期X + 上下午 + 时/分 → ISO 时间。
 * E165：每周提醒与日历需要“周X”首次触发时间。
 * E166：重复周期（每天/每周）识别与“周期+纯时间”兜底，供提醒与日程共用。
 */

import { extractTimeExpression } from './intent-feature.js';

const HOUR_MAP: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  十一: 11, 十二: 12,
};

// JS getDay()：0=周日，1=周一 … 6=周六
const WEEKDAY_MAP: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };

export function parseTimeExpression(expression: string): { startAt: string; label: string } {
  const now = new Date();
  const date = new Date(now);
  const weekday = expression.match(/(?:周|星期)([一二三四五六日天])/);
  const isNextWeek = /下周/.test(expression);
  if (weekday) {
    // E165：周X 取本周最近匹配日（含今天），已过则下周同日；下周X 固定到下一周
    const target = WEEKDAY_MAP[weekday[1]] ?? 0;
    const today = now.getDay();
    let diff = target - today;
    if (diff < 0) diff += 7;
    if (isNextWeek) diff += 7;
    date.setDate(date.getDate() + diff);
  } else if (/后天/.test(expression)) {
    date.setDate(date.getDate() + 2);
  } else if (/明天/.test(expression)) {
    date.setDate(date.getDate() + 1);
  } else if (/今天/.test(expression) || isNextWeek) {
    // 今天 / “下周”未带具体星期（默认下周同日）
    if (isNextWeek) date.setDate(date.getDate() + 7);
  }

  let hour = 9;
  const digit = expression.match(/(\d{1,2})\s*[点时:：]/);
  const chinese = expression.match(/([一二三四五六七八九十]{1,2})点/);
  if (digit) hour = Number(digit[1]);
  else if (chinese) hour = HOUR_MAP[chinese[1]] ?? 9;
  if (/下午|晚上/.test(expression) && hour < 12) hour += 12;
  const minute =
    expression.match(/(?:[点时:：])(\d{1,2})(?:分)?/)?.[1] ??
    expression.match(/(\d{1,2})\s*分/)?.[1] ??
    '0';
  date.setHours(hour, Number(minute), 0, 0);
  return { startAt: date.toISOString(), label: expression };
}

export type RepeatKind = '' | 'daily' | 'weekly';

/** E166：重复周期识别（每天/每日/天天→daily，每周/每星期→weekly），供提醒与日程共用 */
export function detectRepeat(query: string): RepeatKind {
  if (/每天|每日|天天/.test(query)) return 'daily';
  if (/每周|每星期/.test(query)) return 'weekly';
  return '';
}

/** E166：提取时间表达；重复周期 + 纯时间（如“每天早上9点”）时兜底组装 */
export function extractTimeExpressionOrBare(
  query: string,
  repeat: RepeatKind,
): string | undefined {
  return (
    extractTimeExpression(query) ??
    (repeat
      ? query.match(/(?:早上|上午|中午|下午|晚上|傍晚)?\s*(\d{1,2}\s*[点时:：]\s*\d{0,2}|[一二三四五六七八九十]{1,2}\s*点)/)?.[0]
      : undefined)
  );
}

/** E166：整合周期/时间/复杂周期判定，与 office-daily 的 E165 逻辑保持一致 */
export function parseRepeatQuery(query: string): {
  repeat: RepeatKind;
  timeExpression?: string;
  complexPeriod?: string;
} {
  const repeat = detectRepeat(query);
  const timeExpression = extractTimeExpressionOrBare(query, repeat);
  // 复杂周期只在与提醒时间同段（其前面）时判定，避免“每月报告”等内容词误伤
  const complex = query.match(/工作日|每周末|每月|周[一二三四五六日天]到周/);
  let complexPeriod: string | undefined;
  if (complex) {
    const timeIdx = timeExpression ? query.indexOf(timeExpression) : -1;
    const isRange = /周[一二三四五六日天]到周/.test(query);
    if (timeIdx === -1 || (isRange ? complex.index! <= timeIdx : complex.index! < timeIdx)) {
      complexPeriod = complex[0];
    }
  }
  return { repeat, timeExpression, complexPeriod };
}
