# 2026-09-06 交接

## 讨论轮：E364 方向收敛——参考图非 Archify，拟切「分层框架图」自研渲染通道（未开工）
- 现象：owner 复测短问「画一个嵌入式 FreeRTOS 系统框架图」——我方 `outputs/archify/architecture-0906-213703.json` 过 showcase 0 诊断、HTML 可交付，但对照参考图仍「差亿点点」；owner 将参考 Agent 产物放进 `outputs/archify/FreeRTOS系统框架图.{json,html}` 供客观对比。
- 关键发现：参考 JSON 不是 Archify typed IR——是自定义分层结构（meta.canvas/colorScheme + `layers[].nodes{name,detail}` + 层间 connections + rules），HTML 仅 5KB 手写 CSS 整宽泳道图。即参考图本质是「结构化 JSON + 固定模板布局（flex 按层序推导几何）→ HTML」，不是通用图引擎产物；我方却用 Archify（自动路由/品牌样式/lint 约束/8 组件上限）硬模仿，方向性错配。内容差距另来自缺少领域样板：参考含 4 个应用任务 / 8 个内核细分 / 5 个驱动，我方仅 6 个泛化节点。
- 讨论收敛：拟按 E364 落地「分层框架图」通道——模型只输出轻量分层 JSON（层名 + 节点{名,细节} + 层间连线{标签} + 底部原则），本地校验语义（如嵌入式必含 ISR/中断、IPC 归内核不归中间件），本地确定性渲染成参考风格整宽泳道 HTML（面板 iframe 显示）；领域黄金样板（嵌入式 5 层 / 订单 5 层）few-shot 注入；不再走 Archify 图引擎，消灭 lint/救援/0.3/0.35 链条。
- 待 owner 决策：范围 A（仅「框架图/分层架构图」类，其余图型继续 Archify）vs B（架构图全部切换）；owner 暂停思考，下一轮再定开工。本轮零代码改动。

## 追加轮：E363 Archify 领域自适应分层方法论（owner 审阅通用版 Archify Prompt 后拍板「按你的建议推进」）
- 计划：docs/plans/2026-09-06-archify-domain-layered.md
- 现象：owner 对比其他 Agent 工程「标准」图与 architecture-0906-203506：拓扑已对（E360 生效），差距在信息密度/组织方式——无分层泳道（散点布局）、Redis 被 ≤7 上限挤掉、节点只有名称、边无协议标注、无设计原则 footer；并给出领域无关的通用版 Archify Skill Prompt（先识别领域 → 按领域分层 → 节点两段式 → 边标交互机制）。
- E363：不新建 Skill、不进全局 System Prompt，只并入 `src/skills/archify/prompt.ts` 的 TYPE_GUIDE.architecture 顶部「领域分层方法论」5 条——识别领域后按该领域 3-6 层泳道（boundaries region + 同一 grid row 自上而下）、节点 label+sublabel（sublabel=实现/选型·核心职责，硬件 type external）、边 label=动作+协议/原语（竖向短跳可省略防互压）、规模上限由离线 showcase 0 诊断黄金样例（web-order / rtos-E2 各 8 组件/4 泳道）定调为组件 ≤8/连线 ≤8；组件上限 ≤7→≤8 三处同步；boundaries 句改「region 泳道默认必给、security-group 可选不嵌套」；E357/E360/E362 铁律保留。
- 验证：npm run build 绿；archify 定向 32/32（prompt 9/9 新增 E363 1 条，index 11、layout-rescue 5、semantics 4、render 3 回归不破）；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0，测试全 Fake）。
- 待 owner 复测：重启 gateway 后 5173 短问「画个订单系统的系统架构图」→ 期望分层泳道 + Redis + 两段式节点；再问嵌入式类（如 FreeRTOS 架构）验证领域自适应不串台。

