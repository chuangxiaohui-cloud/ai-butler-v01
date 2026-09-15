/**
 * Skill: archify 提示词构造（E352）
 * 生成提示：用户描述 + 选定图型的 schema/common + 一个官方示例（仅示范字段形态），
 * 让主模型输出一张全新 typed JSON IR。修复提示：候选 + 校验诊断（含 supportedFixes）。
 * schema/示例均来自 vendor 目录，随 vendor 一起升级、无需手工抄字段。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ArchifyDiagnostic, ArchifyQuality, ArchifyType } from './render.js';

export const ARCHIFY_TYPE_LABEL: Record<ArchifyType, string> = {
  architecture: '系统架构图',
  workflow: '流程图（Workflow）',
  sequence: '时序图',
  dataflow: '数据流图',
  lifecycle: '生命周期/状态图',
};

const TYPE_EXAMPLE: Record<ArchifyType, string> = {
  architecture: 'brand-aware-delivery.architecture.json',
  workflow: 'release-delivery.workflow.json',
  sequence: 'async-job-roundtrip.sequence.json',
  dataflow: 'event-stream.dataflow.json',
  lifecycle: 'deployment-release.lifecycle.json',
};

const TYPE_GUIDE: Record<ArchifyType, string> = {
  architecture:
    '- architecture 用 grid 自动排版：meta 旁给 layout = {"mode":"grid","cols":3,"gapX":60,"gapY":80,"cellW":150,"cellH":60}（可微调列数）。\n' +
    '- components 只给 row/col（从 0 起），不要给 pos/size。component.type 枚举：frontend|backend|database|cloud|security|messagebus|external。\n' +
    '- 领域分层方法论（E363，最高优先级）：落网格前先把用户描述归类到领域，按该领域公认分层画 3-6 条自上而下的「层泳道」（泳道名以「层」结尾），不要散点摆节点；层里不要出现与该领域无关的组件/层名（如嵌入式图不画「客户端层/浏览器」）。领域层候选——互联网后端：客户端层/接入层（API 网关）/业务服务层/数据与中间件层/下游消费者层；嵌入式·RTOS：应用层/内核与中间件层/驱动·HAL 层/硬件层；云原生·K8s：流量入口层/编排·工作负载层/存储与中间件层/可观测·运维层；AI 系统：数据层/训练与推理层/服务与网关层/监控·评测层；其他领域按该领域公认惯例推断。\n' +
    '- 层泳道用 boundaries 表达（默认必给，不是可选）：每层一个 boundaries（kind: region，label=层名，wraps=该层全部组件 id）；同一层的组件放在同一 grid row（同层左右并排），row 随层自上而下递增，让主链路竖着贯穿相邻层；缓存/消息队列/数据库归「数据与中间件层」，不要散放在层外。\n' +
    '- 节点两段式：label=职责名，sublabel=实现/选型·核心职责（2-4 词）；例：label「订单服务」sublabel「Java · 下单/状态机」、label「MCU 硬件」sublabel「Cortex-M · 外设」（硬件用 type: external，无 hardware 类型）；禁止整张图只写节点名不写职责。\n' +
    '- 边 label = 动作+交互机制：语义相关边标「动作 + 协议/原语」，如 下单请求 HTTPS / 支付回调 MQ（dashed）/ 调度·中断 / DMA·寄存器 / 系统调用 / 事件·消息；同一列上下相邻层的竖向主链路短跳可省略 label（标签会挤进节点间隙，黄金样例即如此处理），label 优先留给水平边与跨层长边。\n' +
    '- 规模与 layout（黄金样例定调：web 订单 8 组件/4 泳道/7 连线、RTOS 8 组件/4 泳道/6 连线，均 showcase 0 诊断）：组件 ≤8、连线 ≤8；每层 1-3 个组件、层数 3-6；layout 建议 {"mode":"grid","cols":4,"gapX":60,"gapY":70,"cellW":160,"cellH":60}（组件多时可把 cols 放宽到 ≤6、cellH 55-60）。\n' +
    '- 排布原则：让连线尽量发生在上下相邻行、左右相邻空档之间，避免一条直线穿过不相关组件；同排隔列的两个组件连线会被中间组件挡住，请改成上下布局或绕行。\n' +
    '- 单图规模纪律：组件 ≤8、连线 ≤8；不必填满每行每列，cols 可调小并留空列/空行当走线通道，避免出现「三连成一排、中间节点被直连线穿过」。\n' +
    '- 连线纪律：同一对节点尽量只画一条线，往返语义合并为一条（label 如「扣款/回调」），回程/异步用 variant: dashed；不要在同一通道画两条走向相反的线（标签会叠在一起被判重叠）；扇出型组件（消息队列/缓存/外部渠道）放行首或行尾，不要夹在两条直连节点之间。\n' +
    '- 反平行铁律（E362）：即使两条消息语义不同（如「发布事件/支付回调」），同一对节点也禁止保留两条方向互反的连线——必须合并为一条双向虚线：label 用「/」并列两侧语义（如「发布事件/支付回调」），任一侧为异步/回程则整条 variant: dashed。\n' +
    '- 多下游错走廊：同一服务的多个下游（专属库/消息队列/缓存/外部渠道）不要全排在正下方同一列，尽量左右分侧或错列放置，避免多条竖线挤在同一通道导致标签互压。\n' +
    '- 只在额外表达信任边界（内网/公网隔离、DMZ、租户隔离）时才加 boundaries（kind: security-group，wraps 为组件 id 数组），标题简短；security-group 不要与上面的 region 泳道互相嵌套包裹造成歧义。\n' +
    '- 拓扑铁律（内容正确性，优先级高于补全/克制规则）：每个服务只能连自己的库，严禁 A 服务直连 B 服务的库（跨服务直连数据库是反模式）。\n' +
    '- 命名规约：服务与其独占库的 id 同前缀（order-svc ↔ order-db、stock-svc ↔ stock-db），便于人图对应与本地自检。\n' +
    '- 主链路完整：有自己库的服务必须画一条实线边连到自己的库（如 订单服务 --读写--> 订单数据库）；主数据不得「无家可归」。\n' +
    '- 异步归服务/MQ：「支付结果/回调/通知」类虚线边终点必须是 MQ 或业务服务，严禁指向数据库。\n' +
    '- 叶子检查：任何 backend 服务不得只有入边没有出边（库存服务必须有 →库存库 或 →外部渠道 等下游才闭环）。\n',
  workflow:
    '- workflow 用 schema_version: 2 的泳道 × 列可读布局：lanes 定义泳道（3-4 条）；nodes 每个带 lane + col（0-5 整数）+ type + label；edges 只给 from/to/label（可加 variant/role），不要给坐标。\n' +
    '- 用 mainPath 标出主路径（按执行顺序排列的节点 id）；col 表示阶段列，同一步骤内的节点放同一 col。\n' +
    '- 分支/回退用 role: branch / return / error；需要表达审批/安全门时把相关节点放进独立泳道。\n',
  sequence:
    '- sequence：participants 给出参与方（id/type/label），messages 描述往返消息。\n' +
    '- 每条 message 必填 y（时间轴坐标，整数）：从约 140 起，按阅读顺序每次递增 38-52，返回消息比请求消息略低即可；视消息条数把 meta.viewBox 高度设为最后一个 y + 120。\n' +
    '- 返回消息 variant 用 "return"；异步/旁路消息用 "dashed"；默认正向调用不写 variant。\n' +
    '- activations 可选；给出时 from/to 与对应消息的 y 对齐。\n',
  dataflow:
    '- dataflow：stages 是从左到右的阶段列（label 即可）；nodes 每个带 stage（列序号）+ row（行序号，0 起）+ type + label；flows 每条必填 from/to/label（可加 classification/variant），不给坐标。\n' +
    '- 数据敏感路径（PII/权限门）用 variant: security；批量/异步用 dashed；主数据路径用 emphasis。\n' +
    '- 不要把两条无关数据流挤在同一行通道上；需要跨多行时可加 row。\n',
  lifecycle:
    '- lifecycle：lanes 1-4 条（主流程 + 等待/中断 + 恢复 + 终态），states 每个带 type（start|active|waiting|decision|success|failure|neutral|external）+ lane + col（0-4 整数）+ label，可加 sublabel/step 序号；transitions 只给 from/to/label/route（默认 auto），不给坐标。\n' +
    '- 主路径放同一条 lane 并让 col 递增；失败/取消/过期等终态放独立 lane，避免回指主流程造成环。\n',
};

const COMMON_RULES = [
  '只输出一个 JSON 对象：不要 Markdown 代码块、不要任何解释文字。',
  '必须完全遵守下方 schema（additionalProperties 为 false，多出的键会被判非法）。',
  'meta 只保留 schema 允许的键：title 用简短标题；quality_profile 固定为 "showcase"；不要写 meta.output（文件名由系统生成）；不要写 animation/views 等可选装饰。',
  '全新创作：id 用英文小写短标识；文案与结构来自用户描述，不得照抄示例里的组件、连线与事实（示例只示范字段怎么写）。',
  '数量克制：以本图型特有纪律为准（architecture：组件 ≤8、连线 ≤8）；未另作规定的图型主节点不超过 12 个；连线标签尽量短（中文 ≤ 10 字）；补充说明放 cards（dot 取 cyan|emerald|violet|amber|rose|orange|slate，title + items）。',
  '先只用默认自动路由，不加 fromSide/toSide/via/labelAt/channelX/channelY/labelDx/labelDy 等几何控制字段；若修复轮要求修某条具体连线，一次只采纳一条诊断的建议并整份重出完整 JSON。',
] as const;

export interface ArchifyPromptOptions {
  vendorDir: string;
  /** 显式质量档；缺省 showcase */
  quality?: ArchifyQuality;
}

