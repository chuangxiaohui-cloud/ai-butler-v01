# 计划：运行时看门狗 synthesis_timeout 环境噪音显式化（E282）

> 日期：2026-08-29 · 对应 E282 · 用户选定推进项（架构审阅 4.1 推荐）

## 背景

8 月以来多次出现「单测全绿但用户实测翻车」循环，根因是 API 延迟波动 / bench 高频调用 / Tavily 配额耗尽三类环境噪音没有专门运行时观测（架构审阅 4.1）。Q2 两次 `synthesis_timeout` 即典型：探针与 usage 能事后定位，但缺少在用户侧运行时的显式告警。

## 计划

1. `src/config/params.ts`：新增 `[P-140]` 窗口 3600000ms、`[P-141]` 阈值 0.2，同步 `PARAM_IDS` → 验证：build
2. 新增 `src/maturity/runtime-watchdog.ts`：订阅 `data/trajectory.jsonl` answer 事件，窗口内 `synthesis_timeout` 占比 ≥ 阈值时返回告警 → 验证：单测
3. `src/search/pipeline.ts`：`opts.watchdog` 开启时收尾追加 toolNotice 告警；`src/main.ts`、`src/gateway/app.ts` 启用 → 验证：build
4. 需求文档 §5 注册 P-140/P-141、附录 A 登记 E282 → 验证：doc-lint
5. `docs/code-directory.md`、`docs/directory-structure.md` 同步 `runtime-watchdog.ts` → 验证：手工核对

## 执行

- `src/config/params.ts`：新增 `[P-140]`（watchdogWindowMs=3600000ms）与 `[P-141]`（watchdogTimeoutRatio=0.2），同步 `PARAM_IDS`；注释引用 P-NN。
- 新增 `src/maturity/runtime-watchdog.ts`：`checkSynthesisHealth()` 读取 `data/trajectory.jsonl`，窗口内 answer 事件中 `synthesis_timeout` 占比 ≥ 阈值时返回告警文案；缺失文件/坏行/非 answer 事件静默忽略。
- 新增 `src/maturity/runtime-watchdog.test.ts` 7 条：阈值命中/无超时/低于阈值/窗口外忽略/缺文件降级/非 answer 与坏行忽略/单次超时 100%。
- `src/search/pipeline.ts`：`PipelineOptions.watchdog` 开启时，answer 轨迹落盘后把看门狗告警 `unshift` 进 `toolNotices`；`src/main.ts` 与 `src/gateway/app.ts` 生产接线 `watchdog: true`，测试默认关闭。
- 需求文档 §5 注册 P-140/P-141（provisional@2026-08-29）、附录 A 登记 E282；`docs/code-directory.md`/`docs/directory-structure.md` 同步新模块。

## 结果

- `npm run build` 绿。
- runtime-watchdog 单测 7/7 绿；pipeline 单测 56/56 绿；gateway 单测 24/24 绿。
- `npm run doc-lint` 0 FAIL 0 WARN（C8 64 key）。
- 未跑 `bench:devil-v25`（成本纪律 + Tavily 配额未恢复，用户手动排期）。
