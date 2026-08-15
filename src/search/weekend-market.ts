/**
 * 周末休市规则：今天是周六/周日时，股票/大盘类问题不再硬搜，直接说明休市。
 */

export function weekendMarketReply(query: string, now: Date = new Date()): string | null {
  if (!/股市|股票|大盘|A股|行情|涨跌/.test(query)) return null;
  const day = now.getDay();
  if (day !== 0 && day !== 6) return null;
  return `今天是周末，A股/港股休市，没有实时行情。需要的话我可以帮您查最近一个交易日的收盘情况，或下一个交易日的关注点。`;
}
