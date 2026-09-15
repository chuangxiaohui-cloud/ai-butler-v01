# 推进计划：记忆资产 ACL

> 日期：2026-09-12 · 分支：v0.2b · 状态：已完成

## 目标

按 §8.1.2 的三栏固定装备关系，为记忆管理 API 与 UI 增加默认拒绝的资产访问控制，避免不同角色查看或删除未装备的记忆资产。

## 计划

1. 固化三栏到 Chat Memory / Skill / Wiki / CodeGraph 的权限矩阵，并为缺失或非法栏位建立默认拒绝测试。
2. 在 gateway 记忆读取与遗忘入口执行 ACL，UI 随当前栏位传递访问上下文。
3. 同步需求变更记录、目录文档与交接，并完成低成本验证。

**验收标准**

- 工程栏只返回 Skill 经验，知识栏返回 Chat Memory 与 Skill 经验，生活栏只返回 Chat Memory。
- 缺失、非法栏位或跨资产遗忘请求返回 403，且不改变存储内容。
- 主项目构建、ACL/gateway 定向测试、UI 构建通过；不运行 E2E/bench，不提交。

## 执行过程

### 改动

- 新增 `src/memory/asset-acl.ts`，固化三栏到四类资产的装备矩阵与默认拒绝判断。
- gateway 读取按栏位过滤 fact/session/experience，遗忘在触发存储写入前校验栏位与资产。
- UI 记忆设置传递当前栏位并展示装备清单；同步 E367、目录文档与当日交接。

### 遇到的问题

- 现有记忆管理 API 只有 Chat Memory 与 Skill 经验，没有 Wiki/CodeGraph 条目；本轮保留其装备声明，不构造虚假数据，也不扩展到 pipeline 推理上下文。

## 结果

- 验证：`npm run build`、`npm --prefix ui/prototype run build` 通过；`git diff --check` 无空白错误。`npm run doc-lint` 的 C1–C6/C8 通过，仍被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 测试：`node --test dist/memory/asset-acl.test.js dist/gateway/app.test.js` 39/39 通过。
- 提交：未提交。
- 遗留事项：问答 pipeline 内部是否按角色裁剪上下文需单独评估；Wiki/CodeGraph 接入真实资产源后再扩展管理列表。
