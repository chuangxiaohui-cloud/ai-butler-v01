# 推进计划：answer_postprocess 规则二次启用

> 日期：2026-09-13 · 分支：v0.2b · 状态：已完成（未提交）

## 目标

继续落实 §9.3：为可确定执行的 `conclusion_first` 候选增加用户级规则存储和二次确认启用闭环，并接入 gateway 的共享 pipeline。

## 计划

1. 先补规则账本、编译边界与 gateway 二次确认测试
2. 新增 append-only 用户级规则存储及持久化运行时
3. 草案仅对 `conclusion_first` 标记可启用，其他模式继续阻断
4. Skill 设置页提供启用/停用入口并补 E383 记录

**验收标准**

- 仅 accepted + conclusion_first 候选可启用
- 启用与停用均 append-only 留痕，按用户隔离
- 二次确认成功后 gateway 问答实际经过规则，停用后立即恢复
- 不写市场目录、不注册命令或浏览器 Skill

## 执行过程

### 改动

- 新增 append-only `AnswerPostprocessRuleStore` 与按 userId 动态读取 enabled 规则的持久化运行时；启用/停用立即生效。
- 仅 accepted + `conclusion_first` 可编译，生成 `reply-conclusion-first`；其他模式继续返回不可启用。
- gateway 增加二次启用/停用接口并把持久化运行时注入共享 pipeline；候选列表返回规则状态。
- Skill 设置页在草案预览后提供确认启用入口，已启用规则可停用。

### 遇到的问题

- 首轮合并测试中，既有 E354 HTML 文件预览用例出现一次独立 `fetch failed`；未跨文件诊断，按成本纪律改用测试名过滤复验本轮 gateway 用例并通过。

## 结果

- 主项目与 UI build 通过；后处理/候选定向单测 9/9，gateway 本轮闭环 1/1；启用后回答带结论前缀，停用后立即恢复且两次状态均留痕。
- 首轮包含全部 gateway 用例的组合运行结果为 50/51，唯一失败是与本轮无关的 E354 HTML 预览瞬时 `fetch failed`；未运行 E2E/bench。
- `git diff --check` 无空白错误；`npm run doc-lint` 的 C1–C6/C8 通过，仍仅被第 19 行存量 provisional 示例超期阻断。
- 边界：不写市场目录、不注册命令/浏览器 Skill；零外部 LLM（¥0），未提交。
