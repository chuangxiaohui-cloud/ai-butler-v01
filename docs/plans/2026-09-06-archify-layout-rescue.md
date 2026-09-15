# 推进计划：Archify 架构图本地确定性版式救援（E359）

> 日期：2026-09-06 · 分支：v0.2b · 状态：完成（未提交，按 owner「A」收口，不再扩搜索）
> 关联：owner 复测「画个订单系统的系统架构图」出 0.35 诚实收据——showcase 版式校验失败、LLM 修复 ≤2 轮不收敛（E357 单图规模纪律已生效，样本为 9 组件 8 连线 3×3 网格 architecture-0906-181757，剩 clean-flow/endpoint-side-direction/edge-through-node/layout 类诊断）。0.35 分支目前只会如实收据，不尝试把「接近可交付」的图救回来。

## 目标

LLM 修复轮穷尽仍不过校验时不直接 0.35 收场：加一层「本地确定性版式救援」（无 LLM、无外部调用），把 label 重叠、端点方向、竖穿障碍等可机械修补的诊断按 standard 档救回并通过校验交付 HTML；确实救不回才如实收据（残留诊断 + JSON 路径 + 指引）。

## 方案

新增 `src/skills/archify/layout-rescue.ts`，在 `src/skills/archify/index.ts` 修复循环穷尽后、`!receipt.ok && type === 'architecture'` 时调用：

1. 降 `meta.quality_profile` 为 `standard`，grid 布局右侧至少留 1 空列当绕行走廊。
2. 标签重叠：从诊断 message 解析 `Suggested fix: labelAt [x,y]` / `labelDy ±N`，「照抄」到该连接（每连接只改一次）。
3. 端点方向：`endpoint-side-direction` 诊断携带推断 side 与 authoredField，显式写入 `fromSide/toSide`（每连接每字段只改一次）。
4. 有界交换/挪位：对 trouble 组件（诊断涉及的 from/to/障碍件）与其它组件交换、或移到空格子，`validate` 作 oracle，只接受「通过或诊断数下降」，允许少量持平移动翻越局部平台；validate 总数默认 ≤36 次（本地子进程，成本可控）。
5. 救援通过 → 按 `standard` 档 deliver，confidence 0.72，回复注明「本地版式救援」；仍不过 → 走既有 0.35 收据（如实剩余诊断 + JSON 路径）。

## 测试与验收

- `layout-rescue.test.ts` 新增：降 standard+留空列+照抄 labelAt → ok；fromSide/toSide 照抄 → ok。
- `index.test.ts` 新增集成：修复不收敛 → 本地救援按 standard 通过并交付 HTML（quality=standard、confidence 0.72、validateCommands 含 standard）。
- `npm run build` 绿；定向单测绿；`npm run doc-lint` 0 FAIL 0 WARN；零外部 LLM（¥0，测试全 Fake）。
- 手动（owner）：重启 gateway 后 5173 重发「画个订单系统的系统架构图」——若修复轮仍不收敛，本地救援应尝试救回；救回时交付 standard 图并注明。

## 执行过程

### 改动

- `src/skills/archify/layout-rescue.ts`：新增救援模块（1-5）。
- `src/skills/archify/index.ts`：修复轮穷尽后接入 `rescueArchitectureLayout`；交付与收据用 `activeQuality` 区分。
- `src/skills/archify/layout-rescue.test.ts`：2 条单测。
- `src/skills/archify/index.test.ts`：+1 集成测试。

### 遇到的问题

- 修复 1：交换 trial 写盘后未还原主候选，导致连续校验诊断「回弹爆涨」（43 次后 87 条）——改为每次写 trial 校验后只保留最优候选，主候选不污染。
- 修复 2：严格「诊断数下降才接受」会卡在局部平台，加了少量「持平侧移」（6 次）尝试翻越。
- 真实样本（9 组件订单图 architecture-0906-181757）：确定性 sides/label 修复有效，但组合几何下 validate 40 次后仍剩 3 条顽固诊断（endpoint-side-direction c3 + edge-through-node c8 order→cache 竖穿 mq），持平侧移耗尽仍不收敛——已判定属组合搜索难题，按 owner「A」决策收口，不再扩搜索/退火调参。

## 结果

- `npm run build` 绿；archify 定向测试 10/10（layout-rescue 2 + index 8）；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0）。
- 现状：常见 label/端点方向/竖穿类诊断可在本地按 standard 救回；极端密集组合偶发仍失败 → 如实 0.35 收据（残留诊断 + JSON 路径 + 「简化成更小图」指引）。
- 待 owner 重启 gateway 后 5173 复测「画个订单系统的系统架构图」；若仍频繁失败可单独立项攻坚该样本（如障碍件定向挪移）。
