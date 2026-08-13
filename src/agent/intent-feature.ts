/**
 * Layer 1: 意图特征提取（§2.2 镜片模型前置）
 * 只提取事实，不做路由决策；Phase 1 用确定性规则，后续可换 LLM。
 */

import type { AttachmentSignal } from './multimodal-preprocessor.js';

export const ACTION_TYPES = [
  'create',
  'modify',
  'query',
  'send',
  'analyze',
  'clarify',
  'emergency',
  'unknown',
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export const TARGET_DOMAINS = [
  'code',
  'document',
  'schedule',
  'message',
  'search',
  'finance',
  'security',
  'unknown',
] as const;

export type TargetDomain = (typeof TARGET_DOMAINS)[number];

export type Scope = 'atomic' | 'multi_step' | 'project_level' | 'unknown';
export type SearchSourceHint = 'local_skill' | 'web_search' | 'internal_db' | 'none';
export type Urgency = 'normal' | 'urgent' | 'critical';
export type AmbiguityFlag = 'missing_referent' | 'scope_unclear' | 'target_ambiguous';

export interface IntentFeature {
  actionType: ActionType;
  targetDomain: TargetDomain;
  scope: Scope;
  requiresExternalSearch: boolean;
  searchSourceHint: SearchSourceHint;
  hasImplicitContext: boolean;
  urgency: Urgency;
  rawEntities: string[];
  ambiguityFlags: AmbiguityFlag[];
  hasImage: boolean;
  hasDocument: boolean;
  attachmentTypes: string[];
  fastImageDescription?: string;
}

const ACTION_RE: Array<[ActionType, RegExp]> = [
  ['emergency', /急救|120|119|110|火灾|地震|溺水|触电|大出血|呼吸困难/],
  ['send', /发消息|发邮件|通知|发给|转发|发送|微信|QQ|飞书/],
  ['create', /创建|生成|写个|写一个|做个|做一个|开发|搭建|实现|写一份|帮我写|设计|画/],
  ['modify', /修改|改下|更新|重构|修复/],
  ['query', /查一下|查询|看下|看看|问一下|帮我查/],
  ['analyze', /分析|评估|值不值|怎么样|成本|收益|推荐|选型/],
];

const DOMAIN_RE: Array<[TargetDomain, RegExp]> = [
  ['schedule', /日程|安排|会议|日历|提醒|待办/],
  ['message', /消息|邮件|微信|QQ|飞书|老张/],
  ['code', /代码|接口|函数|模块|App|前端|后端|PCB|固件|登录|芯片|STM32/],
  ['finance', /成本|预算|收益|报价|值不值|ROI|利润/],
  ['document', /PRD|文档|方案|报告|需求文档|说明|总结/],
  ['security', /安全|权限|危险|急救|病毒/],
  ['search', /搜索|最新|行情|天气|价格|库存|评测|资料/],
];

export function validateIntentFeature(input: unknown): IntentFeature {
  if (typeof input !== 'object' || input === null) {
    throw new Error('IntentFeature 必须是对象');
  }
  const m = input as Record<string, unknown>;
  const actionType = String(m.actionType ?? 'unknown');
  const targetDomain = String(m.targetDomain ?? 'unknown');
  const scope = String(m.scope ?? 'atomic');
  const searchSourceHint = String(m.searchSourceHint ?? 'none');
  const urgency = String(m.urgency ?? 'normal');
  const actions = ACTION_TYPES as readonly string[];
  const domains = TARGET_DOMAINS as readonly string[];
  const scopes = ['atomic', 'multi_step', 'project_level'];
  const sources = ['local_skill', 'web_search', 'internal_db', 'none'];
  const urgencies = ['normal', 'urgent', 'critical'];
  if (!actions.includes(actionType)) throw new Error(`非法 actionType: ${actionType}`);
  if (!domains.includes(targetDomain)) throw new Error(`非法 targetDomain: ${targetDomain}`);
  if (!scopes.includes(scope)) throw new Error(`非法 scope: ${scope}`);
  if (!sources.includes(searchSourceHint)) throw new Error(`非法 searchSourceHint: ${searchSourceHint}`);
  if (!urgencies.includes(urgency)) throw new Error(`非法 urgency: ${urgency}`);
  const flags = Array.isArray(m.ambiguityFlags)
    ? m.ambiguityFlags.filter((f): f is AmbiguityFlag => ['missing_referent', 'scope_unclear', 'target_ambiguous'].includes(String(f)))
    : [];
  return {
    actionType: actionType as ActionType,
    targetDomain: targetDomain as TargetDomain,
    scope: scope as Scope,
    requiresExternalSearch: Boolean(m.requiresExternalSearch),
    searchSourceHint: searchSourceHint as SearchSourceHint,
    hasImplicitContext: Boolean(m.hasImplicitContext),
    urgency: urgency as Urgency,
    rawEntities: Array.isArray(m.rawEntities)
      ? m.rawEntities.filter((e): e is string => typeof e === 'string')
      : [],
    ambiguityFlags: flags,
    hasImage: m.hasImage === true,
    hasDocument: m.hasDocument === true,
    attachmentTypes: Array.isArray(m.attachmentTypes)
      ? m.attachmentTypes.filter((t): t is string => typeof t === 'string')
      : [],
    fastImageDescription:
      typeof m.fastImageDescription === 'string' ? m.fastImageDescription : undefined,
  };
}

export function extractIntentFeatureRuleBased(
  query: string,
  attachments: AttachmentSignal[] = [],
): IntentFeature {
  const q = query.trim();
  let actionType: ActionType = 'unknown';
  for (const [type, re] of ACTION_RE) {
    if (re.test(q)) {
      actionType = type;
      break;
    }
  }

  let targetDomain: TargetDomain = 'unknown';
  for (const [domain, re] of DOMAIN_RE) {
    if (re.test(q)) {
      targetDomain = domain;
      break;
    }
  }

  const scope: Scope =
    /完整|项目|系统|应用|平台|多文件|多模块|跨工具|整套/.test(q)
      ? 'project_level'
      : /PRD|文档|设计|规划|拆解|搭建/.test(q)
        ? 'multi_step'
        : /单文件|一段|一个|登录接口/.test(q)
          ? 'atomic'
          : 'unknown';

  const hasImplicitContext = /(这个|那个|它|他|她|这项目|那项目)/.test(q);
  const requiresExternalSearch =
    /最新|行情|天气|价格|库存|评测|报错|怎么解决|datasheet|github|搜索|查一下|资料/.test(q) ||
    targetDomain === 'search';
  const searchSourceHint: SearchSourceHint =
    targetDomain === 'schedule' || targetDomain === 'message'
      ? 'local_skill'
      : requiresExternalSearch
        ? 'web_search'
        : /记忆|历史|项目库|内部/.test(q)
          ? 'internal_db'
          : 'none';

  const urgency: Urgency = /急救|危险|紧急|critical/.test(q)
    ? 'critical'
    : /急|马上|尽快/.test(q)
      ? 'urgent'
      : 'normal';

  const ambiguityFlags: AmbiguityFlag[] = [];
  if (hasImplicitContext && !/[A-Z0-9]{4,}/.test(q)) ambiguityFlags.push('missing_referent');
  if ((actionType === 'create' || actionType === 'modify') && scope === 'unknown') {
    ambiguityFlags.push('scope_unclear');
  }

  const part = q.match(/[A-Z]{2,}[0-9A-Z-]{2,}/)?.[0];
  const rawEntities: string[] = [];
  if (part) rawEntities.push(part);
  for (const phrase of ['App前端', 'PRD', '登录接口']) {
    if (q.includes(phrase)) rawEntities.push(phrase);
  }

  return {
    actionType,
    targetDomain,
    scope,
    requiresExternalSearch,
    searchSourceHint,
    hasImplicitContext,
    urgency,
    rawEntities,
    ambiguityFlags,
    hasImage: attachments.some((a) => a.type === 'image'),
    hasDocument: attachments.some((a) => a.type === 'document'),
    attachmentTypes: attachments.map((a) => a.mimeType),
    fastImageDescription: undefined,
  };
}

export function buildIntentFeaturePrompt(
  query: string,
  attachments: AttachmentSignal[] = [],
): string {
  const attachmentBlock =
    attachments.length > 0
      ? `\n附件信号：${attachments.map((a) => `${a.type}:${a.mimeType}:${a.fileName}`).join('、')}`
      : '';
  return `你是一个意图特征提取器。只输出 JSON，不要做路由决策。
字段：actionType(create|modify|query|send|analyze|clarify|emergency|unknown), targetDomain(code|document|schedule|message|search|finance|security|unknown), scope(atomic|multi_step|project_level|unknown), requiresExternalSearch(boolean), searchSourceHint(local_skill|web_search|internal_db|none), hasImplicitContext(boolean), urgency(normal|urgent|critical), rawEntities(string[]), ambiguityFlags(missing_referent|scope_unclear|target_ambiguous[])。
hasImage(boolean), hasDocument(boolean), attachmentTypes(string[]), fastImageDescription(string|undefined)。
用户输入：${query}${attachmentBlock}`;
}
