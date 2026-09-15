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
  'self_identity',
  'illegal_request',
  'property_emergency',
  'cultural_reference',
  'qa',
  'summarize',
  'extract_structure',
  'xmind',
  'rewrite',
  'pack',
  'schedule',
  'compare',
  'chat',
  'apply_to_project',
  'xmind_content',
  'codegraph_impact',
  'archify_diagram',
  'layered_arch_diagram',
  'generate_bom',
  'office_daily',
  'learn_video',
  'deep_report',
  'operate',
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
  'system',
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
// E194：业务评估词命中时保留 analyze（“这个方案成本多少，值不值”仍走选项式消歧），
// 不被问句优先守卫让给 qa。
const ANALYZE_EVAL_RE = /值不值|成本|收益/;
const GENERIC_QA_RE =
  /是什么|什么是|为什么|怎么|如何|怎样|怎么样|怎么办|哪些|哪种|哪几个|哪个|哪一种|推荐|选型|能不能|还能用吗|能用吗|可以用吗|是否|好不好|要不要|该不该|适合|需要注意|注意什么|需要什么|有什么|做什么|干嘛|干啥|解释|说明|回答|含义|是谁|叫什么|是啥|用途|作用|选什么|选一个|选哪|怎么选|怎么挑/;
// E194：度量型问句并入 qa，避免“版本号是多少/主频是多少”落 unknown 走 R012 confirm，
// 也避免“开发板多少钱”因含“开发”被 create 抢走。
const METRIC_QA_RE =
  /是多少|多少钱|什么价位|价位多少|价格多少|价格是多少|什么价格|多大|几位|有多少|剩多少/;
const QA_RE = new RegExp(`${GENERIC_QA_RE.source}|${METRIC_QA_RE.source}`);
const COLOR_RE = /颜色|配色|色号|色彩|主色|取色/;
// E340：Xmind 软件咨询类问句提示词（好用吗/哪款/教程等），命中时不该落“生成 .xmind 文件”写类动作
const XMIND_SOFTWARE_QA_RE =
  /好用|好用吗|方便吗|推荐|哪款|哪个好|哪家|软件|怎么学|教程|教学|模板|风格|快捷键|优缺点|区别|怎么用/u;
// E342：主题型内容思维导图（需联网整理内容后生成），与 E340“用户自带大纲直接生成”区分：
// 命中以下名词/动词形态且非咨询问句、无大纲结构行时 → xmind_content（走检索 + LLM 出大纲）。
// 名词形态：FreeRTOS 的软件架构思维导图？/ FreeRTOS思维导图
const XMIND_CONTENT_NOUN_RE =
  /([\w\u4e00-\u9fa5][\w\u4e00-\u9fa5 _\-./()（）+]{0,28}?)(?:的|之)?(?:软件|系统|整体|总体|技术|内部|体系|业务|产品|功能)?(?:架构|体系结构|结构|组成|模块|框架|体系|内核|知识点)?\s*(?:思维导图|xmind|脑图|mind\s*map|\.xmind)/i;
// 动词形态：把 FreeRTOS 软件架构做成/梳理成/整理成 思维导图
const XMIND_CONTENT_VERB_RE =
  /(?:把|将|请把|给)\s*([\w\u4e00-\u9fa5][\w\u4e00-\u9fa5 _\-./()（）+]{0,28}?)(?:的|之)?(?:软件|系统|整体|总体|技术|内部|体系|业务|产品|功能)?(?:架构|体系结构|结构|组成|模块|框架|体系|内核|知识点)?\s*(?:拆解|梳理|整理成|做成|整理|生成|画|制作|转为|转成)?\s*(?:成)?\s*(?:思维导图|xmind|脑图|mind\s*map)/i;
const XMIND_CONTENT_RE = new RegExp(
  `${XMIND_CONTENT_NOUN_RE.source}|${XMIND_CONTENT_VERB_RE.source}`,
  'i',
);
// E342：思维导图咨询/泛问句（怎么做/推荐哪款/思维导图软件等）不与内容型抢意图
const XMIND_CONSULT_RE =
  /好用吗|好用|推荐|哪款|哪个好|教程|教学|模板|风格|快捷键|优缺点|区别|怎么用|怎么做|怎么画|怎么学|思维导图软件|用思维导图|有没有|哪些|是什么|什么叫/u;
