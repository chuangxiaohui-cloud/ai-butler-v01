# 进度交接 2026-08-18（v0.2b 续作）

> 当前分支：`v0.2b`｜未提交：E127-E132 行为修复、文档资产、A/B 与 B 套评测工具等一批改动等待统一确认。

## 今日已收口

1. **low_confidence 抽样复查**：基于 E126 新基线 38 条 low_confidence 全量体检；
   31 条带证据、7 条无证据、10 条含低于 0.4 证据；结论为阈值放宽未系统性引入低质证据。
2. **可重复复查机制**：新增 `npm run review:low-confidence`，报告落在
   `bench/devil-v25/low-confidence-review.md`。
3. **官方源子查询与专业站直搜（E128）**：STM32/ADC/看门狗/PWM/RTOS/BUCK/Altium/SPICE
   自动补官方域子查询；`e2e.ti.com` / `community.st.com` / `freertos.org` 标记官方源；
   CLI 真跑 6 条真兜底，5 条搜索类全部带回官方/专业站证据，C01 升级为上下文澄清。
   单测 363/363 + 集成 17/17 全绿，doc-lint 通过。
4. **A/B 套评测拆分（E129）**：新增 `npm run split:devil-ab`，122 条拆为 A 套 108 条
   单发评测 + B 套 14 条记忆/上下文/多轮依赖题；`bench:devil-v25 -- --set=a|b` 可独立
   生成 `report-a.md` / `report-b.md`；A 套平均参考分 1.84，B 套 0.86。
5. **P01/P06/EC31/C01 专用分支（E130）**：新增 `chat` / `apply_to_project` 意图与
   `R_CHAT` / `R_APPLY_TO_PROJECT`；未知黑话、缺城市、陪伴聊天、工程落地均不再走搜索；
   CLI 四题实测通过；C01 新增 `project-writer` Skill 真实落盘，沙箱校验 + 覆盖前备份，
   `sandbox/` 内实测写入成功；单测 376/376 + 集成 17/17 全绿，doc-lint 通过。
6. **B 套多轮会话评测（E129 扩展）**：新增 `npm run bench:devil-b`，14 个记忆/上下文
   场景按统一 userId 连续跑；P10 找回 TPS5430、P07 按老样子出日报、C01 真实写入、
   C05 真实打包；全量重跑完成。
7. **B 套人工评分（E129 扩展）**：28 轮得分与点评已回填
   `bench/devil-v25/b-multiturn.md`，平均 2.25；全 3 分场景为
   EC10/EC24/EC29/P02/P10/C05；`bench-devil-b` 重跑会保留旧评分与点评。
8. **B 套记忆上下文链路（E131）**：L0 记忆按 `userId` 分会话；`session_summaries`
   改为 Q+A 双字段；LLM 特征提取注入历史上下文；rewrite 从近期记忆取原文润色，
   无原文仍澄清；CLI 连续两轮 P08 实测正式轮直接润色上一句；单测 384/384 +
   集成 17/17 全绿，doc-lint 通过。
9. **B 套第二轮修复（E132）**：Stage 5 状态追问诚实边界，EC02 正式轮真跑明确
   “没有执行记录，不能确认已解决”；`project-writer` 回读校验 + 备份/新建说明 +
   `workingMemory` 自动回溯上一轮代码；scope 补 `写个/写一段/单个`，C02 种子轮
   真跑直接输出 PID 实现；单测 389/389 + 集成 17/17 全绿，doc-lint 通过。
   B 套已全量重跑，旧评分保留，新结果落在 `b-multiturn.md`。
10. **B 套重跑与评分归属**：`b-multiturn.md` 已更新为 E131/E132 重跑回答；
    上一轮人工分与点评原样保留（平均 2.25），不覆盖用户评分；如需按新回答
    重评，另开“重跑评分”列。

## 明天继续（按优先级）

1. 用户确认是否对 E131/E132 重跑回答另开评分列，原人工分保持不动。
2. 修 P04/P07“记住个人规则”仍带外部资料噪声、C03 正式轮回溯精度不足、
   C07 未触发 Agent 事务回滚。
3. C01 自动回溯继续提升：从长答案抽取可写代码块的精度。
4. 桌面链收口（个人自用不签名；后续按使用反馈微调 Tauri/Electron 壳）。

> 人工评分已完成：`bench/devil-v25/b-multiturn.md`；后续优先修 EC02 正式轮编造进展、
> P08 正式轮丢上下文、C01 正式轮缺备份展示、C02 种子轮路由跑题；以上四项均已修，
> 待全量重跑后复核。

## 常用命令

```bash
npm run review:low-confidence
npm run bench:devil-b
npm run bench:devil-v25
npm run baseline:devil-v25
```
