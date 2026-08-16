# 推进计划：Pipeline 进度事件 + HTML 预览自动弹出（E119）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

让问答过程可见、产物可预览：pipeline 各阶段回调进度事件经 SSE 广播，UI 顶部显示
当前阶段；检测到 HTML 产物时右侧栏自动展开并切到浏览器 Tab。

## 计划

1. `PipelineOptions` 增加 `onProgress(stage)`，在 Stage1-6 关键节点回调。
2. gateway `/api/ask` 把进度发布为 SSE `progress` 事件。
3. `files.ts` 把 `.html/.htm` 归为 `HTML 预览`；UI `files_changed` 时若存在
   HTML 产物自动打开浏览器 Tab。
4. UI EventSource 常驻监听 `progress`，顶部显示当前阶段；完成后清空。
5. 补测试、登记需求文档附录 A（E119），更新交接，提交推送。

**验收标准**

- pipeline 全链路回调包含 stage1-stage6。
- `/api/ask` 完成后订阅者收到 `progress` 与 `files_changed`。
- HTML 文件出现时右侧栏自动切到浏览器。

## 执行过程

### 改动

- `src/search/pipeline.ts`：`onProgress` 六阶段回调。
- `src/gateway/app.ts`：progress 发布；`files.ts` HTML 分类。
- `ui/prototype/src/App.tsx`：progress 显示 + HTML 自动预览。
- 测试：pipeline onProgress、gateway progress 事件、files HTML 分类。

## 结果

- 验证：主项目与 UI `npm run build` 通过；`npm run test:all` 单测 338/338 +
  集成 17/17 全绿；doc-lint 0 FAIL / 0 WARN。
- 提交：E119 已提交并推送 Gitee/GitHub。
- 遗留：文件“生成中”逐条实时状态（仍需 Skill 级事件）、桌面端封装。
