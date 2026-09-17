# [P-10] 条件② 复跑报告（P-07 / P-12 / P-08）

> 日期：2026-09-17 · 分支：v0.2b · 计划：[`docs/plans/2026-09-17-p10-condition2-rerun.md`](../plans/2026-09-17-p10-condition2-rerun.md)

## 结论

| 口径 | 本轮复跑 | 判定 |
|------|----------|------|
| **P-07** | `bench:v01` **10/10** 管道跑通；gate=none×8 + safety×2；证据各 3 条 | ✅ 管道复跑通过；相关性人工分按 C.2 **仍待 owner 回填**（与 E246 同口径） |
| **P-12** | `bench:v02a` **31/31** 均有响应；**E19** 落到 `must_clarify`（conf=0、evidence=0） | ⚠️ 管道可跑；**E19 空澄清为回归注记**；`v02a-scores.json` 旧人工分仍显示 30/31≥2，**未对本轮答案重评** |
| **P-08** | 记忆相关单测 **71/71**；`migrate:memorycore --dry-run` 读源 **1331** 条 L0 | ✅ 回归绿 |

**条件② 本轮**：离线/管道证据已补齐；**不宣称**人工相关性已重评。Tavily 配额健康（远端 usage≈29/1000）；`tavily:smoke` 通过。

## [P-10] 后续

- 2026-09-17 owner「签」+ E416 定稿：见 [`v1-acceptance-report-2026-09-17.md`](./v1-acceptance-report-2026-09-17.md)。

## 证据明细

### P-07（v0.1 / [P-07]）

- 命令：`npm run bench:v01`
- 报告：`bench/v01-report.md`（本轮覆盖写入）
- 摘要：10 条全部完成；confidence 中位 ≈0.92；S02/L05 正确触发 `safety`

### P-12（v0.2a / [P-12]）

- 命令：`npm run bench:v02a`（`tavily: { enabled: true }`）
- 报告：`bench/v02a-report.md`（本轮覆盖写入）
- 报告头「判定结果」来自既有 `bench/v02a-scores.json`，**不是**本轮答案的新人工分
- **E19**（`Tauri 框架 架构 技术栈` / github_analysis）：复跑当时路由 `must_clarify`；**E417** 已收窄「框架」并补无附件结构回退 → `direct`/`web_search`（未重跑全量 v02a）。
- 注：脚本分引擎时延表对 `tavily` 采样条件写死为 `false`，表中 tavily=0 **不能**解读为「未调用」；以 `tavily:smoke` 为准

### P-08（v0.2b / [P-08]）

- `node --test dist/memory/**/*.test.js` → **71/71**
- `npm run migrate:memorycore -- --dry-run` → 源 L0 **1331** 条（不执行写入）
- 定稿证据链仍可追溯 E206 / `bench/B-20260823-03-l2-distill-acceptance.md`

### 附：成熟度

- `npm run maturity:check` → 仍为 **L2**（滑动窗 71.7%，n=30，Skill 52）

## [P-10] 五条件（复跑后 → 已定稿）

| 条件 | 状态 | 说明 |
|------|------|------|
| ① S1-S8 + 回归 | ✅ | 业务四条 + 此前 test:all |
| ② P-07/P-12/P-08 | ✅* | 本轮管道/离线复跑已落盘；\*人工分重评为遗留；E19 路由误触已由 E417 修 |
| ③ 成熟度 L2+ | ✅ | L2 |
| ④ doc-lint + 测试 | ✅ | E416 复验：doc-lint + test:all 绿 |
| ⑤ owner 签认 | ✅ | 2026-09-17「签」→ E416 定稿 |

## 下一刀

1. 可选：C.2 人工回填；抽检全量 v02a。
2. 更后：自由 PCB / 自定义仿真 / 真实 flash·串口。
