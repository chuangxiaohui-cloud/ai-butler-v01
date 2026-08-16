# 推进计划：产物文件列表接真实数据（E116）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

让右侧“文件”Tab 显示真实产物：gateway 扫描沙箱允许根目录
（projects / sandbox / outputs / data/datasheets）返回文件元数据，
UI 打开右侧栏与每次问答后自动刷新，Agent 生成的文件即时可见。

## 计划

1. 新增 `src/gateway/files.ts`：递归扫描允许根目录，跳过 .git/node_modules/build，
   按扩展名分类，限制深度与数量。
2. gateway 新增 `GET /api/files`。
3. UI 右侧文件 Tab 改为真实列表，打开与每次问答后刷新。
4. 补测试、登记需求文档（§13 / 附录 A E116），更新交接，提交推送。

**验收标准**

- `/api/files` 只返回沙箱根目录内文件，跳过 node_modules。
- UI 文件 Tab 显示真实路径/类型/大小。
- 问答完成后文件列表自动刷新。

## 执行过程

### 改动

- 新增 `src/gateway/files.ts` 与 `files.test.ts`。
- `src/gateway/app.ts`：`GET /api/files`。
- `ui/prototype/src/App.tsx`：`files` 状态 + `loadFiles`，问答后刷新。
- `src/gateway/app.test.ts`：files 形状测试。

## 结果

- 验证：主项目与 UI `npm run build` 通过；`npm run test:all` 单测 334/334 +
  集成 17/17 全绿；doc-lint 0 FAIL / 0 WARN。
- 提交：E116 已提交并推送 Gitee/GitHub。
- 遗留：SSE/流式 artifact 事件（生成中状态实时更新）、HTML 预览自动弹出、
  终端命令白名单/审批流、桌面端封装。
