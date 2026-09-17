# 推进计划：修复 E19 路由 must_clarify 误触

> 日期：2026-09-17 · 分支：v0.2b · 状态：**已完成**

## 目标

`Tauri 框架 架构 技术栈`（bench v02a E19 / github_analysis）不再落到 `must_clarify`，应走可回答路径（github 解读或知识搜索）。

## 计划

1. 复现：`routeV2` / `pipeline` 输出决策类型与候选。
2. 对照 `routing-table` / 特征提取，补规则或降低误澄清。
3. 单测 + `npm run dev` 单条复跑；更新交接。

## 执行

### 根因

- 裸词「框架」命中 `extract_structure`；无附件时仅有 `R_DOCUMENT_STRUCTURE`（要求 `hasDocument`）→ **零候选 `must_clarify`**。
- E19 问句无 GitHub URL，不可强行走 `github_analysis`（R017）；合理路径为知识搜索。

### 改动（E417）

1. `intent-feature.ts`：收窄 `extract_structure` 的「框架」为文档语境；新增「框架/架构/技术栈」名词堆叠 → `qa`。
2. `routing-table.ts`：新增 `R_EXTRACT_STRUCTURE_SEARCH`（`extract_structure` + `hasDocument:false` → `web_search`）。
3. `router-v2.ts`：将 `extract_structure` 纳入 `searchLikeAction`，无附件回退可 `direct`。
4. `router-v2.test.ts`：E19 直连 + 无附件结构回退；有附件文档结构仍 `confirm`/`document_structure`。

## 结果

| 项 | 结果 |
|----|------|
| `routeV2('Tauri 框架 架构 技术栈')` | `direct` / `web_search` / `qa` / conf=0.5 |
| `routeV2('帮我提取章节结构')` | `direct` / `web_search` / `R_EXTRACT_STRUCTURE_SEARCH` |
| 有附件「提取这个文档的结构」 | 仍 `confirm` / `document_structure` |
| `npm run build` | 通过 |
| `npm run test:all` | 单测全绿 + 集成 36/36（exit 0） |
| 需求附录 A E417 | 已登记 |
| `doc-lint` | 提交前复跑 |

## 未做

- 未重跑全量 devil / v02a 基准与 C.2 人工分。
- 未 push（无 upstream 或未指定远程）。
