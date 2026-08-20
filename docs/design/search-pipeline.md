# 搜索管道详细设计

> 权威需求：§6.1-§6.8；实现：`src/search/`；旧版框图：`docs/three-engine-architecture-ascii.md`

## 1. 六阶段设计

| 阶段 | 文件 | 输入 | 输出 | 降级 |
|------|------|------|------|------|
| Stage 1 预处理 | `stages/s1_prepare.ts` | 原始 query、附件 | cleanQuery、cacheKey、clarify | 缓存命中早退；脱敏/黑话映射 |
| 意图路由 | `src/agent/router-v2.ts` | cleanQuery、上下文、信号 | 主镜片、intent、executor、searchNeed | LLM 超时 → 规则 / fallback |
| Stage 2 分类 | `stages/s2_classify.ts` | cleanQuery | intent、searchQuery、timeWindow、domain | LLM 失败 → factual |
| Stage 3 搜索 | `stages/s3_search.ts`、`search-loop.ts` | searchQuery、intent | results、attempts、aiAnswers | 子搜索循环 → 空结果兜底链 |
| Stage 4 融合 | `fusion.ts` | 原始结果、intent | FusedOutput、evidence、gate | 全空 → low_confidence + 二次取证 |
| Stage 5 合成 | `stages/s5_synthesize.ts` | 证据、记忆、经验、Skill | answer、source | LLM 失败 → 证据摘要 |
| Stage 6 后处理 | `stages/s6_post.ts` | answer、confidence、evidence | 四字段契约、evidenceHash、L0 | L0 写入失败不阻塞 |

## 2. 三引擎调用策略

- Bocha：常开补齐源；AnySearch：常开可靠源；Tavily：条件并联，仅 news / 英文技术 / 低置信提示时触发。
- 三路心跳：连续失败且超过 [P-37] 检测窗口才标记 down。
- 配额：Bocha/AnySearch 走日配额 [P-63]/[P-65]，Tavily 走月配额 [P-64]；配额耗尽等同掉线，不报错。
- 严肃通道（规则③命中）：Bocha + AnySearch 从严处理，Tavily 不触发。

## 3. 融合层四过滤器与加权评分

串行顺序：

1. 实体精确匹配：型号/平台/项目名必须精确命中，变体降权。
2. 跨引擎去重：URL 或内容 hash 去重。
3. SEO 垃圾页识别：广告话术、无步骤 FAQ、下载站等降权。
4. 分类时效加权：按意图动态调整 timeliness 权重。

加权公式：

```text
final = w_relevance * relevance
      + w_timeliness * timeliness
      + w_usability * usability
      + w_fact_consistency * fact_consistency
```

意图动态权重见 `fusion.ts` 的 `INTENT_WEIGHTS`（news / experience / factual /
troubleshooting / comparison / how_to / default），与需求 [P-23] 一致。

规则① fact_consistency：先实体匹配，再抽取数值/版本/日期，按“官方源 > 多数一致 > 无则记 0 并门控”仲裁；只校验事实不校验观点。

## 4. 门控与兜底

| 条件 | gate_triggered | 行为 |
|------|---------------|------|
| 规则③命中 | safety | 严肃通道 + 模板提示 |
| 无证据 / 规则① gated / 低置信 | low_confidence | 二次取证或诚实降级 |
| 紧急意图 | emergency | 紧急模板直接返回 |
| 正常 | none | 正常合成 |

空结果兜底链（E125）：

1. 子搜索循环按覆盖度追加查询。
2. 全空时原句重试 → 简化句重试。
3. 仍空时 Bing/Baidu 浏览器搜索兜底。
4. 融合全空时按相关度抓 HTML 原文并放宽二次融合阈值后重评。

## 5. 超时与降级路径

- Stage 3 总预算 [P-02]：超时按已返回结果处理，另一路兜底。
- Tavily 独立超时 [P-35]。
- Stage 5 合成 LLM 超时：返回证据摘要，不硬答。
- 所有旁路（轨迹、用量、L0 写入）失败都不阻塞主回答。
