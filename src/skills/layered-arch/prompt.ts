/**
 * Skill: layered-arch 提示词构造（E364）
 * 生成：规则（分层容器/领域术语/核心层展开）+ 轻量 JSON 字段规范 + 一张完整目标样板
 * （example-freertos.json，few-shot「照着结构画，内容按用户描述改」）。
 * 修复：本地校验 issues 整份重出；救场：非法 JSON 只重出合法 JSON。
 */

const IRON_RULES = [
  '分层用「嵌套容器」表达归属，层间只画一条垂直连接线；禁止用跨层箭头表达「属于」、禁止交叉/绕行/斜线。',
  '自顶向下堆叠：应用/服务在最上，硬件/存储在最下；各层水平居中对齐，同层节点等宽等高由渲染器 flex 自动排开。',
  '节点写 name + detail（detail=实现/选型或核心职责 2-4 词）；核心层（如 FreeRTOS 内核）必须展开 5-8 个子组件（调度器/SysTick/队列/信号量/互斥/事件组/heap 等），禁止只写一句概括。',
  '每层 2-5 个节点、整图 3-6 层；超出就合并同类，宁精勿堆。',
  '先判断领域、术语必须匹配：嵌入式/MCU 用 任务/内核/ISR/HAL/驱动/外设/IPC（禁止 backend/message bus/service mesh 等 Web 词；队列/信号量/互斥量/事件组属于内核，不是中间件；中间件只放协议栈 LwIP/BLE、文件系统 FatFS、CLI/日志）；Web 后端用 网关/服务/DB/缓存/MQ/消费者/下游。',
  'connections 的 from/to 必须是相邻两层 id（自上而下），label 写接口/机制（OS API / HTTPS / gRPC / MQ / 中断 / DMA / 寄存器访问…），可为空字符串。',
  'rules 给 1-2 条该图最重要的设计红线（如 ISR 只调 FromISR 系列接口、同步走 HTTP/异步走 MQ）。',
] as const;

const SCHEMA_PROSE = [
  '输出一份 JSON 文件，字段如下（额外字段允许但渲染器忽略）：',
  '{',
  '  "meta": { "title": "图标题（必填）", "description": "一句话说明" },',
  '  "layers": [',
  '    { "id": "app", "name": "应用层", "subtitle": "可选层副标题", "order": 1, "highlight": false,',
  '      "nodes": [ { "id": "task_a", "name": "节点名", "detail": "可选节点说明", "role": "core" } ] }',
  '  ],',
  '  "connections": [ { "from": "上层id", "to": "相邻下层id", "label": "接口标注，可为空" } ],',
  '  "rules": ["底部关键规则，可选"]',
  '}',
  '- layers 按 order（或数组顺序）自上而下；id 全部小写英文。',
  '- highlight: true 标记核心层（渲染加粗边框）；节点 role: "core" 标记该层核心组件（实心强调）。',
] as const;

export function buildLayeredGenPrompt(query: string, exemplarText: string): string {
  const parts = [
    '你是资深系统架构师兼图表作者。请把用户的描述整理成一份「分层架构图」JSON（结构化数据 + 固定渲染器出图，禁止自动布局）。',
    '只输出一个 JSON 对象：不要 Markdown 代码块、不要任何解释文字。',
    '',
    '用户描述：',
    query,
    '',
    '## 分层图铁律',
    ...IRON_RULES,
    '',
    '## JSON 字段规范',
    ...SCHEMA_PROSE,
    '',
    '## 目标结构样板（照抄它的结构与完整度，不要照抄它的内容；内容按用户描述重写）',
    exemplarText.trim(),
    '',
    '现在输出 JSON：',
  ];
  return parts.join('\n');
}

export function buildLayeredFixPrompt(
  query: string,
  previousRaw: string,
  issues: string[],
  exemplarText: string,
): string {
  const parts = [
    '你上一版输出的「分层架构图」JSON 未通过本地校验，请只修正下列问题，整份重出完整合法的 JSON（字段与铁律同首次生成，不要解释文字）：',
    '',
    '用户描述：',
    query,
    '',
    '校验问题清单：',
    issues.map((issue) => `- ${issue}`).join('\n'),
    '',
    '上一版候选 JSON：',
    previousRaw,
    '',
    '结构样板参考：',
    exemplarText.trim(),
    '',
    '现在只输出修正后的完整 JSON：',
  ];
  return parts.join('\n');
}

export function buildLayeredRescuePrompt(query: string, previousRaw: string, reason: string): string {
  const parts = [
    `你上一版输出未通过 JSON 解析，错误：${reason}`,
    '请丢弃上一版输出，重新输出一个完整、合法的「分层架构图」JSON 对象：',
    '不要 Markdown 代码块、不要任何解释文字或 think 块，只输出 JSON。',
    '',
    '用户描述：',
    query,
    '',
    '上一版输出（前 2000 字符，仅对照用）：',
    previousRaw.slice(0, 2000),
    '',
    '现在重新输出 JSON：',
  ];
  return parts.join('\n');
}

/** 从模型输出里稳健取出 JSON 对象（剥 think 块/围栏，取首尾大括号） */
export function parseModelJson(raw: string): unknown {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // 落入围栏或夹带文字时取首尾大括号段
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('模型输出不是 JSON 对象');
  return JSON.parse(cleaned.slice(start, end + 1));
}