function readJson(relPath: string, vendorDir: string): string {
  return readFileSync(join(vendorDir, relPath), 'utf8');
}

/** 组装首次生成提示词（单次主模型调用，产出 typed JSON IR） */
export function buildGenerationPrompt(
  query: string,
  type: ArchifyType,
  { vendorDir, quality = 'showcase' }: ArchifyPromptOptions,
): string {
  const schema = readJson(`schemas/${type}.schema.json`, vendorDir);
  const common = readJson('schemas/common.schema.json', vendorDir);
  const example = readJson(`examples/${TYPE_EXAMPLE[type]}`, vendorDir);
  const parts = [
    `你是资深系统架构师兼 Archify 图表作者。请把用户的描述整理成一张「${ARCHIFY_TYPE_LABEL[type]}」的 typed JSON IR，类型固定为 ${type}（${quality} 质量档）。`,
    '',
    '用户描述：',
    query,
    '',
    ...COMMON_RULES,
    '',
    '## 架构补全与假设（内容层）',
    '- 用户描述是草图输入：先当架构师理解意图再落 JSON，短句（如「订单系统」「发布流程」）也要展开成可讨论的层次/阶段/主路径，不要只把关键词映射成节点。',
    '- 展开幅度（内容完整但克制）：高流量/对外/写密集场景默认考虑 API 网关、缓存、消息队列、读写分离等常用件，但每张图只放与主链路直接相关的 2-3 件，其余写进 cards「假设：…可单独成图」；流程/发布类默认覆盖 构建→测试→发布（预发/灰度）→上线→监控 的完整闭环；系统架构图单张核心组件 ≤8、连线 ≤8，其余图型以可读为先。',
    '- 用户说「简单/单体/内部工具/个人项目」等限制时不要堆常用件；用户点名或点名排除的组件严格照办。',
    '- 所有替用户补的内容必须可见可撤：集中写进 cards，条目以「假设」开头（例：假设系统为高流量在线交易，已补 API 网关/Redis 缓存/消息队列；不需要可在下轮删除）。',
    '- 只画本提示指定的一种图型；用户描述里混入的其他图型主题（流程/时序/状态等）不要并入本图，最多在 cards 提一句「可单独成图」。',
    '- 不编造具体技术品牌/协议；需要举例时用通用名（缓存/消息队列/对象存储）或标注「示例」。',
    `## ${type} 特有编排要求`,
    TYPE_GUIDE[type],
    '',
    '## JSON schema（必须遵守）',
    schema,
    '',
    '## 共用定义',
    common,
    '',
    '## 字段形态参考示例（仅看字段形状，勿复制内容）',
    example,
    '',
    '现在生成 JSON：',
  ];
  return parts.join('\n');
}

