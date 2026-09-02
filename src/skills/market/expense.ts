/**
 * E308：市场 Skill 记账/预算管理（expense-tracker）
 * 解析用户 query → 查预算（query）/ 记一笔支出（record）/ 拨款设预算（allocate）；
 * 复用 BudgetStore（data/budget.db），老板查预算与秘书记账共用同一账本
 * （用户文本只经 E251 input.txt 注入，不进命令行）。
 */

import { budgetDbPath, BudgetStore, type BudgetEvent, type BudgetSummaryRow } from '../../budget/budget-store.js';

export type BudgetAction = 'query' | 'record' | 'allocate' | 'unknown';

export interface BudgetResult {
  ok: boolean;
  action: BudgetAction;
  scope?: string;
  amount?: number;
  note?: string;
  summary?: BudgetSummaryRow[];
  recent?: BudgetEvent[];
  error?: string;
}

const AMOUNT_RE = /(\d+(?:\.\d+)?)\s*(?:元|块|RMB|¥)?/;
/** 记账/支出动作词 */
const SPEND_RE = /记账|记一笔|记个账|花(?:了|销)?|支出|付(?:了|款)?|消费|开销|买(?:了|些)?/;
/** 拨款/设预算动作词 */
const ALLOCATE_RE = /拨款|批(?:了|下)?|设(?:定|置)?\s*预算|预算\s*(?:设|给|为|是)?/;
/** 查询动作词 */
const QUERY_RE = /查.*预算|预算.*(?:查询|剩|余额|多少)|还剩.*预算|余额|花了多少/;

/** 提取 scope：优先「X费/X预算/X款」完整词（保留后缀，保证拨款/查询同名对账），否则金额后短语 */
function extractScope(text: string): string {
  const feeLike = text.match(/([\u4e00-\u9fa5A-Za-z0-9]{1,8}?(?:费|预算|款|支出|经费|开支))/);
  if (feeLike?.[1]) {
    const cleaned = feeLike[1].replace(/^(?:给|为|设|加|元|是)+/, '');
    if (cleaned && cleaned !== '预算' && cleaned !== '元预算' && cleaned !== '支出') return cleaned;
  }
  const afterAmount = text.replace(AMOUNT_RE, ' ').replace(/[，。；,!！？?、]/g, ' ');
  const tail = afterAmount
    .replace(/记账|记(?:一?笔)?账|花(?:了|销)?|支出|付(?:了|款)?|消费|开销|买(?:了)?|用于|帮我|请|一下|元|块|预算|拨款/g, ' ')
    .trim()
    .slice(0, 8);
  return tail || '未分类';
}

/** 解析用户 query：查预算 → query；含金额 + 记账词 → record；含金额 + 拨款词 → allocate */
export function parseBudgetQuery(text: string): Omit<BudgetResult, 'ok' | 'summary' | 'recent'> {
  const trimmed = text.trim();
  const scopeMatch = trimmed.match(/查([\u4e00-\u9fa5A-Za-z0-9]{1,6}?)(?:预算|账|余额)/);
  const scope = scopeMatch?.[1] ?? undefined;
  if (QUERY_RE.test(trimmed)) {
    return { action: 'query', scope };
  }
  const amountMatch = trimmed.match(AMOUNT_RE);
  if (!amountMatch) {
    return { action: 'unknown', error: '未识别到金额，请给出数字，如：记一笔 80 元打样费 / 给打样费设 100 元预算 / 查预算' };
  }
  const amount = Number(amountMatch[1]);
  if (ALLOCATE_RE.test(trimmed)) {
    return { action: 'allocate', scope: extractScope(trimmed), amount, note: trimmed };
  }
  if (SPEND_RE.test(trimmed)) {
    return { action: 'record', scope: extractScope(trimmed), amount, note: trimmed };
  }
  return { action: 'unknown', error: '没看懂是要记账还是设预算，示例：记一笔 80 元打样费 / 给打样费设 100 元预算' };
}

/** 执行预算命令（dbPath 可注入便于测试；缺省仓库 data/budget.db） */
export function runBudgetCommand(text: string, dbPath = budgetDbPath()): BudgetResult {
  const parsed = parseBudgetQuery(text);
  if (parsed.error) {
    return { ok: false, action: parsed.action, error: parsed.error };
  }
  const store = new BudgetStore(dbPath);
  try {
    if (parsed.action === 'query') {
      const summary = parsed.scope
        ? store.summary(parsed.scope)
        : store.summary();
      return { ok: true, action: 'query', scope: parsed.scope, summary, recent: store.recent(5) };
    }
    const kind = parsed.action === 'allocate' ? 'allocate' : 'spend';
    store.add({
      scope: parsed.scope ?? '未分类',
      kind,
      amount: parsed.amount ?? 0,
      note: parsed.note ?? text,
    });
    return {
      ok: true,
      action: parsed.action,
      scope: parsed.scope,
      amount: parsed.amount,
      summary: store.summary(parsed.scope),
    };
  } catch (err) {
    return { ok: false, action: parsed.action, error: err instanceof Error ? err.message : String(err) };
  } finally {
    store.close();
  }
}
