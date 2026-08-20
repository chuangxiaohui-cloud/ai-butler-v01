# 进度交接 2026-08-17（v0.2b 续作）

> 当前分支：`v0.2b`｜最新提交：`0e987ec`｜Gitee 与 GitHub 已同步。

## 今日已收口

1. **搜索空结果兜底链（E125）**：子搜索全空时按“原句重试 → 简化句重试 →
   Bing/Baidu 浏览器搜索兜底”逐级回升；`BrowserSessionManager.searchWeb`
   新增真实浏览器结果页解析；修复“实时调整”被误判为 news 的意图问题；融合全空时
   按相关度抓 HTML 原文并放宽二次融合阈值到 0.3。
   - 单测 348/348 + 集成 17/17 全绿，doc-lint 通过。
   - 四条基准重跑全部回升：ET20（0/0 → low_confidence 0.52，3 证据）、
     SM18（→ none 0.61，3 证据）、SM31（0/0 → low_confidence 0.39，3 证据）、
     C08（→ none 0.83，1 证据），不再出现“我暂时无法确认”。
   - 详见 `docs/plans/2026-08-17-search-fallback-chain.md`。
2. **新基线全量重跑与重打分（E126）**：保留旧评分表，清空结果后全量重跑 122 条；
   平均自动分 1.59 → 1.73，0 分 17 → 12，“我暂时无法确认” 10 → 6；
   35 条系统级 Bug 修复 35/35，8 条能力项 6/8 有进展（P03/C05 仍兜底）；
   新增 `npm run baseline:devil-v25` 导出新基线 CSV + 摘要；
   详见 `docs/plans/2026-08-17-rescore-new-baseline.md`。
3. **开发全景文档链补全**：新增 `docs/adrs/README.md` 与 ADR-0001（技术选型 /
   分层策略 / 模块划分原则）、`docs/directory-structure.md`（目录与接口契约）；
   AGENTS.md 与 README 已接入推导链入口。
   详见 `docs/plans/2026-08-17-dev-overview-docs.md`。
4. **文档资产矩阵整理**：新增 `docs/documentation-map.md` 与 `docs/code-directory.md`；
   补齐架构层 5 份、设计层 7 份、工程层 4 份文档；交付期报告登记生成时机，不预置结论。
   详见 `docs/plans/2026-08-17-documentation-matrix.md`。
5. **第三方审核导航**：新增 `docs/audit-navigation.md`，把建议的逻辑目录
   （pipeline/router/search-providers/llm/ui/src-tauri/memory-core 等）映射到真实路径；
   不移动现有代码。
   详见 `docs/plans/2026-08-17-audit-navigation.md`。
6. **35 条 Bug 状态与回归用例（E127）**：新增
   `bench/devil-v25/bug-regression-status.md` 逐条登记状态/回归用例/验证依据；
   router-v2 补 5 条路由回归、`rm -rf` 拒绝、github-reader mock、project-packager
   zip 排除断言；CLI 实测发现并修复 C05 `pack_project` 提前短路 + Windows 路径被
   Stage 1 脱敏剥掉的问题；单测 357/357 + 集成 17/17 全绿，doc-lint 通过。
   详见 `docs/plans/2026-08-17-bug-regression-status.md`。

## 明天继续（按优先级）

1. 给 35 条 Bug 清单补状态字段与回归用例，验证 C05 打包与 C06 README 抓取稳定。
2. 对剩余 low_confidence 条目抽样复查，重点看融合阈值放宽是否引入低质证据。
3. 推进 A/B 套评测拆分（新旧基线 CSV 已就绪）。
4. 桌面链收口（个人自用不签名；后续按使用反馈微调 Tauri/Electron 壳）。

## 常用命令

```bash
npm run bench:devil-v25
npm run worksheet:devil-v25
npm run score-sheet:devil-v25
npm run review:devil-v25
npm run evidence:devil-v25
```
