# 魔鬼训练 v2.5 最小修复包（执行与审阅）

> 日期：2026-08-16 | 范围：JSON 泄露 / 意图路由 / 安全路由 + 《模型能力问题参考2》审阅

## 1. 《模型能力问题参考2.csv》审阅结论

8 条 REF 的“模型能力边界”归因大部分**不成立**，更准确的定性是“系统能力缺口”：

| REF | 内容 | 修正归因 |
|---|---|---|
| REF-001 | 查 datasheet 拒答 | 基准脚本未注入浏览器/搜索依赖，且低置信兜底话术被当成“拒答” |
| REF-002 | 整理历史方案 | 缺上下文记忆召回，是 L2 记忆链路未接通 |
| REF-003 | 跟进任务进度 | 缺任务跟踪类路由/Skill，不是模型不懂中文 |
| REF-004 | 需求拆子任务 | 缺 plan 拆解执行链路 |
| REF-005 | 分析波形异常 | 多模态/VLM 未接入管道 |
| REF-006 | “大殖子”黑话 | 黑话映射表缺词条，可规则化修复 |
| REF-007 | “按老规矩来” | L2 记忆召回未注入基准 |
| REF-008 | “老样子帮我订” | Skill 调用未注入基准，且“订”缺时间参数应澄清 |

关键原因：`bench:devil-v25` 之前用裸 `pipeline(query, {tavily})`，没有注入 `userContextStore/skillLifecycle/experienceManager/browserSession/skillDeps`，导致记忆、技能、浏览器全部缺席，很多条目必然低分。本次已把基准脚本改为与 CLI 同款依赖。

## 2. 已落地修复

### 2.1 响应净化器 + Skill 输出契约

- `toDisplayText`：对象含 `error` → 友好提示；含 `recipient/content/outboxId` → “已记录到本地待处理队列”；含 `events` → 日程文本；不再原样 JSON.stringify。
- `calendar-skill`：缺时间从 `{error:'missing_time'}` 改为“请问您想安排在什么时间？例如明天上午十点”；成功/查询改纯文本。
- `content-writer`：无 LLM / 失败改纯文本；成功直接返回 Markdown 正文。
- `im-dispatch`：成功/失败改纯文本（含 pending 状态）。

### 2.2 意图路由

- `scoreRule` 增加 `actionType` 硬门：`qa` 问题不再因 code/document 字段命中 `create/send/schedule` 规则（这是 24 条路由误判的根因）。
- `ACTION_RE` 调整：`qa` 提到 `create/send/schedule` 前；`analyze` 与 `qa` 撞车时，除颜色/图片场景外问句优先 `qa`；qa 词表补充 怎样/哪些/推荐/选型 等。
- `routeFromFeatures`：`qa + web_search` 直接放行，不再落入 option_clarify。
- 新增 11 条负样本回归测试 + 非法/财产安全路由测试。

### 2.3 安全路由三分

- 新增 `illegal_request` / `property_emergency` 两个 actionType 与路由规则。
- `pipeline` 新增 `safety_refusal`（gate=safety）与 `property_emergency`（gate=emergency）分支。
- `emergency-reply` 增加 `buildSafetyRefusalReply` / `buildPropertyEmergencyReply`，`buildEmergencyReply` 也先判非法/财产再走人身急救，解决“破解 WiFi 回溺水救援”。

## 3. 验证

- `npm run build` 通过。
- `npm run test:all`：单测 276/276 + 集成 17/17 全绿。
- 新增用例覆盖：toDisplayText 拦截 JSON、calendar/content/im 纯文本契约、11 条路由负样本、破解 WiFi 拒绝、手机进水财产止损。

## 4. 剩余项（下一轮）

- 24 条路由负样本的“校准规则”正式入库（本批先用规则硬修复 + 单测兜底，`route:apply-calibration` 流程可继续灌样本）。
- EC11/EC19/EC21/EC22 等“缺信息应澄清/幽默”条目仍走 option_clarify，需细化 clarify 模板。
- C06 GitHub 项目分析、C08 复合指令拆分、E39 代码生成需注入 skillDeps 后重跑确认。
- 全量重跑 `npm run bench:devil-v25:reset`，用新基线重打分并回归 35 条 Bug。

