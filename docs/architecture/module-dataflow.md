# 模块数据流图

> 权威需求：§6.0-§6.7

## 1. 一次问答的主数据流

```text
用户输入
  │
  ▼
Stage 1 预处理（s1_prepare.ts）
  输入: query + attachments
  输出: cleanQuery / cacheKey / clarify / memoryNotes
  早退: 缓存命中；指代不明进入澄清
  │
  ▼
意图路由（src/agent/router-v2.ts）
  输入: cleanQuery + 上下文 + 多模态信号
  输出: RouteResultV2（主镜片/意图/executor/搜索开关）
  早退: emergency / safety / direct Skill / not_wired
  │
  ▼
Stage 2 意图分类（s2_classify.ts）
  输入: cleanQuery
  输出: intent / searchQuery / timeWindow / domain
  降级: 超时或解析失败 → factual
  │
  ▼
Stage 3 搜索执行（s3_search.ts + search-loop.ts）
  输入: searchQuery + intent + providers + 配额
  输出: SearchResult[] + attempts + aiAnswers
  降级: 子搜索循环 → 空结果原句重试 → 简化句 → Bing/Baidu 浏览器兜底
  │
  ▼
Stage 4 融合评分（fusion.ts）
  输入: 原始结果 + intent
  输出: FusedOutput（items / dropped / gated / lowConfidence）
  规则: 实体匹配 → 去重 → SEO 降权 → 时效权重 → 加权评分 → 门控
  │
  ▼
Stage 5 秘书合成（s5_synthesize.ts）
  输入: 证据 + 记忆 + 经验 + Skill 输出 + 主镜片
  输出: answer（source: llm | fallback）
  降级: LLM 失败 → 可信结果摘要
  │
  ▼
Stage 6 后处理（s6_post.ts）
  输入: answer + confidence + evidence
  输出: 四字段契约 + evidenceHash + L0 写入
```

## 2. 各阶段输入输出与降级速查

| 阶段 | 输入 | 输出 | 超时/降级 |
|------|------|------|-----------|
| Stage 1 | 原始 query、附件 | cleanQuery、cacheKey、clarify | 缓存命中早退；脱敏失败不影响主流程 |
| 意图路由 | cleanQuery、上下文 | 主镜片、intent、executor | LLM 特征超时 → 规则/fallback 提取 |
| Stage 2 | cleanQuery | 8 意图 + 搜索词 | LLM 失败 → factual |
| Stage 3 | searchQuery | 结果集、attempts | 总预算 [P-02]；空结果按兜底链回升 |
| Stage 4 | 原始结果 | 融合证据 + 门控 | 全空 → low_confidence + 二次取证 |
| Stage 5 | 证据 + 上下文 | answer | LLM 失败 → 证据摘要 |
| Stage 6 | answer | 四字段 + hash + L0 | L0 写入失败不阻塞回复 |

## 3. 侧路

- 紧急/安全/属性紧急：意图路由直接返回模板，不进入搜索。
- 直接 Skill：executor 可用且无需搜索时直接执行，产物事件走 `onArtifact`。
- 低置信二次取证：`shouldSecondPass` 命中时抓取高可信 HTML 或 PDF 原文后重新融合。
- 轨迹与用量：route/search/synthesize/model_route/answer 事件只追加写入，失败不阻塞。