## 追加轮：E362 Archify 反平行双线本地合并 + 提示铁律（owner 复测 E361：201054 仍 0.35 后按 C+B 拍板）
- 计划：docs/plans/2026-09-06-archify-merge-antiparallel.md
- 现象：E361 复测短问「画个订单系统的系统架构图」→ architecture-0906-201054.json 语义全对（E360 生效）但版式仍剩 8 条 label-route-clearance（order⇄mq 同走廊反平行双线「发布事件/支付回调」+ order-db 边挤同一竖走廊，3 标签互压），与 195729 同病。定位：E357 提示只是「尽量」挡不住模型产反平行双线；该类诊断 message 不带数值建议、code 又不在 trouble 集合，E359/E361 都无杠杆 → 原封 0.35。
- E362：B（prompt.ts）TYPE_GUIDE.architecture 追加强制句——同一对节点禁止两条方向互反连线、语义不同也合并为一条双向虚线（label 用「/」并列如「发布事件/支付回调」、异步/回程整条 dashed）+「多下游错走廊」；C（layout-rescue.ts）新增 findImplicatedAntiPair/mergeImplicatedAntiPair（被同一条 label-route-clearance 诊断点名两个 label 的反平行对 → 保留正向、合并 label/dashed、删反向线，validate oracle，不改善回滚不重试）；标签建议从每连接一次改可重用（上限 3）；troubleComponentIds 新增 label-route-clearance（message 解析两段连接端点入可挪位集合）。
- 验证：npm run build 绿；archify 定向 31/31（layout-rescue 5/5、prompt 8/8，新增 E362 各 3/1；index 11/11 回归不破）；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0，测试全 Fake）。
- 待 owner 重启 gateway 后 5173 复测「画个订单系统的系统架构图」：期望不再出同走廊反平行双线；模型仍产出时本地救援先合并再交付/收据，不再原封 0.35。
## 追加轮：E361 Archify 语义修复后补 LLM 布局修复轮（owner 复测 0.35：语义已对、版式 10 条诊断后按 A 拍板）
- 计划：docs/plans/2026-09-06-archify-layout-repair-after-semantics.md
- 现象：architecture-0906-195729.json 语义已完全正确（E360 生效），但版式剩 10 条诊断（order⇄mq 同通道双向虚线 label 重叠、多条连线横穿组件）；本地救援只能交换/挪组件，做不了「合并往返双线」这类需要 LLM 的重排；且语义修复候选若版式劣化会被回滚到「语义又错」版本。
- E361：index.ts 把版式修复 while 抽成可重入 repairRoundOnce（architecture 候选先过 checkArchitectureSemantics 语义守卫）；首次修复改 for 循环；E360 语义修复候选不再回滚（版式劣化交给后续轮）；新增 2.6 段——语义达标但版式仍 !ok 时继续 ≤maxRepairRounds 轮 LLM 布局修复，全失败才进 E359 本地救援。
- 验证：npm run build 绿；archify 定向 27/27（index.test 11/11，新增 E361 集成：gen 语义错→语义修复→版式 fail→补布局轮交付，3 次 LLM 调用、提示分别含「拓扑铁律」「layout/constraint」）；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0）。
- 待 owner 重启 gateway 后 5173 复测「画个订单系统的系统架构图」：语义修复后若仍出版式诊断会自动多修 ≤2 轮，不再直接 0.35。
## 追加轮：E360 Archify 架构图拓扑铁律 + 交付前语义自检（owner 审阅 192218 错图后按 A 拍板）

- 计划：docs/plans/2026-09-06-archify-topology-rules.md
- 现象：architecture-0906-192218.json 版式一次过 showcase 并出 HTML，但内容画错——支付服务虚线直连订单库、订单服务没连自己的库、库存服务死胡同；validate 只查版式不查语义，「语义错但版式过」的图被直接交付（比 0.35 失败更隐蔽）。
- D0（prompt.ts）：TYPE_GUIDE.architecture 增「拓扑铁律」五条（服务只连自己的库 / 服务-库 id 同前缀 / 有库服务必须实线连库 / 回调虚线终点必须是 MQ 或服务 / backend 不得死胡同）；COMMON_RULES 数量上限改为「以本图型纪律为准」消除 ≤12 与 ≤7 矛盾；新增 buildSemanticRepairPrompt。
- D1（semantics.ts 新模块 + index.ts 接入）：本地确定性语义自检（孤儿库/跨写库/归属库漏连/异步虚线落库/服务死胡同，仅 architecture 且含 database 时启用）→ 不合格一次 LLM 语义修复 → 再 validate（不劣化接受、劣化回滚）→ 仍不合格 0.3 收据列问题、不交付错图。
- 验证：npm run build 绿；archify 定向 26/26（semantics 4 新 + prompt 7 + index 10 + layout-rescue 2 + render 3）；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0，测试全 Fake）。
- 待 owner 重启 gateway 后 5173 复测「画个订单系统的系统架构图」：应出订单服务实线连订单库、回调指向服务/MQ 的正确闭环图；拓扑错会被自动语义修复或如实 0.3 收据。
## 追加轮：E359 Archify 架构图本地确定性版式救援（owner 复测 9 组件样本仍 0.35 后按 A 拍板收口）

