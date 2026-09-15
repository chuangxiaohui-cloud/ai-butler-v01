# 推进计划：人格数据分层映射

> 日期：2026-09-12 · 分支：v0.2b · 状态：已完成

## 目标

落实 §8.1.3 的人格数据分离：术语/用语偏好进入 Chat Memory L1，技术偏好进入 L2，长期职业画像继续由 user_profile 承载为 L3，场景模板继续归 Skill。

## 计划

1. 为人格事实的确定性分类与旧库迁移补测试。
2. 给 user_facts 增加只加列的 kind/layer 元数据，写入、纠正、读取和记忆管理 API 使用真实层级。
3. 同步 E369、目录文档与交接，完成低成本验证。

**验收标准**

- 术语映射和表达习惯归 L1，技术平台/工具链/编码偏好归 L2，普通事实保守归 L1。
- 旧 user_facts 数据无损迁移并默认归 general/L1。
- 记忆管理 API 不再把所有 fact 硬编码成 L2。
- 主项目构建与定向测试通过；不运行 E2E/bench，不提交。

## 执行过程

### 改动

- 新增 `persona-memory.ts`，按明确语义规则区分术语、用语偏好、技术偏好和普通事实。
- `user_facts` 只加 kind/layer 两列；构造时自动迁移旧表，新增/重复/纠正写入同步分类。
- `MemoryFact`、公开事实列表和 gateway 记忆列表改用持久化的真实层级；UI 筛选标签同步为 L1 事实/情景、L2 场景知识；同步需求、目录与交接。

### 遇到的问题

- 自由文本可能同时包含“喜欢”和技术名词；只有偏好表达与技术对象同时出现才归 L2，无法确定时保守归 general/L1。
- “我是……”可能描述长期画像，但本轮不据此静默覆盖 user_profile，继续保持 E365 的手工画像优先边界。

## 结果

- 验证：`npm run build`、`npm --prefix ui/prototype run build` 通过；`git diff --check` 无空白错误；`npm run doc-lint` 的 C1–C6/C8 通过，仍被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 测试：persona-memory + user-context-store 11/11，gateway memory API 1/1，既有集成回归 3/3。
- 提交：未提交。
- 遗留事项：若以后支持自然语言修改 L3 画像，应增加明确确认，而不是复用普通“记住”写入。
