# 推进计划：文件面板「最近变更」记录（E339，2026-09-04 开工 / 跨零点收口）

> 关联：E328（projects/ 目录变更监听）/ E335-E338（文件面板批次）。
> 来源：§4.1.2 右栏产物区 = 「项目产物文件列表 + 变更记录 + 风险提示」——列表/预览/刷新已就位，缺「变更记录」。
> 方案裁决：本项在方案 A（gateway 内存环，零持久化）与方案 B（data/ JSONL 落盘）间取舍；按项目「简单优先」与 E328 红线（变更不进通知库、不触发 LLM）选 A 开工，B 留作需要审计记录时的后续轮。

## 目标

把 E328 watcher 已算出的差量（新增/修改/删除 + 路径）变成 UI 可见的「最近变更」列表，让 owner 一眼确认外部改动确实被监听。

## 计划

1. `src/gateway/change-history.ts`（新）：内存环 `recordProjectChanges()` / `listProjectChangeRecords()` / `clearProjectChangeHistory()`，同批保持 watcher 入参原序、新批在前，上限 50 条。
2. `src/gateway/server.ts`：watcher `onChange(changes)` 先入环再广播 `files_changed`。
3. `src/gateway/app.ts`：新增只读 `GET /api/files/changes`（新→旧）。
4. `ui/prototype/src/App.tsx` + `styles.css`：文件 tab 工具栏下方「最近变更」区（标签 新增/修改/删除 + 路径 + 时间；挂载 / files_changed / 手动刷新三处拉取，UI 最多展示 30 条）。
5. 测试与文档：change-history + gateway 路由单测；附录 A E339、本计划、目录地图、09-04 交接。

**验收标准**

- `npm run build` 绿；change-history 定向单测 + gateway 全绿；`npm --prefix ui/prototype run build` 绿；doc-lint 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）。
- 边界说明：内存环随 gateway 重启清空（非审计记录）；ask 写盘事件自身不带 diff，由 watcher 下一轮（≤2s）自然补录，属预期。

## 执行过程

### 改动

- `src/gateway/change-history.ts`（新）：`ProjectChangeRecord`（path/kind/at）；倒序 unshift 使同批差量保持 watcher 原序；`list` 返回浅拷贝防外部污染。
- `src/gateway/server.ts`：`onChange` 回调改为先 `recordProjectChanges(changes)` 再 `publishArtifactEvent(...)`。
- `src/gateway/app.ts`：`GET /api/files/changes` 返回 `{ changes }`。
- `ui/prototype/src/App.tsx`：`ChangeRecord` 接口 + `recentChanges` 状态 + `loadRecentChanges()`（失败静默清空）+ `formatChangeTime()`（当天 HH:mm:ss / 跨天 MM-DD HH:mm）；挂载 effect、`files_changed` SSE、手动刷新三处接线；渲染「最近变更」卡片。
- `ui/prototype/src/styles.css`：`.change-log*` / `.change-row` / `.change-kind.{added,modified,removed}` 最小样式。

### 遇到的问题

- 编辑过程中 CRLF/LF 混写导致 app.test.ts 与 App.tsx 出现“每行后多一个空行”的整文件损伤，已按偶数行重建还原并复跑 build + 全绿后继续（与功能无关）。

## 结果

- 验证：`npm run build` 绿；change-history 定向 3/3 + gateway 全绿（新增 E339 路由用例：空环空数组、记录两条后新→旧字段齐全）34/34；`npm --prefix ui/prototype run build` 绿；全程零外部 LLM/API（¥0）。
- 文档：需求附录 A E339 登记、本计划、code-directory/directory-structure gateway 行、09-04 交接已同步。
- 提交：未提交（与 E335-E338 同批，待 owner 拍板统一提交）。
- 手动复验（owner，2026-09-05）✅：重启 gateway 后，在 `projects/` 用记事本新建/修改/删除文件，文件 tab 顶部「最近变更」约 1–2s 内分别出现 新增/修改/删除 行、最新在最上；重启后记录清空属预期。