/** 组装修复提示词（携带校验诊断，让模型按 supportedFixes 整份重出 JSON） */
export function buildRepairPrompt(
  query: string,
  type: ArchifyType,
  candidate: string,
  diagnostics: ArchifyDiagnostic[],
  { vendorDir, quality = 'showcase' }: ArchifyPromptOptions,
): string {
  const parts = [
    `你上一版为「${ARCHIFY_TYPE_LABEL[type]}」生成的 JSON IR 未通过 Archify 校验（${quality} 档）。`,
    '请只修正下列诊断命中的对象，尽量不动无关结构；一次最多只应用一条诊断的 supportedFixes（诊断已给具体修复值就照抄）；修复后整份重出完整 JSON。',
    '',
    '用户描述：',
    query,
    '',
    '校验诊断（severity、code、message、subject、supportedFixes）：',
    JSON.stringify(diagnostics, null, 2),
    '',
    '上一版候选 JSON：',
    candidate,
    '',
    '现在只输出修复后的完整 JSON：',
  ];
  return parts.join('\n');
}


/** E360：内容语义问题（拓扑铁律违反）的修复提示——Archify 校验不查语义，需提示词显式要求修正 from/to/组件归属。 */
export function buildSemanticRepairPrompt(
  query: string,
  type: ArchifyType,
  candidate: string,
  issues: string[],
  { quality = 'showcase' }: ArchifyPromptOptions,
): string {
  const parts = [
    `你为「${ARCHIFY_TYPE_LABEL[type]}」生成的 JSON IR 有内容语义问题（版式校验不查这类错误）：`,
    '请按「微服务拓扑铁律」逐条核对组件归属与连线方向，修正后整份重出完整合法的 JSON（字段要求同首次生成，不要解释文字）。',
    '',
    '用户描述：',
    query,
    '',
    '语义问题清单：',
    issues.map((issue) => `- ${issue}`).join('\n'),
    '',
    '上一版候选 JSON：',
    candidate,
    '',
    '现在只输出修正后的完整 JSON：',
  ];
  return parts.join('\n');
}
/** E356：生成输出非法 JSON 的救场提示——携带错误与上一版输出，让模型只重出合法 JSON。 */
export function buildRescuePrompt(
  query: string,
  type: ArchifyType,
  previousRaw: string,
  reason: string,
  { quality = 'showcase' }: ArchifyPromptOptions,
): string {
  const parts = [
    `你为「${ARCHIFY_TYPE_LABEL[type]}」生成的 JSON IR 未通过 JSON 解析，错误：${reason}`,
    '请丢弃上一版输出，重新输出一张完整、合法的 JSON 对象（图型与字段要求同首次生成）：',
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
