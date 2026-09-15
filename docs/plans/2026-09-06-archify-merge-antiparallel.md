# 推进计划：Archify 反平行双线本地合并 + 提示铁律（E362）

> 日期：2026-09-06 · 分支：v0.2b · 状态：完成（未提交，待 owner 复测）
> 关联：owner 复测 E361（重启 gateway 后 5173 短问「画个订单系统的系统架构图」）反馈：architecture-0906-201054.json 语义已完全正确（E360 生效），但 E361 补布局轮与 E359 本地救援仍不收敛，落 0.35 收据（剩余 8 条全为 composition/label-route-clearance）。定位：201054 与 195729 同病，都是 order⇄mq 同走廊反平行双线（发布事件/支付回调）再叠加 order-db 边挤进同一竖走廊，3 个标签互压。根因两层：① E357 提示只是「尽量」，模型仍产出反平行双线；② 该类诊断 message 不带 Suggested fix 数值，E359「照抄标签建议」空转，且 label-route-clearance 不在 trouble 组件集合内，交换/挪位也不参与。owner 拍板 C（本地合并），顺带 B（提示铁律兜底）。

## 目标

把「同走廊反平行双线」这个连续两个样本（195729/201054）复现的病灶从本地救援层消灭：诊断命中时先合并反平行双线（正向保留，label 用「/」并列，回程/异步整条 dashed），合并后仍不过则让 label-route-clearance 的端点进入可挪位集合；同时在生成提示把「禁止同一对节点两条方向相反连线」升级为明确铁律，源头减少发生。仍不过才走既有 0.35 如实收据。

## 方案

- B（prompt.ts）：TYPE_GUIDE.architecture「连线纪律」小节后追加铁律句：即使语义不同（发布事件/支付回调）也合并为一条双向虚线（label 用「/」并列）；新增「多下游错走廊」句（不要全排正下方同一列）。
- C（layout-rescue.ts）：
  1. 新增本地变换 mergeImplicatedAntiPair：找「方向互反且两个 label 被同一条 label-route-clearance 诊断同时点名」的连接对，保留组件序更靠前者为正向，label 并为「正向/回程」、任一侧 dashed 则整条 dashed、删除另一条；validate 当 oracle，ok 或诊断数下降才提交，否则回滚并记入拒绝集合不重试。
  2. 标签建议从「每连接只用一次」改为可随新建议重用（每连接上限 3 次，同坐标跳过）：合并后新诊断会给新的 labelAt/建议，允许逐步走向清晰位。
  3. troubleComponentIds 扩展命中 label-route-clearance：从 message 解析两条连接的端点（regex connections[i] "a" -> "b"）入集，让交换/挪位可分开错走廊。

## 测试与验收

- layout-rescue.test.ts +3：① 反平行双线被诊断命中 → 合并为单条双向虚线合格；② 诊断未同时点名两个 label → 不合并（语义保留）；③ label-route-clearance 端点进入可挪位集合后挪位可释放走廊。prompt.test.ts +1：E362 提示包含反平行铁律、「发布事件/支付回调」合并例、「多下游错走廊」。
- 既有 E359/E361 集成回归不破坏；npm run build 绿；archify 定向 30/30（index 11 + prompt 8 + layout-rescue 5 + render 3 + semantics 4；新增 3）；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0，测试全 Fake）。
- 手动（owner）：重启 gateway 后 5173 重发「画个订单系统的系统架构图」——期望不再出 order⇄mq 同走廊反平行双线；若模型仍产出，本地救援应合并后再交付/收据，而不是原封不动 8 条诊断 0.35。

## 执行过程

### 改动

- src/skills/archify/prompt.ts：「连线纪律」后追加反平行铁律 + 多下游错走廊句。
- src/skills/archify/layout-rescue.ts：新增 mergeImplicatedAntiPair/findImplicatedAntiPair（合并变换）；标签建议改可重用（上限 3）；troubleComponentIds 命中 label-route-clearance 端点。
- 测试：layout-rescue.test.ts +3、prompt.test.ts +1。

### 遇到的问题

- 201054/195729 的 label-route-clearance 诊断 message 不带数值建议，E359「照抄建议」路径空转；且该 code 不在 trouble 组件集合，整个救援没有可操作杠杆。解法：先合并反平行双线（残余根源），再让剩余走廊问题能被标签重建议/端点挪位攻击。

## 结果

- npm run build 绿；archify 定向 30/30；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0）。
- 现状：救援链 = 合并反平行双线→标签重建议（×3）→端点建议→端点挪位→ 0.35 收据；生成提示含反平行铁律。
- 待 owner 重启 gateway 复测短问「画个订单系统的系统架构图」。