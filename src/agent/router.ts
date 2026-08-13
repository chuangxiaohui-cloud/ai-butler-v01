/**
 * 主 Agent 意图路由（§2.2 镜片模型 + §4 一刀测试）
 * 纯规则、零依赖，供搜索管道与秘书合成层使用。
 */

export type AgentLens =
  | 'secretary'
  | 'owner'
  | 'product_manager'
  | 'project_manager'
  | 'architect';

export type AgentMode = 'knowledge' | 'execution' | 'life';
export type AskCraftPlan = 'ask' | 'craft' | 'plan';
export type SearchNeed = 'must' | 'no' | 'ambiguous';

export interface RouteResult {
  query: string;
  primaryLens: AgentLens;
  mode: AgentMode;
  action: AskCraftPlan;
  searchNeed: SearchNeed;
  executionSignal: boolean;
  clarify: string | null;
  reasons: string[];
}

const EMERGENCY_RE =
  /急救|120|119|110|心脏病|中风|脑梗|火灾|地震|溺水|触电|大出血|呼吸困难|紧急/;
const LIFE_RE = /天气|气温|预报|闲聊|你好|早上好|晚安|心情|情感|陪伴|周末|附近|好吃|好玩|感冒|健康/;
const EXECUTION_VERB_RE =
  /生成|创建|写个|写一个|做个|做一个|开发|搭建|修改|改下|落地|实现|画|设计|配置|部署|上传|推送|commit|push|git|安装|迁移/;
const EXECUTION_STRONG_RE =
  /完整的|项目|工程|多文件|依赖|模块|系统|应用|前端|后端|原理图|PCB|BOM|集成|搭建|仓库/;
const KNOWLEDGE_SNIPPET_RE =
  /代码片段|函数|怎么|什么是|是什么|对比|区别|解释|举例|原理|配置步骤|教程|为什么/;
const PLAN_RE = /规划|计划|怎么规划|先出方案|拆解|roadmap|里程碑|排期|进度/;
const CRAFT_RE = /帮我写|帮我生成|直接做|写个|写一个|做个|做一个|创建|生成/;
const SEARCH_MUST_RE =
  /查一下|去查|联网|搜一下|搜索|最新|今天|行情|天气|价格|库存|GitHub|release|评测|datasheet|报错|解决|踩坑/;
const CHAT_ONLY_RE = /帮我写一首诗|润色|翻译|头脑风暴|闲聊|夸夸我|安慰我|讲个笑话/;

const ARCHITECT_RE =
  /芯片|datasheet|架构|技术栈|代码|PCB|电路|API|模块|性能|选型|怎么实现|如何实现|原理图|固件|仿真/;
const OWNER_RE = /预算|成本|收益|值不值|老板|决策|方向|投资|报价|ROI/;
const PM_RE = /计划|排期|进度|任务|拆解|子Agent|协同|风险|里程碑|deadline|工期/;
const PRODUCT_RE = /需求|PRD|用户|产品|功能|市场/;

function detectClarify(query: string): string | null {
  if (
    /(这个|那个|它|他|她|这项目|那项目).{0,10}(怎么样|行不行|怎么做|能用吗|适合吗|靠谱吗|值不值)/.test(
      query,
    ) &&
    !/[A-Z0-9]{4,}/.test(query)
  ) {
    return '你说的是哪个具体对象？给我型号、链接或名字，我再继续。';
  }
  return null;
}

export function routeQuery(query: string): RouteResult {
  const q = query.trim();
  const reasons: string[] = [];

  if (EMERGENCY_RE.test(q)) {
    return {
      query: q,
      primaryLens: 'secretary',
      mode: 'life',
      action: 'ask',
      searchNeed: 'no',
      executionSignal: false,
      clarify: null,
      reasons: ['emergency'],
    };
  }

  const executionVerb = EXECUTION_VERB_RE.test(q);
  const executionStrong = EXECUTION_STRONG_RE.test(q);
  const knowledgeSnippet = KNOWLEDGE_SNIPPET_RE.test(q);
  const mode: AgentMode = executionVerb && (executionStrong || !knowledgeSnippet) ? 'execution' : 'knowledge';
  if (LIFE_RE.test(q) && !executionVerb) {
    reasons.push('life');
  }
  if (mode === 'execution') reasons.push('execution');

  const action: AskCraftPlan = PLAN_RE.test(q) ? 'plan' : CRAFT_RE.test(q) ? 'craft' : 'ask';
  if (action !== 'ask') reasons.push(action);

  let searchNeed: SearchNeed;
  if (EMERGENCY_RE.test(q) || CHAT_ONLY_RE.test(q)) {
    searchNeed = 'no';
  } else if (SEARCH_MUST_RE.test(q) || executionStrong) {
    searchNeed = 'must';
  } else {
    searchNeed = 'ambiguous';
  }
  reasons.push(`search:${searchNeed}`);

  let primaryLens: AgentLens = 'secretary';
  if (ARCHITECT_RE.test(q)) {
    primaryLens = 'architect';
    reasons.push('architect');
  } else if (OWNER_RE.test(q)) {
    primaryLens = 'owner';
    reasons.push('owner');
  } else if (PRODUCT_RE.test(q)) {
    primaryLens = 'product_manager';
    reasons.push('product_manager');
  } else if (PM_RE.test(q)) {
    primaryLens = 'project_manager';
    reasons.push('project_manager');
  } else {
    reasons.push('secretary');
  }
  if (mode === 'execution' && primaryLens === 'secretary') {
    primaryLens = 'project_manager';
    reasons.push('execution_default_pm');
  }

  return {
    query: q,
    primaryLens,
    mode,
    action,
    searchNeed,
    executionSignal: mode === 'execution',
    clarify: detectClarify(q),
    reasons,
  };
}
