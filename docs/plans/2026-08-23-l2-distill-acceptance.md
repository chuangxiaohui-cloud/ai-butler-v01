# 推进计划：v0.2b L2 记忆蒸馏验收收口（P-08）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

主线已声明「记忆蒸馏与治理已收口」，但 §5 注册表 [P-08]（v0.2b L2 记忆蒸馏验收）仍是 `TODO/placeholder/草稿`。
本次把验收口径对齐 §4.4 MVP 切片（v0.2b 验收 = v0.1 数据零丢失自动迁移 + 回归测试），用既有与离线可验证据收口登记，
消除当前里程碑唯一未正式验收的治理缺口。

## 计划

1. 收集证据：E6 蒸馏落地（bench:B-20260813-01）、MemoryCoreStore 实现与测试、迁移脚本零丢失校验。
2. 定义 [P-08] 验收口径（conditional 定稿）：v0.1 数据零丢失自动迁移 + MemoryCoreStore 回归测试通过 + 蒸馏链路不阻塞主对话。
3. 执行离线验证：`npm run build`、记忆相关单测、`migrate:memorycore -- --dry-run`。
4. 登记附录 A E206 + `bench:B-20260823-03` 报告 + 更新 [P-08] 状态；跑 doc-lint 0 FAIL 0 WARN。
5. 同步交接文档并提交批次。

**验收标准**

- doc-lint 0 FAIL 0 WARN（正文/附录行数预算内）。
- [P-08] 从 草稿/TODO 转 conditional 定稿，值/名称与 §4.4 v0.2b 验收一致。
- 附录 A 新增 E206，含 bench:B-20260823-03 证据；离线验证命令输出记录在本文档。

## 执行过程

### 证据核对

- §4.4 MVP 切片：v0.2b = L2 记忆蒸馏（memory-core sidecar），验收标准 = 「v0.1 数据零丢失自动迁移 + 回归测试」。
- E6（2026-08-13）：项目侧 distill worker（DeepSeek + 本项目中文 prompt）从 L0 提取写入 ExperienceManager；
  bench:B-20260813-01 全量 137 条 → 提取 191 条，成功 130 条，无提取 7 条（≈5.1%）；失败降级保留 L0 + 下次重试，不阻塞主对话。
- `src/memory/memorycore-store.ts`：MemoryCoreStore 同接口同 schema（§8.4），身份三元组校验 + HTTP 读写；
  `memorycore-store.test.ts` 已覆盖。
- `scripts/migrate-to-memorycore.ts`：迁移含零丢失校验（源条数 = 召回条数），先备份 `data/memory.db.bak-v0.2b`。
- 范围诚实登记：L2 embedding/向量检索为「后置」（docs/design/memory-system.md），不在 v0.2b 验收内；
  验收口径只覆盖 v0.2b 实际交付（L1 项目侧蒸馏 + MemoryCoreStore 切换 + 零丢失迁移）。

### 改动

- 需求文档 §5 [P-08]：值/type/状态从 `TODO/placeholder/草稿` → conditional 定稿。
- 需求文档附录 A：新增 E206 条目。
- `bench/B-20260823-03-l2-distill-acceptance.md`：验收证据报告。
- `docs/2026-08-23-progress-handoff.md`：今日已收口 + 明日继续更新。
- 本计划文档。

### 遇到的问题

- `npm run distill` 全量重跑需要 DeepSeek LLM 调用（有 token 成本），本次不重跑；
  验收以 E6 既有 bench:B-20260813-01 证据 + 离线可验项（构建/单测/迁移 dry-run）为准，诚实登记。

## 结果

- 验证：`npm run build` 通过；记忆相关单测（memorycore-store/distill/experience/session-context/memorycore-cleaner）26/26；
  `npm run migrate:memorycore -- --dry-run` 读源 903 条 L0（2 会话）；doc-lint 0 FAIL 0 WARN。
- 测试：记忆相关单测 26/26（本批）+ 全量见 test:all。
- 提交：`fe5f067` · 推送：待 owner 推送
- 遗留事项：[P-13] 深度报告增量预算仍待深度报告实现后复测（与本次无关）；L2 embedding 后置 v1.0（已在 E206 诚实登记）。
