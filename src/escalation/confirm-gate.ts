/**
 * E324：confirm 真阻断第一刀——写类执行器试点清单 + 批准/取消整句识别 + 等待确认文案。
 * 路由 decision=confirm 且执行器命中清单时，pipeline 不再直接执行，改为挂起等待用户
 * 明确批准（聊天回复「执行」/「取消」或裁决面板）；知识问答/搜索类 confirm 语义不变。
 * 试点清单为内置 Skill 的写类执行器（副作用明确、bundled skill 目录存在）；后续风险分级再扩。
 */

import { modelPriceCny } from '../config/model-pricing.js';
import { PARAMS } from '../config/params.js';

export const CONFIRM_WRITE_EXECUTORS = [
  'project_writer', // 写项目文档（文件落盘）
  'content_writer', // 生成/改写文档内容
  'office_daily', // 发送/处理邮件
  'calendar_skill', // 新建/导入日程
  'im_dispatch', // 外发即时消息
  'project_packager', // 打包项目产物
  'pm_xmind', // E340：生成/读取 Xmind 思维导图（读写本地文件）
  'layered_arch', // E364：生成分层架构/框架/模块图（LLM 产分层 JSON + 写本地产物）
  'archify', // E352：生成系统/流程/时序/数据流/生命周期交互图（LLM 产 IR + 写本地产物）
  'mcp_agent', // E408：仅画像已就绪的 MCP 构建进入批准门；只读盘点不挂起
] as const;

export type ConfirmWriteExecutor = (typeof CONFIRM_WRITE_EXECUTORS)[number];

/** E334：风险分级（挂起文案提示用；按副作用外发性与可逆性） */
export type ConfirmRiskGrade = 'low' | 'medium' | 'high';

/**
 * E334：执行器成本类别——local = 批准后本地确定性执行（无外部模型调用，预估 ¥0）；
 * content_generation = 批准后经 LLM 生成内容（按 E317 单价估算上界金额）。
 */
export type ConfirmCostKind = 'local' | 'content_generation';

interface ConfirmExecutorProfile {
  /** 面向用户的中文动作描述（「会落盘/外发」括号里引用） */
  label: string;
  /** 风险分级 */
  risk: ConfirmRiskGrade;
  /** 成本类别（决定「本次操作预估成本」口径） */
  costKind: ConfirmCostKind;
}

const EXECUTOR_PROFILE: Record<string, ConfirmExecutorProfile> = {
  project_writer: { label: '写项目文档（文件落盘）', risk: 'medium', costKind: 'local' },
  content_writer: { label: '生成/改写文档内容', risk: 'medium', costKind: 'content_generation' },
  office_daily: { label: '发送/处理邮件', risk: 'high', costKind: 'content_generation' },
  calendar_skill: { label: '新建/导入日程', risk: 'low', costKind: 'local' },
  im_dispatch: { label: '外发即时消息', risk: 'high', costKind: 'local' },
  project_packager: { label: '打包项目产物', risk: 'medium', costKind: 'local' },
  pm_xmind: { label: '处理 Xmind 思维导图（读写本地文件）', risk: 'low', costKind: 'local' },
  layered_arch: { label: '生成分层架构图（LLM 整理后写入本地产物）', risk: 'low', costKind: 'content_generation' },
  archify: { label: '生成系统架构图（LLM 整理后写入本地产物）', risk: 'low', costKind: 'content_generation' },
  mcp_agent: { label: '执行已取证的本地工程构建', risk: 'medium', costKind: 'local' },
};

export function isConfirmWriteExecutor(executor?: string): boolean {
  return (
    executor !== undefined && (CONFIRM_WRITE_EXECUTORS as readonly string[]).includes(executor)
  );
}

/** 面向用户的中文动作描述，用于等待确认文案 */
export function executorActionLabel(executor?: string): string {
  return executor ? (EXECUTOR_PROFILE[executor]?.label ?? `${executor} 写操作`) : '写操作';
}

const RISK_LABEL: Record<ConfirmRiskGrade, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

/** E334：执行器风险分级（未登记/未知执行器按「中」保守提示） */
export function executorRiskGrade(executor?: string): ConfirmRiskGrade {
  return executor ? (EXECUTOR_PROFILE[executor]?.risk ?? 'medium') : 'medium';
}

/**
 * E334：本次操作预估成本（¥，上界口径）——批准后执行将发生的外部调用费用：
 * local → ¥0（本地确定性执行）；content_generation → 默认内容模型 deepseek-v4-flash 单价（E317 表），
 * 输入按缓存未命中价 + 输出按高峰价（执行时段未定取最贵档），token 上界读 [P-149]/[P-150]，分向上取整展示。
 */
