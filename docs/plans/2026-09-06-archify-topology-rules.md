# 推进计划：Archify 架构图拓扑铁律 + 语义自检（E360）

> 日期：2026-09-06 · 分支：v0.2b · 状态：进行中
> 关联：owner 审阅 architecture-0906-192218.json——版式一次过 showcase 并出 HTML，但内容有拓扑硬伤：支付服务虚线直连订单库、订单服务没有连自己的库、库存服务死胡同、Redis/MQ/第三方渠道被 E357 裁进 cards。定位：validate 只查版式不查语义，「语义错但版式过」的图会直接交付。owner 拍板 A：先做 D0（拓扑铁律）+ D1（交付前语义自检），布局仍用 grid，暂不上「完整图档/工程级布局」。

## 目标

1. architecture 图不再输出「内容画错」的图：服务只连自己的库、有库的服务必须有到库的实线、回调/异步虚线终点必须是服务或 MQ、任何 backend 服务不得是死胡同。
2. 交付前本地确定性语义自检（无 LLM 也能抓）；不过时触发一次 LLM 语义修复；仍不过如实收据，不交付错图。

## 方案

### D0：prompt 内容层铁律（src/skills/archify/prompt.ts）

1. 「架构补全与假设」后新增「微服务拓扑铁律（architecture 内容正确性，优先级高于补全规则）」：
   - 数据库归属：每个服务只能连自己的库，严禁 A 服务直连 B 服务的库。
   - 命名规约：服务与其独占库同前缀 id（order-svc ↔ order-db；stock-svc ↔ stock-db），便于人图对应与本地自检。
   - 主链路完整：有自己库的服务必须画一条实线边连到自己的库（如 订单服务 --读写--> 订单数据库）。
   - 异步归服务/MQ：所有「结果/回调/通知」类虚线边终点必须是 MQ 或发起方/业务服务，严禁指向数据库。
   - 叶子检查：任何 backend 服务不得只有入边没有出边（库存服务 → 库存库或外部渠道才算闭环）。
2. 消除规模数字矛盾：COMMON_RULES「主节点不超过 12 个」改为「以本图型纪律为准（architecture 组件 ≤7、连线 ≤8），未另作规定的图型主节点 ≤12」。
3. 新增 buildSemanticRepairPrompt(query, type, candidate, issues, opts)：携带语义问题清单，要求按拓扑铁律整份重出合法 JSON。

### D1：本地语义自检 + 修复链（src/skills/archify/semantics.ts + index.ts 接入）

- checkArchitectureSemantics(obj) → { ok, issues: string[] }，仅 architecture 且存在 database 组件时启用：
  - 孤儿库：database 没有任何入边。
  - 跨写库：backend 服务直连非自己（按命名规约同前缀判定）的 database。
  - 漏连自己的库：database 只被非归属服务连接、归属服务却没连它。
  - 回调落库：variant=dashed 且 to 是 database。
  - 死胡同：backend/messagebus 服务没有任何出边。
- index.ts 时序：validate+版式修复轮（现有）收敛后 → 语义自检 → 不合格则一次 LLM 语义修复 → 再 validate（不劣化才接受）→ 仍不合格走 0.35 收据（列出语义问题 + JSON 路径，不 deliver）；合格才进 E359 本地救援/交付。语义修复输出 parse 失败或版式劣化则回滚。

## 测试与验收

- semantics.test.ts：5 条规则各自命中 + 干净样本全过。
- prompt.test.ts：E360 断言 architecture 生成提示含「拓扑铁律」条目与「同前缀」命名规约；buildSemanticRepairPrompt 含 issues。
- index.test.ts：新增 E360 集成——生成含拓扑错（pay→order-db 虚线）→ 语义修复 LLM 改对 → 正常交付；语义修复后仍错 → 0.35 收据、不交付 HTML。
- npm run build 绿；定向单测绿；npm run doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0，测试全 Fake）。
- 手动（owner）：重启 gateway 后 5173 重发「画个订单系统的系统架构图」——应出 7 组件左右、订单服务实线连订单库、回调指向服务/MQ 的正确闭环图。

## 执行过程

### 改动

- D0 `src/skills/archify/prompt.ts`：TYPE_GUIDE.architecture 增「拓扑铁律」五条（服务只连自己的库、服务-库 id 同前缀命名规约、有库服务必须有实线连库、回调/通知虚线终点必须是 MQ 或服务、叶子检查）；COMMON_RULES「主节点不超过 12」改为「以本图型纪律为准（architecture ≤7/≤8）」消除数字矛盾；新增 buildSemanticRepairPrompt（携带语义问题清单）。
- D1 `src/skills/archify/semantics.ts`（新模块）+ `index.ts` 接入：validate/版式修复轮收敛后做语义自检（孤儿库 / 跨写库 / 归属库漏连 / 异步虚线落库 / 服务死胡同，仅 architecture 且含 database 时启用）；不合格触发一次 LLM 语义修复再 validate（不劣化才接受、劣化回滚），仍不合格走 0.3 收据（语义问题清单 + JSON 路径），不交付错图。
- 测试：semantics.test.ts 4 条；prompt.test.ts +1（铁律/命名规约/语义修复提示）；index.test.ts +2（语义修复后正常交付；仍错 → 0.3 不交付）。

### 遇到的问题

- 语义修复后仍应做版式 validate，且「语义改对版式劣化」要回滚，避免修语义拆坏版式。
- 教训：validate 不查语义，语义错但版式过的图会被直接交付——本轮加语义自检后该面被堵死。

## 结果

- `npm run build` 绿；archify 定向 26/26（semantics 4 + prompt 7 + index 10 + layout-rescue 2 + render 3）；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0，测试全 Fake）。
- 现状：architecture 图交付前必经本地语义自检；拓扑错会触发一次 LLM 语义修复，仍不过如实 0.3 收据，不再输出「支付服务直连订单库/主数据无家/库存死胡同」这类错图。
- 待 owner 重启 gateway 后 5173 复测「画个订单系统的系统架构图」。