- 计划：docs/plans/2026-09-06-archify-layout-rescue.md
- 现象：E357 后短问「画个订单系统的系统架构图」样本 architecture-0906-181757（9 组件 8 连线 3×3 网格）showcase 校验失败、修复 ≤2 轮不收敛 → 0.35 只会如实收据，把接近可交付的图直接判死，无本地救回手段。
- E359：新增 src/skills/archify/layout-rescue.ts 本地确定性版式救援（无 LLM、无外部调用）——LLM 修复轮穷尽后仍不过且 type=architecture 时：降 standard + grid 至少留 1 空列绕行；按诊断 message「照抄」labelAt [x,y]/labelDy ±N；endpoint-side-direction 照抄推断 side 显式写 fromSide/toSide；对 trouble 组件（from/to/障碍件）有界交换/空位移动、validate 作 oracle（默认 ≤36 次，只接受通过或诊断下降、允许少量持平侧移）；通过则按 standard 档 deliver（confidence 0.72、回复注明「本地版式救援」），仍不过才走既有 0.35 收据（残留诊断 + JSON 路径保留）。index.ts 接入 rescueArchitectureLayout，交付/收据用 activeQuality 区分。
- 验证：npm run build 绿；archify 定向测试 10/10（layout-rescue 2 + index 8，index 新增 E359 集成：修复不收敛→本地救援 standard 通过交付 HTML、quality=standard、conf 0.72）；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0，测试全 Fake）。
- 结果/收口：真实 9 组件样本本地救援 validate 40 次后仍剩 3 条顽固诊断（endpoint-side-direction c3 + edge-through-node c8 order→cache 竖穿 mq），持平侧移耗尽不收敛——属组合几何难题，按 owner「A」决策收口：不再扩搜索/退火调参，失败如实 0.35 收据（含残留诊断 + JSON 路径 +「简化成更小图」指引）。常见 label/端点方向/竖穿类诊断已可本地按 standard 救回。

## 追加轮：E358 Archify 生成提速——medium v4-flash + maxTokens 4000（owner 复测 90s 超时收据后按 A 拍板）

- 计划：`docs/plans/2026-09-06-archify-gen-latency.md`
- 现象：短问「画个订单系统的系统架构图」复测出现第三种失败面——0.3 收据 `LLM fallback 链总预算 90000ms 超时`（JSON 未坏、版式未判，生成调用 90s 没跑完）。
- 定位：archify 生成默认走 heavy 档 deepseek-v4-pro（E238），一次最多 6000 token JSON，大输出 + think 块偶发 >90s；与 E283 github-reader / E343 xmind-outline 同病（契约式输出用不上推理档）。
- E358：`createSkillCompleteClient` 加 `archify` 分支 → medium v4-flash + per-call [P-122] 90s（timeoutMs 同步放宽）；`src/skills/archify/index.ts` 生成/救场/修复 `maxTokens` 6000→4000。JSON 版式仍本地 validate/repair 兜底。
- 验证：`npm run build` 绿；llm.test 8/8 + archify index.test 7/7（生成+修复、救场均断言 maxTokens=4000）+ prompt.test 6/6；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0）。

## 追加轮：E357 架构图单图规模/布线纪律（owner 复测 0.35 收据后按 A 拍板）

- 计划：`docs/plans/2026-09-06-archify-clean-layout.md`
- 现象：短问「画个订单系统的系统架构图」复测已过 E356 JSON 阶段，进入 0.35——JSON 合法但未过 showcase 版式校验（剩 7 条 clean-flow 诊断），修复 ≤2 轮未收敛、不交付 HTML。
- 定位：E355 展开幅度「8-12 组件」把单图撑成 10 组件 11 连线密集网格，自动布线结构性无解；对照成功样本为 6 组件 6 连线近邻布局一次过。
- E357（最小，只动 `src/skills/archify/prompt.ts` 生成提示 + 1 条 prompt 测试）：单图组件 ≤7/连线 ≤8、留空列行走线通道、往返合并一条线（回程 `variant: dashed`）、扇出组件放行尾不夹在两直连节点之间；常用件每图只放与主链路直接相关的 2-3 件、其余 cards「可单独成图」。
- 验证：`npm run build` 绿；prompt.test 6/6（新增 E357）+ index.test 7/7 回归；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0）。

