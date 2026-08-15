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
  'illegal_request',
  'property_emergency',
  'cultural_reference',
  'qa',
  'summarize',
  'extract_structure',
  'rewrite',
  'pack',
  'schedule',
  'compare',
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
  'color',
  'unknown',
] as const;

export type TargetDomain = (typeof TARGET_DOMAINS)[number];

export type Scope = 'atomic' | 'multi_step' | 'project_level' | 'unknown';
export type SearchSourceHint =
  | 'local_skill'
  | 'web_search'
  | 'internal_db'
  | 'vendor_db'
  | 'none';
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
  hasGithubLink: boolean;
  attachmentTypes: string[];
  fastImageDescription?: string;
  timeExpression?: string;
  hasTimeExpression: boolean;
}

const ANALYZE_RE =
  /分析|评估|审查|检查|巡检|审阅|值不值|成本|收益|颜色|配色|色号|色彩|主色|取色/;
const QA_RE =
  /是什么|什么是|为什么|怎么|如何|怎样|怎么样|怎么办|哪些|哪种|哪几个|哪个|哪一种|推荐|选型|能不能|还能用吗|能用吗|可以用吗|是否|好不好|要不要|该不该|适合|需要注意|注意什么|需要什么|有什么|做什么|干嘛|干啥|解释|说明|回答|含义|是谁|叫什么|是啥|用途|作用|选什么|选一个|选哪|怎么选|怎么挑/;
const COLOR_RE = /颜色|配色|色号|色彩|主色|取色/;

const ACTION_RE: Array<[ActionType, RegExp]> = [
  [
    'illegal_request',
    /核弹|炸弹|制造.*武器|毒品|破解.*密码|入侵|盗取|窃取|rm\s*-\s*rf|删库|勒索|诈骗/,
  ],
  [
    'property_emergency',
    /手机.*(进水|掉水|落水|泡水)|掉水里|进水了|泡水|设备.*(进水|水淹)/,
  ],
  [
    'emergency',
    /急救|120|119|110|火灾|地震|溺水|落水|触电|电击|大出血|呼吸困难|窒息|蛇咬|毒蛇|咬伤|中毒|昏迷|心梗|胸痛|心肌梗死|跟踪|遇袭|抢劫|挟持/,
  ],
  ['cultural_reference', /小鸡啄米|唐伯虎|周星驰|星爷|梗|名场面|表情包|meme|经典桥段|鬼畜|抽象|玩梗/],
  ['compare', /对比|比较|对照|PK/],
  ['analyze', ANALYZE_RE],
  ['qa', QA_RE],
  ['query', /查一下|查询|看下|看看|问一下|帮我查|查查/],
  ['summarize', /总结|摘要|提炼|要点|概述|概括/],
  ['extract_structure', /结构|大纲|目录|框架|拆解|分节|章节/],
  ['rewrite', /重写|润色|改写|语气|风格/],
  ['pack', /打包|压缩.*项目|项目.*压缩/],
  ['send', /发消息|发邮件|通知|发给|转发|发送|微信|QQ|飞书/],
  ['schedule', /安排|预约|预定|订个|约个|帮我订/],
  ['modify', /修改|改下|更新|重构|修复|不对|改成|换成|我要的是|修正|调整/],
  ['create', /创建|生成|写个|写一个|做个|做一个|开发|搭建|实现|写一份|帮我写|设计|画/],
];

