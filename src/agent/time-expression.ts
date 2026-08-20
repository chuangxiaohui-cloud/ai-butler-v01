/**
 * 共享时间表达解析：今天/明天/后天 + 周X/下周X/星期X + 上下午 + 时/分 → ISO 时间。
 * E165：每周提醒与日历需要“周X”首次触发时间。
 */

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
