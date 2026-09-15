# 推进计划：Archify 生成输出非法 JSON 时救场一次（E356）

> 日期：2026-09-06 · 分支：v0.2b · 状态：完成（未提交，待 owner 复测）
> 关联：owner L1 后短问「画个订单系统发布流程图」执行回执失败：`把描述整理成 系统架构图 图数据失败（Expected ',' or ']' after array element in JSON at position 564 (line 32 column 6)）`。定位：detectDiagramType 判定正确（workflow）；失败来自主模型单次输出非法 JSON，parseModelJson 抛错后 index.ts 生成段直接 0.3 收据、无重试机会（E352 原始设计只对“结构校验失败”有 ≤2 轮修复，不覆盖“生成即 JSON 语法坏”）。

## 目标

模型偶发输出非法 JSON 时给一次「只重出合法 JSON」的救场调用，避免用户一次失败就收到 0.3 兜底；两次仍失败才如实收据（诚实边界不变）。

## 方案（最小）

1. `src/skills/archify/prompt.ts`：新增并导出 `buildRescuePrompt(query, type, previousRaw, reason, { quality })`——告知错误、丢弃上一版、重新输出一张完整合法 JSON（禁代码块/解释/think；附用户描述与上一版前 2000 字符对照）。
2. `src/skills/archify/index.ts` 生成段：生成→parse 失败时用 rescue 提示再调一次；仍失败才走既有 0.3 收据（错误信息保留在文案里）。
3. 不动：修复轮、渲染、路由、L1 补全小节、UI。

## 测试与验收

- `index.test.ts`：① 首次输出非法 JSON → 救场第二次合法 → 正常 validate/deliver 交付、LLM 调用 2 次；② 两次都非法 → 0.3 收据、文案含「图数据失败」与解析错误、无 HTML。
- `prompt.test.ts`：rescue 提示含错误/上一版输出/「重新输出」。
- `npm run build` 绿；`node --test dist/skills/archify/*.test.js` 绿；`npm run doc-lint` 0 FAIL 0 WARN；零外部 LLM（¥0，测试全 Fake）。
- 手动（owner）：重启 gateway 后重发「画个订单系统发布流程图」——偶发坏 JSON 时自动救场成功，不再直接 0.3。

## 执行过程

### 改动

- `src/skills/archify/prompt.ts`：+ `buildRescuePrompt`。
- `src/skills/archify/index.ts`：生成段加一层 parse 失败救场（最多 1 次，成本可控）。

### 遇到的问题

- （无。）

## 结果

- `npm run build` 绿；prompt.test 5/5 + index.test 7/7；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0）。
- 待 owner 重启 gateway 复测短问。
