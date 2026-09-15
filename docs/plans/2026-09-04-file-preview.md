# 推进计划：文件面板只读预览（E337，2026-09-04）

> 关联：E328（目录监听）/ E335（临时文件过滤）/ §4.1 文件面板。
> 前置裁决：owner「A」选定本项——文件面板当前点文件只高亮、不能看内容。

## 目标

双击文件面板条目即可只读预览沙箱根内文本类文件（md/txt/json/html/kicad_sch 等），二进制/超长/越权路径给明确提示；防路径穿越，不改文件。

## 计划

1. `src/gateway/files.ts`：`SCAN_ROOTS` 导出 + `readTextFilePreview(workspaceRoot, relPath, maxBytes)`——绝对路径/`.`/`..`/非沙箱根拒绝，stat 校验，读前段 ≤ [P-151]，NUL 判二进制。
2. `src/config/params.ts`：新增 [P-151] `filePreviewMaxBytes`=512KB + PARAM_IDS 映射。
3. `src/gateway/app.ts`：`GET /api/files/preview?path=` 薄封装（400/404/415）。
4. UI：`ui/prototype/src/App.tsx` 双击文件行加载预览 + 顶部预览卡（✕ 关闭）；`styles.css` `.file-preview*` 样式。
5. 测试与文档：files 单测（文本/截断/空/二进制/目录/不存在/非法路径）、gateway 路由用例；§5 P-151、附录 A E337、本计划、09-04 交接。

**验收标准**

- `npm run build` 绿；files 定向 3/3；gateway E337 用例绿；`npm --prefix ui/prototype run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/gateway/files.ts`：`ROOTS` 改名导出为 `SCAN_ROOTS`；新增 `FilePreviewResult` 与 `readTextFilePreview()`（open/readSync 只读前段，超长不整读；含 NUL → binary）。
- `src/config/params.ts`：`filePreviewMaxBytes: 512 * 1024`（P-151）。
- `src/gateway/app.ts`：`/api/files/preview` GET；错误映射 bad_path→400 / not_found→404 / not_file、binary→415。
- UI：`App.tsx` 增 `filePreview/filePreviewError` 状态 + `previewFile()`；文件行 `onDoubleClick`；预览卡含路径/KB/截断标注/✕。`styles.css` 增 `.file-preview/.file-preview-bar/.file-preview-close/.file-preview-body`（body 限高 320px 内滚动、pre-wrap）。
- 测试：files 新增 E337 单测一条（14 断言含 7 种非法路径）；app.test 新增 E337 路由用例（穿越与非沙箱根 400、不存在 404）。

### 遇到的问题

- 无（实现按计划一次通过；仅测试里手工字节数误写修正一处）。

## 结果

- 验证：`npm run build` 绿；files 3/3 + gateway E337/E336 用例绿；`npm --prefix ui/prototype run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN（151 参数 / 77 key 引用）；全程零外部 LLM/API（¥0）。全量 test:all/bench 未跑（成本纪律）。
- 文档：需求 §5 P-151 行、附录 A E337、本计划、09-04 交接已同步。
- 提交：未提交（待 owner 拍板批次）。
- 遗留事项：HTML 预览仍走浏览器 tab（文件面板文本预览不做渲染，防脚本执行）；真实 UI 冒烟待 owner——gateway 8787 双击 `projects/` 下文本文件应出预览卡、双击 PDF/二进制给提示。
