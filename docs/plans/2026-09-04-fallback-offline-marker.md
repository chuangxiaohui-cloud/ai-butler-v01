# 推进计划：网关未连接本地兜底加醒目标识 + 「重试」按钮（E332）

> 日期：2026-09-04 · 分支：v0.2b · 状态：已完成
> 承接：owner「A」——E331 手动验收时发现：gateway 未启动时 UI 的本地兜底回复与真实回复形态一致，
> 还会带假的文件/终端证据（hardware/next-task.kicad_sch、task-run.log），容易把“没执行”误当真实路由结果。

## 目标

网关不可达时，兜底回复明确标注「未执行 + 本地预览」，去掉演示用假证据，并提供「重试」一键重发原请求。

## 改动

- `ui/prototype/src/App.tsx`：
  - `Message` 增 `retryQuery?: string`（兜底回复携带原请求）。
  - `ReplyDraft()` 重写：不再按 mode 给演示文案/假证据，改为固定提示「⚠️ 网关未连接，刚才的请求没有真正执行（本地预览，非真实回答）…」，
    meta 为「{模式} · ⚠️ 本地预览」，并带 `retryQuery`。
  - `send()` 抽出 `askQuery(text, attachments, dropMsgId?)`：重试时先摘掉原兜底回复、不重复追加用户气泡；`send` 为原入口包装；
    新增 `retryFallback`（防连点 `retryingId`）。
  - `MessageItem` 增 `onRetry/retrying` props；有 `retryQuery` 时在消息下方渲染「↻ 重试」按钮。
- `ui/prototype/src/styles.css`：增 `.message-retry` 样式（含禁用态）。

## 结果

- 验证：`npm --prefix ui/prototype run build` 绿（tsc + vite）；纯前端改动无 src 单测影响；`npm run doc-lint` 0 FAIL 0 WARN；
  全程零外部 LLM/API（¥0）。全量 `test:all`/bench 未跑（成本纪律）。
- 手动验收要点（owner）：关掉 gateway 提问 → 出现「⚠️ 本地预览」兜底（无假证据）；启动 gateway 后点「↻ 重试」→ 收到真实回复，且不重复用户气泡。
- 文档：需求文档附录 A E332 登记；本计划；09-04 交接追加轮。
- 提交：未提交（延续工作区待统一确认批次）。
