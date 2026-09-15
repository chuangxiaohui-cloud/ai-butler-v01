# 推进计划：记忆冲突与栏位优先

> 日期：2026-09-12 · 分支：v0.2b · 状态：已完成

## 目标

落实 §8.3.2“新信息覆盖旧信息、当前栏位优先”：为可确定槽位的人格事实建立冲突键和栏位作用域，避免互斥偏好同时注入。

## 计划

1. 为冲突键、同栏覆盖、跨栏隔离和 global 回退补忆补测试。
2. 给 user_facts 只加 scope/conflict_key 两列，写入时归档同栏旧值，读取时当前栏优先。
3. pipeline 写入/读取传递当前 mode，记忆管理 API 只展示 global 与当前栏事实。
4. 同步 E371、目录文档与交接，完成低成本验证。

**验收标准**

- 同栏位同冲突键的新事实覆盖旧事实，旧记录保留但不再注入。
- 当前栏位事实优先于同键 global；其他栏位私有事实不可见、不可注入。
- 无可靠冲突键的普通事实互不覆盖；旧库无损迁移为 global、空冲突键。
- 主项目与 UI 构建、定向测试通过；不运行 E2E/bench，不提交。

## 执行过程

### 改动

- `persona-memory.ts` 为术语、称呼/表达方式和技术偏好生成保守冲突键；普通事实保持空键。
- `user_facts` 只加 scope/conflict_key 两列，旧表自动迁移；同栏同键写入归档旧值。
- `UserContextStore.load/listFacts` 按 global + 当前栏过滤并让当前栏覆盖 global；pipeline 与 gateway 传递 mode。

### 遇到的问题

- 纯规则无法可靠判断两条普通事实是否矛盾，因此只处理有明确槽位的偏好/术语，不做语义猜测。
- CLI/旧调用没有栏位上下文，继续使用 global 与兼容读取行为；桌面 UI 的 mode 才启用跨栏隔离。

## 结果

- 验证：`npm run build` 通过；`git diff --check` 无空白错误；`npm run doc-lint` 的 C1–C6/C8 通过，仍被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 测试：persona-memory + user-context-store 13/13，pipeline 2/2，gateway 1/1。
- 提交：未提交。
- 遗留事项：时间敏感事实的过期提示尚未落实，建议下一轮完成 §8.3.2 该项。