const DOMAIN_RE: Array<[TargetDomain, RegExp]> = [
  ['schedule', /日程|安排|会议|日历|提醒|待办/],
  ['message', /消息|邮件|微信|QQ|飞书|老张/],
  ['security', /安全|权限|危险|急救|病毒/],
  ['search', /搜索|最新|行情|天气|价格|库存|评测|资料/],
  ['code', /代码|接口|函数|模块|App|前端|后端|PCB|固件|登录|芯片|STM32|原理图|算法|PID|位置式|积分限幅/],
  ['finance', /(?<!时间)(?<!学习)(?<!人力)成本|预算|收益|报价|值不值|ROI|利润/],
  ['document', /PRD|文档|方案|报告|需求文档|说明|总结/],
  ['color', /颜色|配色|色号|色彩|主色|取色/],
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
  const sources = ['local_skill', 'web_search', 'internal_db', 'vendor_db', 'none'];
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
    hasGithubLink: m.hasGithubLink === true,
    attachmentTypes: Array.isArray(m.attachmentTypes)
      ? m.attachmentTypes.filter((t): t is string => typeof t === 'string')
      : [],
    fastImageDescription:
      typeof m.fastImageDescription === 'string' ? m.fastImageDescription : undefined,
    timeExpression:
      typeof m.timeExpression === 'string' ? m.timeExpression : undefined,
    hasTimeExpression: m.hasTimeExpression === true,
  };
}

export function extractTimeExpression(q: string): string | undefined {
  const m = q.match(
    /(今天|明天|后天|下周[一二三四五六日天]?|周[一二三四五六日天]|星期[一二三四五六日天])(上午|下午|晚上)?\s*(\d{1,2}[点时:：]\d{0,2}|十[一二三四五六七八九]?点|\d{1,2}点)?/,
  );
  return m?.[0] || undefined;
}

export function extractIntentFeatureRuleBased(
  query: string,
  attachments: AttachmentSignal[] = [],
): IntentFeature {
  const q = query.trim();
  let actionType: ActionType = 'unknown';
  for (const [type, re] of ACTION_RE) {
    if (!re.test(q)) continue;
    if (type === 'analyze' && QA_RE.test(q) && !COLOR_RE.test(q)) {
      // 问句优先 qa，避免“如何评估风险”被 analyze 抢走
      continue;
    }
    actionType = type;
    break;
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
  const hasGithubLink = /github\.com|github\.io|\/github\//i.test(q);
  const requiresExternalSearch =
    /最新|行情|天气|价格|库存|评测|报错|怎么解决|datasheet|github|搜索|(^|[^检])查一下|资料/.test(q) ||
    targetDomain === 'search';
  const searchSourceHint: SearchSourceHint =
    actionType === 'compare' && targetDomain === 'finance'
      ? 'vendor_db'
      : targetDomain === 'schedule' || targetDomain === 'message'
      ? 'local_skill'
      : requiresExternalSearch
        ? 'web_search'
        : /记忆|历史|项目库|内部/.test(q)
          ? 'internal_db'
          : 'none';

  const timeExpression = actionType === 'schedule' ? extractTimeExpression(q) : undefined;

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
    hasGithubLink,
    urgency,
    rawEntities,
    ambiguityFlags,
    hasImage: attachments.some((a) => a.type === 'image'),
    hasDocument: attachments.some((a) => a.type === 'document'),
    attachmentTypes: attachments.map((a) => a.mimeType),
    fastImageDescription: undefined,
    timeExpression,
    hasTimeExpression: Boolean(timeExpression),
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
字段：actionType(create|modify|query|send|analyze|clarify|emergency|illegal_request|property_emergency|cultural_reference|qa|summarize|extract_structure|rewrite|pack|schedule|compare|unknown), targetDomain(code|document|schedule|message|search|finance|security|color|unknown), scope(atomic|multi_step|project_level|unknown), requiresExternalSearch(boolean), searchSourceHint(local_skill|web_search|internal_db|vendor_db|none), hasImplicitContext(boolean), hasGithubLink(boolean), urgency(normal|urgent|critical), rawEntities(string[]), ambiguityFlags(missing_referent|scope_unclear|target_ambiguous[])。
hasImage(boolean), hasDocument(boolean), attachmentTypes(string[]), fastImageDescription(string|undefined), timeExpression(string|undefined), hasTimeExpression(boolean)。
用户输入：${query}${attachmentBlock}`;
}