/** 大纲结构行（WBS 编号 / - * 列表）——用户已自带大纲，直接生成而非内容整理 */
const OUTLINE_LINE_RE = /[\r\n]\s*\d+(?:\.\d+)*[\s.、]|[\r\n]\s*[-*]\s/;
// E353：CodeGraph 本地代码解读——意图触发需带代码语境（函数/符号/文件/工程等），
// 纯问句（什么是影响分析/明天会影响出行吗）由下方守卫让位 qa/web_search。
const CODEGRAPH_IMPACT_RE =
  /(?:改了|改下|改一下|改动|修改|重构|删除|删掉|调整)\s*(?:了)?\s*(?:这个|那个)?[^。；\n]{0,20}(?:影响|波及)|(?:谁|被谁)\s*(?:在)?\s*(?:调用|调用了)|(?:谁|哪些|什么)\s*在\s*(?:调用|引用)|(?:调用链|影响分析|代码影响|会波及|影响到哪些)/i;
const CODEGRAPH_READ_RE =
  /(?:解读|速读|分析|梳理|讲讲|看看|摸清)\s*(?:一下)?\s*[^。；\n]{0,28}?(?:代码|项目|仓库|源码|工程)\s*(?:的)?(?:整体|主要|总体)?(?:结构|组成|模块|架构|依赖|调用|关系)?/i;
const CODE_ENTITY_RE =
  /函数|方法|变量|符号|模块|类|接口|源码|代码|项目|仓库|工程|文件|引用|调用|\.(?:ts|tsx|js|jsx|c|cpp|cc|cxx|h|hpp|py|rs|go|java|kt|v|sv|zig)\b|(?:projects|sandbox|outputs|data)[\\/][A-Za-z0-9_.\-/\\]*/i;
// E353：影响分析/调用关系类元问句（概念咨询）不落本地代码分析
const CODEGRAPH_CONSULT_RE =
  /(?:什么是|是什么|什么叫|指什么|怎么做|怎么用|如何做|如何用|哪些工具|有什么工具|有没有工具)\s*.{0,10}(?:影响分析|调用关系|代码影响|调用链)/i;
// E352：Archify 五类系统图（架构/流程/时序/数据流/生命周期）——「…图」名词或
// 「画/生成 + 图型主题 + (图)」动宾结构；置于 analyze/create 之前防被「分析/画」抢词。
const ARCHIFY_RE =
  /(?:系统架构图|架构图|系统图|组件图|模块图|拓扑图|部署图|架构示意|流程图|泳道图|工作流图|时序图|序列图|数据流图|数据管道图|生命周期图|状态机图|状态图|architecture\s*diagram|component\s*diagram|workflow\s*diagram|flow\s*chart|sequence\s*diagram|data\s*flow\s*diagram|lifecycle\s*diagram|state\s*machine\s*diagram)|(?:把|将|请|帮我)?\s*(?:画|绘制|生成|做张|做一张|出一张|出图|设计)\s*.{0,18}(?:架构|系统|流程|工作流|泳道|时序|序列|数据流|数据管道|生命周期|状态机|组件|拓扑|部署|architecture|workflow|sequence|dataflow|data\s*flow|lifecycle).{0,6}(?:图|diagram)?/i;
// E352：画图实义祈使（「帮我画… / 画个…图 / 把…画出来」），用于问句守卫放行
const ARCHIFY_IMPERATIVE_RE =
  /(?:帮我|请|给我|麻烦)\s*(?:画|绘制|生成|设计|出一张|画一张)|画(?:个|一张|一个|下|出来|出)|生成一张|做张|做一张/i;
