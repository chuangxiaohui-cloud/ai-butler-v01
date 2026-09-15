# 推进计划：项目画像合并、缓存优先与过期重探测

> 日期：2026-09-14 · 分支：v0.2b · 状态：已完成

## 目标

完成 E407：同一工程的 Keil/STM32-GCC 证据字段级合并且不丢失平台能力；规划读取时屏蔽过期动作引用并要求重探测。

## 计划

1. 扩展画像契约，以 `capabilities` 保存各平台结构化 build 能力，顶层字段保持当前优选视图。
2. 实现字段级合并：来源优先级优先，同级证据取较新时间；同根身份不一致拒绝。
3. store 新增 merge-and-save 与规划读取；由调用方提供 `minimumObservedAt`，过期字段降为空且不得授权 build/flash。
4. Keil/STM32-GCC 画像写入改用合并入口，补定向测试并同步文档。

## 验收标准

- 同根 Keil/STM32-GCC 能力同时保留，不因后写覆盖前者。
- 用户确认 > 工程文件 > 工具探测 > 缓存 > 模型候选；同来源仅较新证据可替换。
- 过期 build/flash 在规划视图中为 `null`，返回 `staleFields` 与 `reprobeRequired=true`。
- 不新增 TTL 参数；截止时间由调用方显式提供，避免未经标定的新常量。
- 主项目 build、定向单测、schema JSON 与 `git diff --check` 通过；`doc-lint` 不新增失败。不运行全量、集成/E2E 或 bench。

## 执行过程

### 改动

- 项目画像新增按 `agentId` 区分的 `capabilities`，Keil 与 STM32-GCC 的结构化 build 能力可在同一工程共存。
- 新增字段级合并器；来源按既有优先级决定，同来源只接受更新的 `observedAt`，模型候选 target 不参与可信 target 合并。
- store 新增 `mergeAndSave` 与 `loadForPlanning`；后者由调用方传入截止时间，屏蔽过期 build/flash 与能力 build，并要求重新盘点。
- Keil、STM32-GCC server 统一改用合并保存；schema、需求、目录地图与验收记录已同步。

### 遇到的问题

- 同一工程的多平台 target 需要并存，但不能让模型候选借集合合并注入 target；最终仅合并工具探测、工程文件或用户确认来源的 target。
- `doc-lint` 仍有开工前已存在的 C7 provisional 超期（需求第 19 行，2 FAIL/0 WARN）；本轮未扩大处理范围。

## 结果

- `npm run build`：通过。
- MCP 项目画像、store、合并器、Keil、STM32-GCC 定向测试：28/28 通过。
- schema JSON：通过解析；`git diff --check`：通过。
- `doc-lint`：C1-C6/C8 通过，仅保留既有 C7 的 2 FAIL/0 WARN。
- 未运行全量测试、集成/E2E、bench 或真实 build/flash/串口；未提交。
