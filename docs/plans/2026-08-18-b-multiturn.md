# 推进计划：B 套多轮会话评测

> 日期：2026-08-18 · 分支：v0.2b · 状态：已完成

## 目标

给 B 套 14 条记忆/上下文/多轮依赖题建立“播种上下文 → 连续问答 → 人工评分”的多轮评测，
避免单发评分系统性误伤。

## 计划

1. 新增 `scripts/bench-devil-b.ts`，14 个场景按统一 userId 连续跑。
2. 输出 `b-results.jsonl`、`b-multiturn.md`、`b-scores.example.json`。
3. 提供 `npm run bench:devil-b`，支持 `--limit` 快速验证。
4. 更新 E129、测试策略与交接。

## 执行过程

### 改动

- 新增 `scripts/bench-devil-b.ts`。
- `package.json` 新增 `bench:devil-b`。

### 遇到的问题

- `browserSession.close()` 在搜索兜底后会卡住，改为 2 秒超时后 `process.exit(0)`。

## 结果

- 14 个场景全部跑完并落盘。
- 报告改为“每题一段”结构：每轮包含原题、预期、回答、gate/conf/ev、人工分。
- 亮点：P10 找回 TPS5430；P07 按“老样子”出日报；C01 真实写入 `sandbox/b-c01-*/adc.c`；
  C05 第二轮真实产出 zip。
- 人工评分：`bench/devil-v25/b-multiturn.md` 已回填 28 轮得分与点评，平均 2.25；
  全 3 分场景为 EC10/EC24/EC29/P02/P10/C05，EC02 正式轮、P08 正式轮、C01 正式轮、C02 为后续补链路重点。
