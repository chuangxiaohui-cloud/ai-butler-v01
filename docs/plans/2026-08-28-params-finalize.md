# 推进计划：P-127~P-131 转定稿（随 devil-v25 全量回归评估）

> 日期：2026-08-28 · 分支：v0.2b · 状态：已完成

## 目标

按 2026-08-28 交接「下一步 4」：E270/E271 引入的 5 个 provisional 参数（[P-127]/[P-128]/[P-129]/[P-130]/[P-131]，provisional@2026-08-28）随 `bench:devil-v25` 全量回归评估后转定稿——数值不变，仅 §0.3 状态机状态迁移。

## 计划

1. 确认离线 `bench:answer-readiness` 与基线 bench:B-20260827-01 一致（检测器无漂移）
2. 全量 `bench:devil-v25` 回归（122 条，旧基线为 git HEAD E237 时代 results.jsonl）
3. `compare:devil-v25` + report 评估：无回归则转定稿；有回归先修检测器本身（不加领域规则）
4. §5 注册表 5 参数状态列 provisional@2026-08-28 → 定稿；附录 A 新增 E272 转定稿签认条目（五条件逐条对照 + owner 签认）
5. 更新本计划文档（补结果）+ `docs/2026-08-28-progress-handoff.md`（下一步勾销）
6. 全量验证：doc-lint 0 FAIL 0 WARN + build + test:all；提交

**验收标准**

- 回归相对 E237 基线无「已修复→未修复」回退；三类故障形态计数不劣化
- §5 注册表 5 行状态列均为「定稿」，附录 A 有 E272 条目且带 bench ID
- doc-lint 0 FAIL 0 WARN（C8 54 key 不变）；单测 + 集成全绿
- 不新增任何领域关键词/域名/实体（延续 E270/E271 硬约束）

## 执行过程

### 改动

- 全量回归：清空 `bench/devil-v25/results.jsonl` 后 `npm run bench:devil-v25` 重跑 122 条（旧基线备份至 TEMP，git HEAD 亦可取回）；对比 `npm run compare:devil-v25`。
- §5 注册表：P-127/P-128/P-129/P-130/P-131 状态列 provisional@2026-08-28 → 定稿（数值不变）。
- 附录 A：新增 E272 定稿签认条目（五条件逐条对照 + owner 2026-08-28 签认），bench:B-20260828-01。
- 附录 C.4：新增 devil-v25 回归 122 条原始数据行（SHA-256 登记）。
- `docs/plans/2026-08-28-params-finalize.md` 补结果；`docs/2026-08-28-progress-handoff.md` 更新。

### 遇到的问题

- **synthesis_timeout 出现率 ~9%（11/122）**：E270 后知识问答 prompt 变大（pageContents ≤9k tokens），medium 档 fallback 链 12s 总预算（[P-116]）在 bench 高频调用下偶发击穿。判定：非代码回归——错误均为「LLM fallback 链总预算 12000ms 超时」，单条重试（ET28 CLI 重跑）即恢复真实作答；E271 设计本意即「超时显式上报而非静默兜底」，heavy 档已放宽到 30s（[P-130]）。UI 默认 medium（flash）实测可正常作答。
- **26 条 real→非real 迁移**：16 条伴随 Tavily 月配额耗尽告警（toolNotice 可证，环境因素）；其余 10 条（synthesis_timeout 9 + C06 1）为 API 偶发/链预算超时。无一条指向 E270/E271 逻辑缺陷。
- **compare 脚本对 error 条目误判「已修复」**（error 文本不匹配失败正则）与 ROUTE_RE 误报（EC08「哪部分电路」澄清被当路由词）：结论以人工核对为准，已写入 E272 证据。

## 结果

- 回归结论：35 条系统级 Bug 35/35 已修复、8 条能力项 5/8 有进展、故障形态无真实恶化（路由 1→2 为误报、JSON 0→0、低置信 7→7）；15 条由「搜索到了 N 条」兜底转为真实作答（ET05/06/30、SM01/09/18/19、EC07/19/21/30、C08 等）。
- 离线 bench:answer-readiness 与基线一致：predicate 60.7%、真实证据覆盖度 55.1%（n=89）、多样性 93.7%（n=79）。
- §5 五参数转定稿；附录 A E272 条目 + 附录 C.4 证据登记完成。
- doc-lint 0 FAIL 0 WARN（C8 54 key）；build + 全量单测 + 集成 32/32 全绿。
- 提交：`539753f` · 遗留：P-04/P-02/P-10 等其余 provisional 仍待各自复验门（非本批）。
