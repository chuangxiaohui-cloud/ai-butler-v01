# 进度交接 2026-08-16（v0.2b 续作）

> 当前分支：`v0.2b`｜最新提交：`1bd24fd`｜Gitee 与 GitHub 已同步。

## 今日已收口

1. **魔鬼训练缺陷清单审阅**：审阅 `魔鬼训练_模型能力问题参考.csv`（8 条）与 `魔鬼训练_系统级故障Bug清单.csv`（35 条），并逐条对照 `results.jsonl` 复现；43 条 0 分 = 35 系统级故障 + 8 兜底/澄清问题，覆盖完整；详见 `docs/plans/2026-08-16-devil-bug-review.md`。

## 明天继续（按优先级）

1. 把 35 条 Bug 转成回归用例（安全 > JSON 泄露 > 路由），修复后重跑 `bench:devil-v25` 确认转绿。
2. 修正两份清单措辞：安全误匹配拆“通用人身急救模板/溺水模板”，能力问题改“低置信兜底/澄清误触发”。
3. 继续攒路由校准样本，推进 A/B 套评测拆分。

## 常用命令

```bash
npm run bench:devil-v25
npm run worksheet:devil-v25
npm run score-sheet:devil-v25
npm run review:devil-v25
npm run evidence:devil-v25
```
