/**
 * 答案覆盖度检测（P-ZZZ' 信号 B，通用问答管道修复）
 *
 * 不绑定任何领域：把 query 解析为 predicate 类型（数值/时序/操作/观点），
 * 再用对应的「证据形态」检测 evidence 是否可能覆盖 query 核心谓词。
 * 若证据形态缺失 → 合成前注入「诚实边界」约束，并作为 bench 覆盖度指标输入。
 * 全部使用跨领域疑问词/形态 pattern，禁止领域关键词/域名/实体。
 */

export type PredicateKind = 'numeric' | 'temporal' | 'procedural' | 'opinion' | 'other';

const NUMERIC_RE = /多少|几[家个条款份]|排名|排行|第几|最高|最大|最贵|最便宜|最多|最少|最快|最慢|哪个|哪些|谁|领先|靠前|靠后/;
const TEMPORAL_RE = /何时|什么时候|哪一年|哪一天|最新|现在|当前|今天|进展|更新|未来|历史|过去|多久/;
const PROCEDURAL_RE = /如何|怎么|怎样|步骤|配置|安装|设置|操作|流程|方法|办法|部署|实现|编写|搭建/;
const OPINION_RE = /评价|看法|观点|觉得|怎么样|争议|优缺点|口碑|推荐(?:吗)?/;

/** 从 query 推导 predicate 类型（规则式，纯跨领域疑问词） */
export function classifyPredicate(query: string): PredicateKind {
  if (NUMERIC_RE.test(query)) return 'numeric';
  if (TEMPORAL_RE.test(query)) return 'temporal';
  // 观点词优先于「如何/怎么」：含评价/看法/优缺点等词时即使带“如何”也按观点处理
  if (OPINION_RE.test(query)) return 'opinion';
  if (PROCEDURAL_RE.test(query)) return 'procedural';
  return 'other';
}

export interface ReadinessResult {
  kind: PredicateKind;
  /** evidence 形态是否可能覆盖 predicate（other 恒为 true，不 gate） */
  ready: boolean;
  /** 缺失形态的中文描述（合成诚实边界用） */
  gap?: string;
}

/** 数值/日期/步骤/引述 形态检测（与信号 A 同源，独立实现避免耦合） */
function hasNumber(text: string): boolean {
  return /\d/.test(text);
}

function hasDate(text: string): boolean {
  return (
    /(?:19|20)\d{2}[-/年.]\d{1,2}/.test(text) ||
    /\d{1,2}月\d{1,2}日/.test(text) ||
    /(?:19|20)\d{6}/.test(text)
  );
}

function hasSteps(text: string): boolean {
  return /第[一二三四五六七八九十百\d]+[步环阶段]/.test(text) || /(?:^|\n)\s*\d+[\.、)．]/.test(text);
}

function hasAttribution(text: string): boolean {
  return /认为|表示|指出|称|透露|预计|宣称|宣布|强调|解释/.test(text);
}

/**
 * 检查 evidence（标题+摘要拼接）是否包含与 predicate 类型匹配的形态。
 * 不检查语义正确性——只做「证据可能包含答案」的轻量先验，避免合成时无米下锅。
 */
export function checkEvidenceReadiness(query: string, evidenceTexts: string[]): ReadinessResult {
  const kind = classifyPredicate(query);
  if (kind === 'other') return { kind, ready: true };
  const blob = evidenceTexts.join('\n');
  switch (kind) {
    case 'numeric':
      return hasNumber(blob)
        ? { kind, ready: true }
        : { kind, ready: false, gap: '具体数值/数量信息' };
    case 'temporal':
      return hasDate(blob)
        ? { kind, ready: true }
        : { kind, ready: false, gap: '时间信息（日期/时点）' };
    case 'procedural':
      return hasSteps(blob)
        ? { kind, ready: true }
        : { kind, ready: false, gap: '操作步骤/流程信息' };
    case 'opinion':
      return hasAttribution(blob)
        ? { kind, ready: true }
        : { kind, ready: false, gap: '观点/评价类表述' };
    default:
      return { kind, ready: true };
  }
}
