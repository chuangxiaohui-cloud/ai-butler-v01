# 推进计划：成熟度 L2 累积路径（解锁 [P-10] 条件③）

> 日期：2026-08-26 · 分支：v0.2b · 状态：清单已发布，执行中
> 背景：[P-10] 全量验收（E246）四条件通过，唯一阻塞 = 条件③ 成熟度 §12.4 L2+。
> 口径：L2 判据 = 用户累积 Skill 50+ / 验收通过率 80%+ / 复用率 60%+（§12.4，预置 Skill 不计数）。

## 现状基线（2026-08-26 实测）

| 判据 | 目标 | 当前 | 缺口 | 观测点 |
|------|------|------|------|--------|
| 用户累积 Skill | 50+ | **0**（`data/market-skills/` 空；skill_stats 24 个均为预置，15 个有真实使用） | 50 | `npm run skill:market:run -- --list` + `data/experience.db#skill_stats` |
| 验收通过率 | 80%+ | **73%**（19 accept / 7 reject，n=26，`data/route-cases.jsonl`） | +7pct（≈9 个 accept 无新 reject） | `npm run route:cases` / `route:feedback` |
| 复用率 | 60%+ | **未观测**（无口径脚本；E243 自然语言路由未收口） | 待定 | `data/trajectory.jsonl` + 路由日志 |

## Phase 0 — 观测基建（先做尺子，1-2 个会话）

1. **落地 [P-25] 轻量自检**：新增 `scripts/maturity-check.ts`，读 `data/experience.db#skill_stats` + `data/route-cases.jsonl` + `data/trajectory.jsonl`，输出五维指标（覆盖度/证据链/通过率/复用率/反馈信号）与 L0-L3 判定；挂 `npm run maturity:check`。完成时登记 E-NN。
2. **收口 E243 遗留——市场 Skill 自然语言路由**：命中已安装 Skill 触发词进 pipeline（需扩展意图 targetDomain）。这是复用率能升高的前提，先于复用率观测落地。
3. **定复用率口径并落地计算**：复用率 = 命中已装 Skill 的同类问题 / 全部问题（路由日志）；先用脚本按月输出观察值，不预设结论。
4. **定验收样本阈值**：n≥30（对齐 E1 n=60 先例的下限、高于 §0 治理下限 n≥15）；通过率 = accept/(accept+reject)，「correct/修改」计入分母不计通过；阈值定稿时登记 E-NN 与 [P-10] 注记。

## Phase 1 — 真实使用（日常节奏，持续累积）

### 1. 每日真实问答 + 反馈纪律（喂通过率）
- 把 AI-Butler 接入真实工作流，不再用测试题：datasheet 查证、器件选型、GitHub 项目解读、BOM/表格处理、文档/PDF 转换、日历提醒、深度报告。
- 每条问答后顺手反馈：`npm run route:feedback -- <caseId> a|r|c`（accept/reject/correct）。
- 目标节奏：每周新增 ≥10 条有反馈的真实样本；当前 73%（19/7）→ 80% 需约 9 个 accept 且无新 reject，预计 1-2 周可达成。

### 2. 每周 Skill 沉淀（喂 Skill 覆盖度）
- 把重复 3 次以上的任务固化为市场 Skill：`npm run install:skill -- --name <name> --version 0.1.0 --triggers <触发词>`，安装后走 `npm run skill:market:run -- <name>` 验证可执行。
- 高频可沉淀场景（现成脚本可直接包装）：datasheet 下载/速读/参数对比、BOM 解析/合并/差异、表格 OCR+词典纠正、文档格式互转（docx/pdf/图片）、GitHub 解读细分（架构/路线图/社区口碑）、办公日报/周报模板、日历/提醒管理。
- 目标节奏：每周沉淀 3-5 个 → 50+ 需约 10-16 周；不凑数，只沉淀真实使用中验证过的（§12.4 不自我夸大）。
- 每安装一个跑一次 `npm run skill:market:run -- --list` 留计数证据。

### 3. 复用率养成（喂复用率）
- 收口 E243 后，同类问题优先走 Skill 触发（不再裸搜）；观察「Skill 命中率」逐步抬升。
- 每 2 周跑一次复用率脚本，记录观察值到 `docs/plans/2026-08-26-maturity-accumulation-path.md` 结果段。

### 4. 反馈闭环联动（§9 → 校准）
- 累积 reject ≥15 时跑 `npm run route:calibrate` 生成校准提案，`route:apply-calibration` 落地（对齐 E197 先例）。
- 赞/踩/修改建议计入「用户反馈信号」维度（§2.5 四个行为指标）。

## Phase 2 — 复验门（条件③ 达标后，1 个会话）

1. `npm run maturity:check` 三判据齐达标：Skill ≥50 / 通过率 ≥80%（n≥30）/ 复用率 ≥60%。
2. 按 E197 复验门重跑 [P-10]：样本 + owner 签认 → 附录 A 登记 E-NN → [P-10] 转 定稿。
3. 复跑当日全量验证（build + test:all + doc-lint）+ 更新成熟度报告（`docs/reports/maturity-assessment-v1.md` 新快照）。

## 里程碑与节奏建议

- **M1（1-2 周）**：观测基建落地（maturity-check + E243 收口 + 复用率口径）；通过率达到 80%（n≥30）。
- **M2（月度）**：Skill 沉淀进入节奏（每周 3-5 个）；复用率观察值连续 2 周 ≥60% 记入报告。
- **M3（10-16 周）**：用户累积 Skill 50+；三判据齐达标 → 复验门重跑 [P-10]。

## 执行过程

### 改动
- 本清单为计划文档，无代码变更；Phase 0-2 各项执行时各自开计划文档并登记 E-NN。

### 遇到的问题
- 复用率 60%+ 是三者中最依赖系统行为的一环：E243 自然语言路由不收口则复用率无法升，故列为 Phase 0 前置。

## 结果

- 当前基线已实测登记（上方表格）。
- 提交：`2a48ea4` · 推送：待执行（Gitee / GitHub）
- 遗留事项：M1 观测基建执行时逐项登记 E-NN；Tavily 9 月重置后顺带复跑 P-12 三引擎基准。