export function estimateConfirmCostYuan(executor?: string): number {
  const kind = executor ? (EXECUTOR_PROFILE[executor]?.costKind ?? 'local') : 'local';
  if (kind !== 'content_generation') return 0;
  const price = modelPriceCny('deepseek-v4-flash');
  if (!price) return 0; // 单价未登记不计价（诚实兜底）
  const raw =
    (PARAMS.confirmContentGenInputTokens * price.inputCacheMissPerMTok +
      PARAMS.confirmContentGenOutputTokens * price.outputPerMTok) /
    1_000_000;
  return Math.ceil(raw * 100) / 100;
}

/**
 * E326：把用户原句的人称从第一人称转第二人称（AI 复述确认文案用）——
 * 用户说「帮我…我家里…」时，AI 复述应为「帮你…你家里…」，避免“你让我帮我家里…”人称错乱。
 * 仅用于展示复述，不改变 resume 恢复执行的原始 query。
 */
export function restateForUser(query: string): string {
  return query.replace(/我/g, '你').trim();
}

const APPROVAL_WORDS = new Set([
  '执行',
  '批准',
  '同意',
  '确认',
  '继续',
  '可以',
  '好',
  '好的',
  '行',
  '嗯',
  '没问题',
  '就这么办',
  '就这么定',
  '来',
  'ok',
  'okay',
  'yes',
]);

const REJECTION_WORDS = new Set([
  '取消',
  '否决',
  '不执行',
  '别执行',
  '别',
  '不要',
  '不做',
  '不做了',
  '放弃',
  '算了',
  '停',
  '撤回',
  'no',
]);

/** 尾部语气词/标点：整句后允许口语化（「执行吧 / 可以！ / 取消。」），剥掉后再比对基准词 */
const REPLY_TRAILING_MODAL = /[吧呀嘛呢哦呗了]+$/u;
const REPLY_TRAILING_PUNCT = /[。！？!?…~.,，、;；:：\s]+$/u;

/** 返回候选：原词（剥标点）→ 再剥尾部语气词 → 小写变体，任一命中即判定 */
function replyCandidates(text: string): string[] {
  const trimmed = text.trim().replace(REPLY_TRAILING_PUNCT, '');
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const candidates = [lower];
  const stripped = trimmed.replace(REPLY_TRAILING_MODAL, '').toLowerCase();
  if (stripped && stripped !== lower) candidates.push(stripped);
  return candidates;
}

/**
 * E324：整句识别用户对挂起动作的批准/取消回复；仅当调用方确认该会话存在带 resume 的
 * open pending 时才应使用本函数（纯函数，不读会话状态）。不命中返回 null。
 */
export function parseApprovalReply(text: string): 'approve' | 'reject' | null {
  if (!text) return null;
  for (const candidate of replyCandidates(text)) {
    if (APPROVAL_WORDS.has(candidate)) return 'approve';
    if (REJECTION_WORDS.has(candidate)) return 'reject';
  }
  return null;
}

/** 挂起时回复用户的等待确认文案（不执行） */
export function buildConfirmHoldAnswer(executor: string, query: string): string {
  const restated = restateForUser(query);
  const brief = restated.length > 80 ? `${restated.slice(0, 80)}…` : restated;
  const riskLabel = RISK_LABEL[executorRiskGrade(executor)];
  const yuan = estimateConfirmCostYuan(executor);
  const costText =
    yuan <= 0
      ? '¥0.00（本地确定性执行，无外部模型调用）'
      : `≤ ¥${yuan.toFixed(2)}（单次内容生成上界，按 /cost 单价估算）`;
  const projectWriterTarget = query.match(
    /(?:写入|保存到|写到|文件路径|目标路径|路径)[：: ]?\s*([^\s，。；,!！]+)/,
  )?.[1];
  const changeList =
    executor === 'project_writer'
      ? `\n变更清单：\n- 创建或修改文件：${projectWriterTarget ?? '待执行时解析'}\n- 将运行的命令：无`
      : '';
  return (
    `⏸ 你让我“${brief}”。这属于「${executorActionLabel(executor)}」这类会落盘/外发的写操作，` +
    '我不会擅自执行。\n' +
    `风险等级：${riskLabel} ｜ 本次操作预估成本：${costText}${changeList}\n` +
    '回复「执行」继续，回复「取消」放弃；也可以到右侧「裁决」页批准/否决。'
  );
}
