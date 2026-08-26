# 推进计划：成熟度观测基建 Phase 0（[P-25] 自检 + E243 收口）

> 日期：2026-08-26 · 分支：v0.2b · 状态：已完成
> 背景：累积路径清单（`2026-08-26-maturity-accumulation-path.md`）M1 的第一步——先做尺子再累积。
> 口径：L2 判据 = 用户累积 Skill 50+ / 验收通过率 80%+ / 复用率 60%+（§12.4，预置 Skill 不计数）。

## 目标

落地 [P-25] 轻量自检（`npm run maturity:check`）并收口 E243 遗留的市场 Skill 自然语言路由，为 P-10 条件③ 提供可重复观测的基线；登记 E247/E248。

## 计划

1. **E243 收口**：新增 `src/skills/market/nl-router.ts`（触发词最长匹配 + 有界渲染）；`runner.ts` 暴露 `listInstalledWithTriggers()`；pipeline 注入 `marketSkillRunner` 直连执行点；轨迹事件 kind 增加 `market_trigger`。
2. **E247 观测基建**：新增 `src/maturity/metrics.ts`（五维指标纯函数 + L0-L3 判定）与 `scripts/maturity-check.ts`，挂 `npm run maturity:check [--json]`；数据源 experience.db#skill_stats / MarketStore / route-cases.jsonl / trajectory.jsonl。
3. **验收样本阈值**：§12.4 补 n≥30 注记（高于 §0 下限 n≥15，对齐 E1 n=60 先例）。
4. **全量验证**：build + 单测 + 集成 + doc-lint 0 FAIL 0 WARN；附录 A 登记 E247/E248。

**验收标准**

- `npm run maturity:check` 可重复输出等级与四维缺口；本次实测基线记入结果段。
- E243 直连命中场景有单测覆盖；复用率观察口径说明记入 E247 登记。
- doc-lint 0 FAIL 0 WARN；目录文档与 AGENTS.md 地图同步。

## 执行过程

### 改动

- `src/skills/market/nl-router.ts`（新）：`matchInstalledSkillTrigger` 最长触发词优先 + `renderMarketSkillAnswer` 有界渲染。
- `src/skills/market/nl-router.test.ts`（新）：匹配 5 + 渲染 3，共 8 条。
- `src/skills/market/runner.ts`：`listInstalledWithTriggers()`（97-111 行）+ 类型 `InstalledSkillWithTriggers`。
- `src/search/pipeline.ts`：`marketSkillRunner` 注入点 + 直连执行钩子（安全/专用意图短路后；deep_report 不拦截）。
- `src/search/pipeline.test.ts`：直连/失败归因/未安装不影响 3 条。
- `src/trajectory/trajectory-log.ts`：kind 增加 `'market_trigger'`。
- `src/maturity/metrics.ts`（新）：`computeMaturityMetrics` 纯函数；L0-L3 判定；判据 Skill 50+/通过率 80%+/复用率 60%+；预置不计数；通过率 = accept/(accept+reject+correct)；n≥30 才正式判定。
- `src/maturity/metrics.test.ts`（新）：6 条（L1 判定/通过率口径/n<30 提示/L2/L3/证据链抽样）。
- `scripts/maturity-check.ts`（新）+ package.json `maturity:check` 入口。
- 需求文档：§12.4 补验收样本阈值 n≥30；附录 A 登记 E247、E248。

### 遇到的问题

- 复用率观察口径：直连 Skill 派发事件 / 回答事件为代理口径；E243 收口后市场 Skill 直连也会计入，后续 Phase 1 校准。已注明在 E247 登记内。

## 结果

- **实测基线（E247）**：等级 L1；预置 15/24 有使用；用户累积 Skill 0/50+；通过率 73.9%（17/23，n=23，pipeline-only）；复用率观察 16.6%（118 skill / 709 answer 事件）；缺口 4 条即 P-10 条件③ 解锁路径。
- **E243 收口**：市场 Skill 触发词直连执行生效，未命中/未安装不影响原路由；轨迹记 kind=market_trigger。
- 验证：`npm run build` 通过；单测 883/884（1 skip）+ 集成 29/29；`npm run maturity:check` 跑通；doc-lint 0 FAIL 0 WARN。
- 提交：E248 = `14cfad2`、E247 = `dd3779a`、文档批 = `ad9c914` · 推送：待执行（Gitee / GitHub）
- 遗留事项：Phase 1 真实使用累积（见累积路径清单）；复用率口径待 Phase 1 校准。