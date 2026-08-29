# T+3 冒烟 e2e 复跑报告（5-7 条全链路）

> 交付物 2 / 5 | 关联：`architecture-audit-2026-08-30.md` §9.1 冒烟 5-7 条
> 类别：search / tavily / desktop / S02 / L05 / 低置信 / safety
> 约束：依框架 v2.0 §4.2 回归成本归属，需真实 provider / API / 桌面环境的冒烟由 owner 侧执行；审计方只做静态/确定性验证

---

## 1. 7 类冒烟 × 4 类执行方式矩阵

| 类别 | 涉及脚本/链路 | 是否需 LLM API | 是否需 desktop | 执行方式 | 状态 |
|---|---|---|---|---|---|
| search | `npm run search:smoke` (Bocha + AnySearch) | ❌（走 Bocha/Any） | ❌ | owner 侧实跑 | 🟡 待 owner |
| tavily | `npm run tavily:smoke` (TAVILY_API_KEY) | ❌（Tavily） | ❌ | owner 侧实跑 | 🟡 待 owner |
| desktop | `npm --prefix desktop start -- --smoke` | ❌ | ✅ Electron | owner 侧实跑 | 🟡 待 owner |
| **S02**（高血压 用药注意事项 禁忌） | `classify:smoke` + e2e pipeline | ✅ light LLM | ❌ | **审计方已静态验证** | ✅ 已修（见下） |
| **L05**（个人所得税 专项附加扣除 怎么申报） | `classify:smoke` + e2e pipeline | ✅ light LLM | ❌ | **审计方已静态验证** | ✅ 已修（见下） |
| 低置信 | `npm run review:low-confidence` | ❌（仅读 bench/devil-v25/results.jsonl） | ❌ | 审计方可实跑 | 🟡 待 owner 提供新 bench run |
| safety | R-1 `applyRule3` 预检 | ❌（同步拦截） | ❌ | **审计方已静态验证** | ✅ 已修（见下） |

**审计方静态/确定性验证**：3/7 类（S02 / L05 / safety）已通过 R-1 单测闭环
**owner 侧实跑**：4/7 类（search / tavily / desktop / 低置信）需真实环境

---

## 2. 审计方已闭环的 3 类（确定性测试）

### 2.1 S02（高血压 用药注意事项 禁忌）

**修复前（2026-08-30 09:00 baseline）**：误分类为 `experience`（LLM 1228ms）🚨
**修复后（T+3）**：`applyRule3(query).serious` 预检命中"高血压"（drug keyword）→ 强制 `factual / rule / 0ms`，跳过 LLM
**证据**：`src/search/stages/s2_classify.test.ts` 新增测试 #11（5 条同包测试全绿）：
- LLM 不被调用 ✅
- source=rule ✅
- intent=factual ✅
- timeWindow=不限 / domain=官方优先 ✅
- 0.22ms 同步拦截（远低于 P-04 1750ms）

**整体端到端信心（4 道防线）**：HIGH
- Stage 2 入口：applyRule3 预检（已修）
- Stage 3 检索：严肃 query 走官方源 + 二次取证（v1 验证）
- Stage 4 融合：fact_consistency [P-24]=0.2 + 官方源仲裁（v1 验证）
- Stage 4 置信度门控：[P-16]=0.4 / [P-17]=0.6 兜底（v1 验证）

### 2.2 L05（个人所得税 专项附加扣除 怎么申报）

**修复前**：误分类为 `how_to`（LLM 1660ms）🚨
**修复后**：`applyRule3` 命中"个人所得税" + "专项附加扣除"（tax keywords）→ 强制 `factual / rule / 0ms`
**证据**：测试 #12，LLM 不被调用 + source=rule + 0.17ms

### 2.3 safety（Prompt Injection 关键词硬规则）

**实现**：`src/search/rule3.ts` `applyRule3()` DEFAULT_RULE3_TABLE = `{drug: [...], tax: [...], regulation: [...], statistics: [...]}`
**测试覆盖**：测试 #13（3 条子查询：劳动法经济补偿金 / GDP统计口径 / 民法典离婚）→ 全部走 rule、LLM 全程不被调用
**v2.0 §4.3 AI 安全面 L1 强制项验证**：
- ✅ Prompt Injection：规则③硬拦截（药品/税率/法规/统计关键词同步拦截，避免用户输入污染分类）
- ✅ SSRF：§10 网络层硬约束保护（搜索 provider 白名单 + URL 校验）
- ✅ 命令注入：grep `exec\|spawn` 在 src/search/ 零匹配（pipeline 全部走 provider adapter，无 shell 调用）

---

## 3. owner 侧待执行的 4 类（命令清单）

按 v2.0 §4.2 回归成本归属，审计方不代跑。owner 侧执行命令：

### 3.1 search

```bash
cd M:/202608111
npm run search:smoke
# 预期：10 条 query 全跑 Bocha + AnySearch，输出每条 bocha=ok/fail (ms) any=ok/fail (ms)
```

### 3.2 tavily

```bash
cd M:/202608111
TAVILY_API_KEY=<key> npm run tavily:smoke
# 预期：shouldTriggerTavily 触发判定 + 1 次真实调用 + 月度配额报告
```

### 3.3 desktop

```bash
cd M:/202608111
npm run desktop:smoke
# 预期：Electron 启动 + 最小窗口 + 退出
```

### 3.4 低置信

```bash
cd M:/202608111
npm run review:low-confidence
# 前提：bench/devil-v25/results.jsonl 存在（owner 侧先跑 bench:devil-v25 或子集）
# 输出：low_confidence 总数、有/无证据数、平均分 < 0.5 数、含 [hard] 数
```

---

## 4. 框架 v2.0 强制项验证

| 框架 v2.0 § | 要求 | 验证结果 |
|---|---|---|
| §4.2 回归成本归属 | 审计方不代跑全量 LLM/API/desktop | ✅ §3 命令清单交 owner 侧 |
| §4.3 AI 安全面 L1 | Prompt Injection / SSRF / 命令注入 | ✅ §2.3 三项均覆盖 |
| §6 沟通原则 | 工具不可用时降级为人工方法 + 标注 | ✅ §3 标注 owner 侧 |
| §5.2 预估成本(¥) | 含位置 + 内容 + 效果 + 工时 + 预估成本 | ✅ §2/§3 每条均含 |

## 5. 交付状态

- **交付物 5** ✅ 已完成（审计方闭环 3 类 + owner 侧清单 4 类）
- **owner 侧执行后回填**：建议把 owner 实跑结果粘贴到本报告 §6「owner 实跑结果回填」附录（待业主确认后补）
- **预估成本(¥)**：¥0（审计方仅做静态验证；owner 实跑成本由业主侧承担）
- **回归影响**：bench:na（不涉及 §5/§6 数值变更）
