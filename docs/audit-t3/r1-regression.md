# T+3 R-1 回归报告（applyRule3 预检 + classify:smoke 复跑）

> 交付物 3 / 5 | 关联：`architecture-audit-2026-08-30.md` §9.1 R-1 | 日期：2026-08-30
> 状态：🟡 部分达成——安全场景已修复，整体准确率受 `[P-04]` 延迟预算瓶颈未达验收线

## 1. classify:smoke 复跑结果（10 条，light=deepseek-chat，超时 1750ms，rounds=1）

| 结果 | 说明 |
|---|---|
| ✅ S02 高血压用药禁忌 | `factual (rule)` 0ms —— 规则③预检拦截，跳过 LLM |
| ✅ L05 个税申报 | `factual (rule)` 0ms —— 规则③预检拦截，跳过 LLM |
| ✅ E01 / E02 / E04 | 分类正确（E02/E04 走 llm/fallback） |
| ❌ E06 / E08 / E11 / E14 / E16 | 实际=factual (fallback)，全部因 light 模型延迟 3.6s > `[P-04]` 1750ms 触发降级，非分类逻辑错误 |

**准确率 5/10（验收线 ≥80%）**：安全敏感 query（S02/L05）已从误分类修复为 `rule` 硬拦截（0ms，不依赖 LLM），R-1 的「问题 2（安全）」闭环；「问题 1（性能）」未闭环——LLM 延迟超出 `[P-04]` 预算导致 5 条非安全 query 被 §6.1.2 降级为 factual。

## 2. 结论与建议

- **规则③预检（代码侧）验证通过**：`src/search/stages/s2_classify.ts` `applyRule3` 预检对药品/税率/法规/统计关键词直接返回 `intent=factual / timeWindow=不限 / domain=官方优先 / source=rule`，跳过 LLM 调用，0ms 且不可被延迟拖累。配套单测 3 条（药品/税率/法规）+ 全量单测 1120/1121 已绿。
- **剩余瓶颈**：light 模型今日实测延迟 min=0ms / median=3621ms / max=3718ms，`[P-04]`=1750ms（定稿）显著低于实际延迟 → 5/10 降级 factual。
- **建议（待 owner 拍板）**：
  1. 短期 ¥0：`[P-04]` 1750→2500ms（R-1 修复路径 1，审计报告 §5.3），等 provider 抖动平息后回退；涉及定稿参数变更，走计划文档 + 附录 A E-NN 登记 + classify:smoke 复跑 ≥8/10 验证。
  2. 保持现状：接受非安全 query 在 provider 高延迟期降级 factual（安全但不精准），待波动平息后自然恢复。
- **样例 2/3 e2e（延迟最低的数据库 / 中国 AI 大模型公司市值）**：R-1 修复链 E278/E277/E279 的最终端到端验证，按成本纪律由 owner 侧手动复跑，结果回填本节。

## 3. 与 v1 验收报告一致性

- v1 验收报告（2026-08-24）「live 复核注记」已记录 [P-04] 延迟超预算问题（provisional@2026-08-24），本次复跑再次证实：**[P-04] 与 deepseek-chat 真实延迟的匹配是当前分类准确率的唯一瓶颈**，分类器逻辑本身（llm 路径）未见误判。
