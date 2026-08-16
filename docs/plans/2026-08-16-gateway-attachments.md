# 推进计划：Gateway 附件接口 + UI 上传（E107）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

让「一人公司 AI-Agent」的 UI 能把粘贴图片、上传图片/文件真正送进 pipeline：
gateway `/api/ask` 接收 base64 data URL 附件，解码为 `RawFileLike`，走与 CLI
相同的图片/文档 Skill 链路；UI 的 `+` 上传菜单接上文件选择器。

## 计划

1. 新增 `src/gateway/attachments.ts`：base64 data URL → `RawFileLike`。
2. `/api/ask` 接收 `attachments[]`，校验后传入 `pipeline(files)`；
   JSON body 上限提到 25MB。
3. UI：附件状态从 data URL 字符串改为 `{ name, type, dataUrl }`；
   `+` 菜单接隐藏 file input，图片/文件均可上传；粘贴图片继续可用；
   `send()` 把附件一起 POST 到 gateway，失败回落本地草稿。
4. 补单测（解码、非法附件、图片附件走 VLM Skill），跑 build/test/doc-lint，
   登记需求文档（§13 / 附录 A E107），更新交接，重启 gateway。

**验收标准**

- 图片附件经 `/api/ask` 能进入 image-analysis Skill 并返回 VLM 描述。
- 非法 data URL / 空附件返回 400 且不泄露原始错误。
- UI 图片预览与非图片文件 chip 都能展示，发送后随消息上屏。

## 执行过程

### 改动

- 新增 `src/gateway/attachments.ts`（`dataUrlToRawFile`）与 `attachments.test.ts`。
- `src/gateway/app.ts`：`attachments[]` 校验/解码；`express.json` 上限 25MB。
- `ui/prototype/src/App.tsx`：新增 `Attachment` 类型、图片/文件隐藏输入、
  `addFile/addFiles`、非图片附件 chip；`send()` 携带附件调 gateway。
- `ui/prototype/src/styles.css`：非图片附件预览样式。
- 新增 gateway 图片附件端到端测试（FakeLLM + FakeProvider + 假 VLM）。

### 遇到的问题

- gateway 附件测试最初没走到 VLM：特征提取只发一条 user 消息，查询在
  `messages[0]`，测试却查 `messages[1]`；修正后断言通过。

## 结果

- 验证：主项目与 UI `npm run build` 通过；`npm run test:all` 单测 319/319 +
  集成 17/17 全绿；doc-lint 0 FAIL / 0 WARN。
- 提交：E107 已提交并推送 Gitee/GitHub。
- 遗留：三栏 → 主镜片映射、回答 streaming。
