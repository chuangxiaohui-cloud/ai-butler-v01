# 意图路由设计

> 权威需求：§2.2 / §4.1；实现：`src/agent/`；进化流程：`docs/route-evolution-workflow.md`

## 1. 三层路由

| 层 | 输入 | 逻辑 | 输出 |
|----|------|------|------|
| Layer 1 特征提取 | cleanQuery、上下文、附件信号 | 规则或 LLM 提取 `IntentFeature` | features、extractionSource |
| Layer 2 规则表 | features | `ROUTING_TABLE` 打分排序、去重 | RouteCandidate[] |
| Layer 3 置信度门控 | candidates | [P-80]/[P-81]/[P-82] 阈值与消歧 | RouteDecision |

关键文件：`intent-feature.ts`、`extract.ts`、`routing-table.ts`、`router-v2.ts`、
`confidence-calibration.ts`、`clarify-templates.ts`。

## 2. 规则表概览

| 规则 | 主镜片 | 意图/执行器 | 说明 |
|------|--------|-------------|------|
| R001 | project_manager | plan / engineer | 项目级代码创建 |
| R002 / R009 | product_manager | write_doc / content_writer | 文档创建 |
| R003 / R022 | architect | execute / engineer | 原子代码或代码修改 |
| R004 / R14 | secretary | calendar_skill | 日程查询/创建 |
| R005 | secretary | im_dispatch | 发消息 |
| R006 | owner | clarify | 指代缺失澄清 |
| R_CULTURAL_REFERENCE | secretary | knowledge_qa + cultural_reply | 文化梗 |
| R_IMAGE_COLOR / R_IMAGE_GENERAL | architect / secretary | 颜色/图片 | 多模态 |
| R_DOCUMENT_* | secretary / architect | document_qa | 文档 QA/摘要/结构 |
| R007 / R007A / R007B | secretary | emergency / safety / property | 安全与紧急 |
| R008 / R012 / R016 / R018 / R018A / R019 | secretary | web_search | 各类搜索 |
| R010 | owner | cost_analysis | 财务分析 |
| R13 | owner | risk_review | PCB 安全审查 |
| R15 | owner | quote_compare | 报价对比 |
| R017 | secretary | github_reader | GitHub 分析 |
| R020 | secretary | rewrite | 改写 |
| R021 | secretary | project_packager | 项目打包 |
| R_BOM | secretary | schematic-bom | PDF 原理图生成元器件 BOM |
| R_CHAT | secretary | companion_chat | 陪伴聊天 |
| R_APPLY_TO_PROJECT | project_manager | apply_to_project | 工程落地（当前结构化澄清） |

规则表是静态配置；新增规则走“case 采集 → 候选 → 审核 → 入库”闭环，不直接硬编。

## 3. 消歧话术

`clarify-templates.ts` 按五主镜片提供三类模板：

- `missingReferent`：对象模糊。
- `options`：多方向选择。
- `lowConfidence`：低置信无法决策。

Layer 3 只取模板，不在业务代码拼话术。

## 4. 自进化闭环

1. 收集：`RouteCaseStore` 自动写 `data/route-cases.jsonl`。
2. 生成候选：`npm run route:calibrate`（确定性）或 `-- --llm`（LLM 提案）。
3. 人工审核：`npm run route:review` 或 CSV。
4. 导入结论：`npm run route:import-review`，回写 accept/reject。
5. 生成补丁：`npm run route:apply-rules` → 人工确认写入 `routing-table.ts`。
6. 阈值校准：`npm run route:apply-calibration`，样本达标后生成提案。

## 5. 模式映射

`mode-mapper.ts` 把五主镜片映射到 UI 三模式：

- architect → engineering
- product_manager → engineering + product_planning
- project_manager / owner → engineering + review_critique
- secretary → life（日程/消息/紧急）或 knowledge（其余）
