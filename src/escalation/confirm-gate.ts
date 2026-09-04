/**
 * E324：confirm 真阻断第一刀——写类执行器试点清单 + 批准/取消整句识别 + 等待确认文案。
 * 路由 decision=confirm 且执行器命中清单时，pipeline 不再直接执行，改为挂起等待用户
 * 明确批准（聊天回复「执行」/「取消」或裁决面板）；知识问答/搜索类 confirm 语义不变。
 * 试点清单为内置 Skill 的写类执行器（副作用明确、bundled skill 目录存在）；后续风险分级再扩。
 */

export const CONFIRM_WRITE_EXECUTORS = [
  'project_writer', // 写项目文档（文件落盘）
  'content_writer', // 生成/改写文档内容
  'office_daily', // 发送/处理邮件
  'calendar_skill', // 新建/导入日程
  'im_dispatch', // 外发即时消息
  'project_packager', // 打包项目产物
] as const;

export type ConfirmWriteExecutor = (typeof CONFIRM_WRITE_EXECUTORS)[number];

const EXECUTOR_ACTION_LABEL: Record<string, string> = {
  project_writer: '写项目文档（文件落盘）',
  content_writer: '生成/改写文档内容',
  office_daily: '发送/处理邮件',
  calendar_skill: '新建/导入日程',
  im_dispatch: '外发即时消息',
  project_packager: '打包项目产物',
};

export function isConfirmWriteExecutor(executor?: string): boolean {
  return (
    executor !== undefined && (CONFIRM_WRITE_EXECUTORS as readonly string[]).includes(executor)
  );
}

/** 面向用户的中文动作描述，用于等待确认文案 */
export function executorActionLabel(executor?: string): string {
  return executor ? (EXECUTOR_ACTION_LABEL[executor] ?? `${executor} 写操作`) : '写操作';
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
  return (
    `⏸ 你让我“${brief}”。这属于「${executorActionLabel(executor)}」这类会落盘/外发的写操作，` +
    '我不会擅自执行。\n' +
    '回复「执行」继续，回复「取消」放弃；也可以到右侧「裁决」页批准/否决。'
  );
}