## 早前轮：E356 JSON 救场 + E355 L1 提示补全 + E354 HTML 面板看图（E352/E353 同批）

- 计划：`docs/plans/2026-09-06-archify-json-rescue.md`、`2026-09-06-archify-l1-prompt.md`、`2026-09-06-html-panel-preview.md`；Archify/CodeGraph 见 2026-09-06-archify-skill / 2026-09-06-codegraph-enable
- E356（本轮新增，因 owner 短问报 JSON 解析失败）：`src/skills/archify/prompt.ts` + `buildRescuePrompt`；`index.ts` 生成段 parse 失败救场一次（≤2 次调用），仍失败才 0.3 收据。
- E355 Archify L1：生成提示增「架构补全与假设」——模型先当资深架构师展开短句、补常用件/完整闭环、补全写 cards「假设」、单图型纪律。
- E354 产物 HTML 面板内看图：`readHtmlArtifactRaw` + `GET /api/files/raw` + UI iframe 渲染 +「↗ 新标签打开」。
- 前批：E352 Archify 预置 Skill（五类图）+ E353 CodeGraph 只读 executor。
- 验证：`npm run build` 绿；archify 全量 15/15（index 7 + render 3 + prompt 5）+ router-v2-archify 5/5、files.test 5/5、app.test 36/36；UI build 绿；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0）。

## 待 owner（手动验收）

1. E362 复测：重启 gateway 后 5173 短问「画个订单系统的系统架构图」——模型仍产反平行双线时，本地救援应先合并（label 并「/」+ variant dashed）再交付/如实收据，生成提示铁律应源头拦截，不再原封 8 条 label 互压诊断 0.35。
1. E361 复测（已复测 201054 仍 0.35，由 E362 接管）：重启 gateway 后 5173 短问「画个订单系统的系统架构图」——语义修复后若仍出版式诊断会自动多修 ≤2 轮再交付，不再直接 0.35；仍失败应整体 0.3/0.35 如实收据。
1. E360 复测：重启 gateway 后 5173 短问「画个订单系统的系统架构图」——应出订单服务实线连订单库、回调指向服务/MQ 的正确闭环图；若模型仍画错，交付前语义自检应触发一次修复或如实 0.3 收据（不再直接交付错图）。
1. E359 复测：重启 gateway 后 5173 短问「画个订单系统的系统架构图」——若修复轮仍不收敛，本地救援应尽力救回；救回则交付 standard 图并注明「本地版式救援」；救不回则如实 0.35 收据（残留诊断 + JSON 路径 + 简化指引）。9 组件样本 architecture-0906-181757 已确认 40 次 validate 内不收敛（组合几何难，收口）。
1. E358+E357 复测：重启 gateway 后 5173 短问「画个订单系统的系统架构图」→ 生成应显著提速不再 90s 超时，且出 ≤7 组件近邻布局图、过 showcase 校验并生成 HTML；若仍剩诊断，再评估分图/降档。
2. E356 顺验：救场已生效（能走出 JSON 阶段）；可再抽问一次确认无 0.3。
3. E354 面板看图：双击 `outputs/archify/*.html` → 面板内直接渲染；「↗」新标签打开。
4. Archify 五类完整措辞对照（可选）；CodeGraph 影响分析复验（已 init 目录）。
5. 现有未提交批次（E335–E363）统一提交时机。
6. E364 方向决策：分层框架图自研通道范围 A（仅框架图/分层架构图类）vs B（架构图全部切换）；参考证据保留在 `outputs/archify/FreeRTOS系统框架图.{json,html}`。

## 遗留观察（不处理，仅记录）

- 宿主 `codegraph init`（M:\202608111）扫描含非忽略目录（审计交付副本）约 1.2w 文件、解析偏慢；按 owner 边界不修改/不忽略 `审计交付/`。
- `data/_cgprobe` 为 CLI 输出探测夹具，用后即删；`data/imgcompare/` 为本次图对比 OCR 中间产物（gitignore 内）。
- E363 上线后 FreeRTOS 复测暴露「渲染器错配」：Archify 图引擎无法复刻参考的整宽泳道教学框图；方向已收敛（自研分层框架图渲染，见上方讨论轮），待 owner 决策后开工。