// E364：分层架构/框架/模块图（layered-arch 自研 viewer，替代 Archify 架构类）——
// 只拦「架构/框架/分层/模块/组件/系统图」类；流程/时序/数据流/生命周期/拓扑/部署仍留给 archify_diagram。
const LAYERED_ARCH_RE =
  /(?:系统架构图|架构图|系统图|组件图|模块图|框架图|分层图|架构示意|architecture\s*diagram|component\s*diagram)|(?:把|将|请|帮我)?\s*(?:画|绘制|生成|设计|做张|做一张|出一张)\s*.{0,18}(?:系统架构|架构|系统框架|框架|模块|组件|分层|结构).{0,6}(?:图|diagram)?/i;
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
  // E353：CodeGraph 代码影响/调用/项目解读——置于 analyze/qa/create 之前防被抢词
  ['codegraph_impact', CODEGRAPH_IMPACT_RE],
  ['codegraph_impact', CODEGRAPH_READ_RE],
  // E342：内容型思维导图须置于 xmind 之前——问句/自带大纲由下方守卫让位
  ['xmind_content', XMIND_CONTENT_RE],
  // E340：Xmind 思维导图动作（生成/读取 .xmind）须置于 analyze/office_daily/create 之前，
  // 否则正文里的“分析/对比/安排”等词会抢走意图；问句（怎么做/是什么）由下方 qa 守卫让位
  ['xmind', /(?:思维导图|xmind|脑图|mind\s*map|\.xmind).{0,14}(?:生成|创建|画|绘制|整理|整理成|做成|做|制作|转成|转为|导出|拆解|拆成|读取|读一下|打开|解析|大纲|内容)|(?:生成|创建|画|绘制|整理|整理成|做成|做|制作|转成|转为|导出|拆解成|拆成).{0,14}(?:思维导图|xmind|脑图|mind\s*map|\.xmind)/i],
  // E352：Archify 图（架构/流程/时序/数据流/生命周期）——置于 office_daily/analyze/create 之前
  // E364：分层架构/框架/模块图须在 archify 之前，防「架构图」被 archify 抢走
  ['layered_arch_diagram', LAYERED_ARCH_RE],
  ['archify_diagram', ARCHIFY_RE],
  ['office_daily', /发.*邮件|发送.*邮件|邮件.*(发送|发出)|把.*邮件.*发|收件箱|收邮件|查邮件|未读邮件|读第\s*\d+\s*封|下载.*附件|附件.*下载|保存.*附件|附件.*保存|确认发送|确定发送|确认发出|确定发出|搜信|搜.*邮件|找.*邮件|查找.*邮件|搜索.*邮件|切换.*(?:邮箱|账号|收件箱|邮件)|切(?:到|成).*(?:邮箱|账号|收件箱|邮件)|换成.*(?:邮箱|账号|邮件)|用.*(?:邮箱|账号).*(?:查|看|收件|搜|发)|考勤表|部门占比|回复邮件|写.*邮件|邮件.*回复|压缩.*(KB|图片)|图片.*压缩|表格模板|占比|PPT|幻灯片|汇报|Word|docx|PDF.*(转|换)成Word|转成Word|转Word|PDF.*(合并|加密|加锁|压缩)|(合并|加密|加锁|压缩).*PDF|转成\s*(png|jpe?g|webp|bmp|heic|heif|avif|tiff?)|图片.*格式|HEIC|HEIF|AVIF|排版|Excel|xlsx|主动提醒|提醒我|设置提醒/i],
  ['learn_video', /学习这个视频|视频学习|视频总结|总结这个视频/],
  ['compare', /对比|比较|对照|PK/],
  ['analyze', ANALYZE_RE],
  // E242：GitHub 仓库项目问句（做什么/是什么/怎么用/值不值/怎么样）→ analyze，供 R017 github_analysis
  ['analyze', /github\.(?:com|io)\S*\s*(?:这|该|这个|那个)?(?:项目|仓库|repo).*(?:做什么|干什么|是什么|怎么用|怎么玩|怎么样|值不值|值不值得|评价|了解|介绍)/],
  // E264：自我身份问答（“你现在是什么模型/你是谁”等 → 直达身份回答，不做搜索）
  ['self_identity', /你(?:现在|目前|当前|到底)?(?:是|用|基于|由|采用|用的).{0,8}(?:什么|哪|哪个|谁).{0,10}(?:模型|引擎|技术|原理|做的|驱动|公司|团队)|你(?:是|叫)(?:谁|什么)|你是谁|你是什么|你叫什么|介绍(?:一下)?你自己|自我(?:介绍|认知)/],
  // E392：显式 MCP 工具或工程路径属于本地工具操作，须在通用 qa/query 之前判定。
  // 裸 “Keil/STM32” 技能名（如「只有 Keil 基础」）不算 operate，避免 devil SM05 类管理问句误路由。
  ['operate', /列出.*(进程|应用|窗口)|进程.*(列表|状态|查看)|切换.*窗口|关闭.*(应用|程序|进程)|打开.*(应用|程序|软件|记事本|浏览器)|启动.*(程序|软件)|系统工具|桌面控制|windows\.|\.uvprojx|(?:查找|发现|搜索|盘点|查看|列出|编译|构建|build|烧录|flash).{0,20}(?:keil|stm32-gcc|\.uvprojx)|(?:keil|stm32-gcc).{0,16}(?:编译|构建|build|烧录)|arm-none-eabi|stm32.{0,12}cmake/i],
  ['qa', QA_RE],
  // E169：日历/日程“导出/保存/下载/ics”视为 query，命中 R004 走 calendar_skill，避免偏到 web_search
  ['query', /导(?:出|下载).*(日历|日程)|保存.*(?:日历|日程)|(?:日历|日程).*(导出|保存|下载|\.?ics)/i],
  // E171：日历/日程“导入/读取 .ics”视为 query，命中 R004 走 calendar_skill，避免偏到 web_search
  ['query', /导(?:入|进).*(日历|日程|ics)|(?:日历|日程|ics).*导(?:入|进)/i],
  ['query', /查一下|查询|看下|看看|问一下|帮我查|查查/],
  ['summarize', /总结|摘要|提炼|要点|概述|概括/],
  ['extract_structure', /结构|大纲|目录|框架|拆解|分节|章节/],
  ['generate_bom', /BOM|物料清单|元器件清单|元件清单/],
  ['rewrite', /重写|润色|改写|语气|风格/],
  ['pack', /打包|压缩.*项目|项目.*压缩/],
  ['apply_to_project', /按你说的|按你的建议|在我的工程|帮我加上|应用刚才|落地到|写入.*工程|(?:写入|保存到|写到|落地到)\s+[A-Za-z]:\\/],
  ['chat', /心情不好|陪我聊|聊聊|聊聊天|倾诉|安慰|难过|不开心|孤独|压力大|焦虑|emo/],
  ['send', /发消息|发邮件|通知|发给|转发|发送|微信|QQ|飞书/],
  ['schedule', /安排|预约|预定|订个|约个|帮我订/],
  ['modify', /修改|改下|更新|重构|修复|不对|改成|换成|我要的是|修正|调整/],
  // v1.0 S1：深度报告（§4.3.2 长任务首实例），须置于 create 之前防止「写一份…报告」被 create 抢走
  ['deep_report', /深度报告|调研报告|研究报告|深度分析|出一份.*报告|写一份.*报告|做一份.*报告|整理成.*报告|做个.*(调研|报告)|报告.*(调研|分析)/],
  ['create', /创建|生成|写个|写一个|做个|做一个|开发|搭建|实现|写一份|帮我写|设计|画/],
];

