/**
 * E314：市场 Skill 通知枢纽（notification-hub）
 * §11.3 秘书日报 / §4.1 三栏交互右栏通知区：聚合五个角色输出事件，按优先级分组生成每日摘要。
 * 🔴 紧急：老板风险裁决请求、项目经理阻塞报告；🟡 普通：产品经理 PRD 完成、架构师选型建议；🟢 低：日常进度更新。
 * 纯函数（无 IO）：优先级分类 / 摘要渲染 / 输入解析，均可单测。
 */

export interface HubEvent {
  id?: string;
  /** 产出事件的角色：老板/产品经理/项目经理/系统架构师/秘书 */
  role: string;
  /** 事件类型：risk_decision/blocking_report/prd_done/tech_selection/progress 等 */
  kind: string;
  title: string;
  detail?: string;
  ts?: string;
}

export type HubPriority = 'urgent' | 'normal' | 'low';

const URGENT_RE = /风险|裁决|审批|阻塞|卡住|故障|紧急|escalat|blocking|risk/i;
const NORMAL_RE = /完成|prd|选型|建议|评审|notice|approve|review|low_confidence|低置信|user_story|用户故事|contract|接口契约/i;

/** 按事件内容分优先级：紧急（裁决/阻塞）→ 普通（完成/建议）→ 低（日常） */
export function classifyEventPriority(event: HubEvent): HubPriority {
  // 紧急以全文兜底（阻塞/风险可能出现在标题或详情）；普通只看 kind/title，
  // 避免 detail 里的「完成」把日常进度误升级。
  const urgentText = `${event.role} ${event.kind} ${event.title} ${event.detail ?? ''}`;
  const normalText = `${event.kind} ${event.title}`;
  if (URGENT_RE.test(urgentText)) return 'urgent';
  if (NORMAL_RE.test(normalText)) return 'normal';
  return 'low';
}

/** 今日日期（YYYY年M月D日） */
function todayLabel(now = new Date()): string {
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

/** 渲染每日通知摘要（§11.3 秘书日报）：按优先级分组 Markdown */
export function renderNotificationDigest(events: HubEvent[], dateLabel = todayLabel()): string {
  const groups: Record<HubPriority, HubEvent[]> = { urgent: [], normal: [], low: [] };
  for (const event of events) {
    groups[classifyEventPriority(event)].push(event);
  }
  const lines = [`# 通知汇总（${dateLabel}）`, ''];
  const order: Array<[HubPriority, string]> = [
    ['urgent', '🔴 紧急'],
    ['normal', '🟡 普通'],
    ['low', '🟢 低'],
  ];
  let hasAny = false;
  for (const [priority, label] of order) {
    const group = groups[priority];
    if (group.length === 0) continue;
    hasAny = true;
    lines.push(`## ${label}（${group.length}）`, '');
    for (const event of group) {
      const role = event.role || '未知角色';
      const ts = event.ts ? `｜${event.ts}` : '';
      lines.push(`- [${role}] ${event.title}${ts}`);
      if (event.detail) lines.push(`  - ${event.detail}`);
    }
    lines.push('');
  }
  if (!hasAny) lines.push('暂无待处理通知。');
  return lines.join('\n');
}

/** 从输入文本解析事件数组（E251 input 文本内嵌 JSON 数组；解析失败返回空数组） */
export function parseEventsInput(text: string): HubEvent[] {
  const start = text.indexOf('[');
  if (start < 0) return [];
  try {
    const parsed: unknown = JSON.parse(text.slice(start));
    return Array.isArray(parsed) ? (parsed as HubEvent[]) : [];
  } catch {
    return [];
  }
}
