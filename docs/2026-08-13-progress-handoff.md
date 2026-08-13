# 进度交接 2026-08-13（v0.2b）

> 当前分支：`v0.2b`｜最新提交：`b0c3894`｜tag：`v0.2b`（分支与 tag 同名，git 有 ambiguous warning，不影响操作）
> 续作更新（2026-08-13 同日）：E8 融合评分负例区分修正、E9 P-04/P-02 定稿评估、E10 错误主题/FAQ 降权、E11-E14 WP11 冷调用续采、E15 Experience/Skill 管道注入、E16 远程通道/代码托管/Skill 市场需求增补、E17 Skill handler 深度输出、E18/E19 GitHub/Gitee 代码托管、E20 Skill 市场安装器、E21/E22 主 Agent 三层意图路由均已完成并登记附录 A；阈值 0.6 正例保留 67/75 持平、负例拦截 6/18（修订前 3/18），E1/E2 复验门评估 PASS（classify n=70），113/113 单测。Gitee 首推成功，GitHub 待补 Token 仓库创建权限。下一步仍按下方清单推进。

## 当前状态

- 单测 113/113 全绿；`npm run build` 通过。
- 31 条三引擎回归通过；`bench/v02a-report.md` 已基于最终代码更新。
- doc-lint 全量 0 FAIL / 0 WARN。
- E7-E22 已登记进需求文档附录 A（2026-08-13）。

## 今日已收口

1. **E1/E2 复验门首轮复核**
   - Stage 2 分类默认超时 500ms → 2000ms，对齐 [P-04]。
   - metrics 增加 `bocha_quota_skipped` / `anysearch_quota_skipped`，修掉配额跳过被计成超时的假阳性。
   - 新增 `scripts/recheck-gates.ts`、`bench/classify-metrics.jsonl`、`npm run recheck:gates`。
   - E1：n=30，2000ms 超时率 0%，准确率 80%（S02/L05 偏差由规则③兜底）。
   - E2：累计 n=62，Bocha 0%、AnySearch 8.1%；最近一轮双引擎均 0/31。
   - 结论：两个门均未触发重开，[P-02]/[P-04] 维持 provisional，定稿等 WP11 n≥30。

2. **融合评分与校准修复**
   - relevance 改为中文子串/二元组命中，不再把整句当一个 token。
   - 实体过滤器按完整型号精确匹配，`TPS5430` 不再误收 `TPS5430DDA`。
   - `scripts/calibrate-rule2.ts` 修正为按 5 次重复抓取聚合（原实现只用了最后一轮）。
   - 修订校准报告：`bench/v02a-rule2-calibration.md`。
   - [P-16]/[P-17] 仍 provisional，正负例分布仍有重叠，不在样本不足时强行定稿。

3. **文档与报告**
   - 需求文档 v2.5 附录 A 新增 E7。
   - `bench/v02b-report.md`、`v0.2b_MVP_实施规划.md` 已更新为收口状态。

## 明天继续（按优先级）

1. WP11 日常使用/回灌积累冷调用样本，n≥30 后推进 [P-04]/[P-02] 定稿评估。
2. [P-16]/[P-17] 保持 provisional；下一步建议先解决“标题/内容含关键词但实际不回答查询”的负例，再重新校准。
3. Experience/Skill 的 pipeline 注入仍按原规划留给 v1.0 或回灌期，不强行塞进 v0.2b。
4. L1 提取已由 E6 项目侧蒸馏兜底；如 MemoryCore 侧 prompt/模型适配，可评估回切。
5. MemoryCore delete 缺口结论已定：局部清理不可靠，`--reset` 用整目录重建。

## 数据与配额

- Bocha / AnySearch 本地日计数：各 94（2026-08-13）。
- Tavily 月计数：113（2026-08）。
- DeepSeek 分类样本：30 条已入 `bench/classify-metrics.jsonl`。

## 常用命令

```bash
npm run build
npm test
npm run bench:v02a
npm run recheck:gates -- --from=2026-08-12T18:09:00Z
npm run classify:smoke -- --rounds=3
npm exec tsx scripts/calibrate-rule2.ts -- --debug
npm exec tsx scripts/doc-lint.ts
```
