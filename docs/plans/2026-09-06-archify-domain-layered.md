# 推进计划：Archify 领域自适应分层方法论（E363）

> 日期：2026-09-06 · 分支：v0.2b · 状态：完成（未提交，待 owner 复测）
> 关联：owner 审阅通用版「Archify Skill Prompt」（领域无关）并拍板「按你的建议推进」——把「先识别领域 → 按领域分层 → 节点两段式 → 边标交互机制 → 完整性自检」的通用方法论落地为 architecture 生成提示；不新建触发式 Skill，也不塞进全局 System Prompt（会污染秘书/产品经理等其他角色）。

## 现象 / 目标

- owner 对比其他 Agent 的工程「标准」图与我们的 architecture-0906-203506：拓扑已修对（E360 生效），差距在「信息密度与组织方式」——① 无分层泳道（散点布局，视线没有从上到下的流动感）；② Redis 缺失（≤7 组件上限把缓存挤掉了）；③ 节点只有名称、没有选型/职责；④ 边无协议/机制标注；⑤ 无设计原则注释。
- 目标：只改 `src/skills/archify/prompt.ts` 的 `TYPE_GUIDE.architecture` 与 `prompt.test.ts`，不碰 semantics/layout-rescue/index 链路。

## 方案

- 生成提示新增「领域分层方法论（E363）」5 条（插在 grid/type 基础句之后）：
  1. 先识别领域再画 3-6 条自上而下的层泳道，领域层候选给出 互联网后端 / 嵌入式·RTOS / 云原生·K8s / AI 系统 / 其他按惯例；
  2. 层泳道 = boundaries（kind: region，label 带「层」）+ 该层组件共占同一 grid row（row 随层自上而下递增），主链路竖着贯穿相邻层；
  3. 节点两段式：label=职责名、sublabel=实现/选型·核心职责（硬件用 type: external），禁止只写节点名；
  4. 边 label=动作+协议/原语（HTTPS / MQ(dashed) / 中断 / DMA / 系统调用 / 事件），同列相邻层竖向短跳主链可省略 label 防互压；
  5. 规模由离线 showcase 0 诊断黄金样例定调（web 订单 8 组件/4 泳道/7 连线、RTOS 8 组件/4 泳道/6 连线）：组件 ≤8、连线 ≤8、每层 1-3 个组件，layout 建议 cols 4 / gapY 70。
- 组件上限 ≤7 → ≤8 三处同步：COMMON_RULES「数量克制」、TYPE_GUIDE「单图规模纪律」、生成提示「展开幅度」（消除 Redis 越界的矛盾）。
- boundaries 原「需要体现区域/信任边界时才给」改为「region 泳道默认必给；security-group 只在表达信任边界时加，且不与泳道互相嵌套」。
- E357 规模/连线纪律、E360 拓扑铁律、E362 反平行铁律保留在方法论之上；E363 只动生成提示文本 + 测试断言。

## 测试与验收

- prompt.test.ts：E357 上限断言 ≤7 → ≤8；新增 E363 断言——生成提示含 领域分层方法论 / 层泳道用 boundaries 表达 / 下游消费者层 / 嵌入式·RTOS / sublabel=实现/选型 / 动作 + 协议/原语 / 组件 ≤8、连线 ≤8。
- 离线（先行验证、已通过）：`data/_e363/web-order-B-nolabel.json`、`data/_e363/rtos-E2.json` 走真实 showcase validate 均 0 诊断，作为提示措辞依据；样例不留档（data/_e363 用后即删）。
- `npm run build` 绿；archify 定向 32/32（prompt 9/9 新增 1，index 11、layout-rescue 5、semantics 4、render 3 回归不破）；`npm run doc-lint` 0 FAIL 0 WARN；零外部 LLM（¥0，测试全 Fake）。
- 手动（owner）：重启 gateway 后 5173 短问「画个订单系统的系统架构图」——期望分层泳道 + Redis + 两段式节点；再问嵌入式类（如 FreeRTOS/RTOS 分层架构）验证领域自适应不串台。

## 执行过程

- `src/skills/archify/prompt.ts`：cap 3 处 ≤7→≤8；components 基础句后插入 E363 5 条；boundaries 可选句改写。
- `src/skills/archify/prompt.test.ts`：E357 断言改 ≤8；新增 E363 测试。
- 验证：build 绿；定向 32/32；doc-lint 0 FAIL 0 WARN。

## 结果

- 现状：architecture 生成提示从「版本式草图纪律」升级为「领域分层 + 两段式节点 + 边协议标注」的工程图方法论，cap 与黄金样例一致（8 组件/4 泳道可过 showcase）。
- 待 owner 复测 web 与嵌入式两种问法；未提交（统一提交时机由 owner 定）。
