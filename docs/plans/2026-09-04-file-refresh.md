# 推进计划：文件面板手动「刷新」按钮（E338，2026-09-04）

> 关联：E328（目录监听自动刷新）/ E337（文件面板预览 + 滚动可达）。
> 前置裁决：owner 多次复验遇到“文件不显示/没刷新”的困惑（本属 SSE 监听场景，但手动刷新入口缺失）；按推荐直接开工。

## 目标

文件 tab 顶部提供手动「刷新」按钮，SSE 未连/监听中断或想立即确认时可直接重拉 `/api/files`，不必靠切 tab 或等事件。

## 计划

1. `ui/prototype/src/App.tsx`：`loadFiles(autoPreview, markBusy)` 支持忙态；文件 tab 顶部工具栏（左侧「共 N 个文件…」提示 + 右侧「刷新」按钮，复用 notify-toolbar 样式）。
2. 构建与文档：UI build；附录 A E338、本计划、09-04 交接。

**验收标准**

- `npm --prefix ui/prototype run build` 绿；纯前端改动（src 无变更，既有单测不受影响）；doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- `ui/prototype/src/App.tsx`：`filesRefreshing` 状态；`loadFiles` 增加 `markBusy` 参数控制按钮禁用与文案（成功/失败都复位）；原顶部 count 提示并入工具栏左侧，右侧新增刷新按钮。

### 遇到的问题

- 无。

## 结果

- 验证：`npm --prefix ui/prototype run build` 绿（tsc+vite）；纯前端改动，src 既有单测不受影响；`npm run doc-lint` 0 FAIL 0 WARN；零外部 LLM/API（¥0）。
- 文档：需求附录 A E338 登记、本计划、09-04 交接已同步。
- 提交：未提交（待 owner 拍板批次）。
- 遗留事项：真实 UI 冒烟待 owner——文件 tab 点「刷新」应重拉列表（按钮短暂变「刷新中…」）；可先删一个文件再点刷新确认同步。