const DOMAIN_RE: Array<[TargetDomain, RegExp]> = [
  ['schedule', /日程|安排|会议|日历|提醒|待办|\.ics/],
  ['message', /消息|邮件|微信|QQ|飞书|老张/],
  ['security', /安全|权限|危险|急救|病毒/],
  ['search', /搜索|最新|行情|天气|价格|库存|评测|资料/],
  ['code', /代码|接口|函数|模块|App|前端|后端|PCB|固件|登录|芯片|STM32|原理图|算法|PID|位置式|积分限幅|工程/],
  ['finance', /(?<!时间)(?<!学习)(?<!人力)成本|预算|收益|报价|值不值|ROI|利润/],
  ['document', /PRD|文档|方案|报告|需求文档|说明|总结|BOM|物料清单|元器件清单|元件清单|原理图/],
  ['color', /颜色|配色|色号|色彩|主色|取色/],
  ['system', /进程|窗口|桌面|系统工具|应用列表|windows\.|keil|\.uvprojx|stm32-gcc|arm-none-eabi|stm32.{0,12}cmake/i],
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
  const hasGithubLink = /github\.com|github\.io|\/github\//i.test(q);
  let actionType: ActionType = 'unknown';
  for (const [type, re] of ACTION_RE) {
    if (!re.test(q)) continue;
    if (
      type === 'analyze' &&
      !COLOR_RE.test(q) &&
      !hasGithubLink &&
      (GENERIC_QA_RE.test(q) ||
        (METRIC_QA_RE.test(q) && !ANALYZE_EVAL_RE.test(q)))
    ) {
      // 问句优先 qa，避免“如何评估风险”被 analyze 抢走；
      // 度量型问句仅在无业务评估词（值不值/成本/收益）时让给 qa，
      // “这个方案成本多少，值不值”仍走 analyze 的选项式消歧
      continue;
    }
    if (
      type === 'xmind' &&
      (GENERIC_QA_RE.test(q) || METRIC_QA_RE.test(q) || XMIND_SOFTWARE_QA_RE.test(q)) &&
      !OUTLINE_LINE_RE.test(q) &&
      !/(?:做成|整理成|生成|创建|画|绘制)\s*.{0,8}(?:思维导图|xmind|脑图|mind\s*map|\.xmind)/i.test(q)
    ) {
      // E340：怎么做/是什么/软件咨询类问句让给 qa（知识问答），不当作 Xmind 写文件动作；
      // 带大纲结构行或“做成/生成…脑图”实义短语时不误让
      continue;
    }
    if (
      type === 'xmind_content' &&
      (OUTLINE_LINE_RE.test(q) ||
        XMIND_CONSULT_RE.test(q) ||
        // E340：读取/解析已有 .xmind 属“读回”动作，让位 xmind（skill 内再判读/生成）
        (/读取|读一下|读回|打开|解析|提取|看看|查看|转成文字/u.test(q) &&
          /思维导图|xmind|脑图|mind\s*map|\.xmind/i.test(q)))
    ) {
      // E342：自带大纲结构行 → 让位 xmind 直接生成；咨询/泛问句 → 让位 qa
      continue;
    }
    if (
      type === 'codegraph_impact' &&
      (GENERIC_QA_RE.test(q) || METRIC_QA_RE.test(q)) &&
      !CODE_ENTITY_RE.test(q)
    ) {
      // E353：问句但无代码语境（函数/符号/工程/文件等）→ 让位 qa，不误落本地代码分析
      continue;
    }
    if (type === 'codegraph_impact' && CODEGRAPH_CONSULT_RE.test(q)) {
      // E353：概念咨询问句让位 qa（知识问答），不当作本地代码分析动作
      continue;
    }
    if (type === 'codegraph_impact' && hasGithubLink) {
      // E353：GitHub 链接项目问句让位 analyze/github_analysis（在线仓库解读走 github-reader），
      // 本地 codegraph 只解本地工程
      continue;
    }
    if (
      type === 'layered_arch_diagram' &&
      (GENERIC_QA_RE.test(q) || METRIC_QA_RE.test(q)) &&
      !ARCHIFY_IMPERATIVE_RE.test(q)
    ) {
      // E364：架构/框架图咨询问句（怎么画架构图/什么是框架图）让给 qa，不当作画图写操作
      continue;
    }
    if (type === 'layered_arch_diagram' && attachments.some((a) => a.type === 'image')) {
      // E364：已有图片的「解读这张架构图」走图片分析，不当作新画一张图
      continue;
    }
    if (
      type === 'archify_diagram' &&
      (GENERIC_QA_RE.test(q) || METRIC_QA_RE.test(q)) &&
      !ARCHIFY_IMPERATIVE_RE.test(q)
    ) {
      // E352：图型咨询问句（什么是时序图 / 怎么画架构图 / 流程图怎么做）让给 qa，不当作画图写操作；
      // 「帮我画…/画个…图/把…画出来」等实义祈使不误让
      continue;
    }
    if (type === 'archify_diagram' && attachments.some((a) => a.type === 'image')) {
      // E352：已有图片的「解读这张架构图」走图片分析，不当作新画一张图
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
        : /单文件|写个|写一个|写一段|一段|一个|单个|登录接口/.test(q)
          ? 'atomic'
          : 'unknown';

  const hasImplicitContext =
    /(这个|那个|它|他|她|这项目|那项目)/.test(q) || actionType === 'apply_to_project';
  const requiresExternalSearch =
    actionType === 'xmind_content' || // E342：内容型思维导图需联网整理主题内容
    /最新|行情|天气|价格|库存|评测|报错|怎么解决|datasheet|github|搜索|(^|[^检])查一下|资料/.test(q) ||
    targetDomain === 'search';
  const searchSourceHint: SearchSourceHint =
    actionType === 'xmind_content'
      ? 'web_search'
      : actionType === 'compare' && targetDomain === 'finance'
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
  contextHints: string[] = [],
): string {
  const attachmentBlock =
    attachments.length > 0
      ? `\n附件信号：${attachments.map((a) => `${a.type}:${a.mimeType}:${a.fileName}`).join('、')}`
      : '';
  const contextBlock =
    contextHints.length > 0
      ? `\n历史上下文（仅用于消歧，不要当成当前输入）：\n${contextHints
          .map((h) => `- ${h.slice(0, 300)}`)
          .join('\n')}`
      : '';
  return `你是一个意图特征提取器。只输出 JSON，不要做路由决策。
字段：actionType(create|modify|query|send|analyze|clarify|emergency|illegal_request|property_emergency|cultural_reference|office_daily|learn_video|deep_report|qa|summarize|extract_structure|xmind|xmind_content|codegraph_impact|archify_diagram|layered_arch_diagram|rewrite|pack|schedule|compare|chat|apply_to_project|unknown), targetDomain(code|document|schedule|message|search|finance|security|color|unknown), scope(atomic|multi_step|project_level|unknown), requiresExternalSearch(boolean), searchSourceHint(local_skill|web_search|internal_db|vendor_db|none), hasImplicitContext(boolean), hasGithubLink(boolean), urgency(normal|urgent|critical), rawEntities(string[]), ambiguityFlags(missing_referent|scope_unclear|target_ambiguous[])。
hasImage(boolean), hasDocument(boolean), attachmentTypes(string[]), fastImageDescription(string|undefined), timeExpression(string|undefined), hasTimeExpression(boolean)。
用户输入：${query}${attachmentBlock}${contextBlock}`;
}
