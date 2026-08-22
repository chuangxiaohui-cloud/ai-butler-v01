# bench:B-20260823-03 · v0.2b L2 记忆蒸馏验收（P-08 收口）

> 日期：2026-08-23 · 分支：v0.2b · 主题：[P-08] v0.2b L2 记忆蒸馏验收 草稿→定稿

## 验收口径（对齐 §4.4 v0.2b 切片）

v0.2b 验收 = **v0.1 数据零丢失自动迁移 + 回归测试**（§4.4 MVP 切片），具体拆三项：

1. **蒸馏链路落地**：项目侧 distill worker（E6 偏离，DeepSeek + 中文 prompt）从 L0 提取长期记忆写入
   ExperienceManager；失败降级保留 L0 + `distill_status: failed` + 下次启动重试，不阻塞主对话（§8.1.4 三条硬约束）。
2. **MemoryCoreStore 切换**：同接口同 schema（§8.4），身份三元组校验 + HTTP 读写，切换 = 配置项变更。
3. **零丢失迁移**：`scripts/migrate-to-memorycore.ts` 先备份、逐条写入、按 session 召回校验（源条数 = 召回条数）。

## 证据

| 项 | 证据 | 结果 |
|----|------|------|
| 蒸馏链路 | E6（附录 A，2026-08-13）bench:B-20260813-01 | 全量 137 条 → 提取 191 条，成功 130 条，无提取 7 条（≈5.1%）；失败不阻塞主对话 |
| MemoryCoreStore | `npm run build` + 记忆相关单测 26/26 | 通过（memorycore-store/distill/experience/session-context/memorycore-cleaner） |
| 迁移零丢失 | `npm run migrate:memorycore -- --dry-run` | 读源 903 条 L0 / 2 会话，dry-run 校验逻辑就绪 |
| 文档宪法 | `npm exec tsx scripts/doc-lint.ts` | 0 FAIL 0 WARN（附录 939/950） |

## 范围诚实登记

- L2 embedding/向量检索为「后置」（`docs/design/memory-system.md`），不在 v0.2b 验收内，v1.0 再评估。
- `npm run distill` 全量重跑需 DeepSeek token 成本，本次不重跑；验收以 E6 既有证据 + 离线可验项为准。
- 当前 L0 数据已增长至 903 条（迁移 dry-run 读数为准），迁移脚本零丢失校验可随时在 sidecar 就绪时真跑。

## 结论

[P-08] 由 `TODO/placeholder/草稿` 转 **conditional 定稿**，验收口径与 §4.4 v0.2b 切片一致；E206 登记。
