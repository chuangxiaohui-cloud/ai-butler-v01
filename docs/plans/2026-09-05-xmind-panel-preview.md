# 推进计划：.xmind 面板只读预览——双击读回大纲文本（E345）

> 日期：2026-09-05 · 分支：v0.2b · 状态：已完成（未提交，待 owner 拍板批次 + 手动复验）

## 目标

owner 问「思维导图能在面板上显示吗？」——右栏产物区双击 `.xmind` 文件目前只会报「不支持预览二进制文件」。方案 A：双击 `.xmind` 时由 gateway 解包 zip、读回 `content.json` 树并序列化成文本大纲（中心主题 + WBS 编号行），在预览卡里展示。

## 计划

1. `src/gateway/files.ts`：抽公共预览路径解析/stat 校验（E337/E345 同口径防穿越）；新增 `readXmindFilePreview()`——`.xmind` 需整体解包，超 [P-151] 直接拒绝（`too_large`），损坏/非 xmind 回 `bad_xmind`，成功输出 `treeToOutlineText` 文本。
2. `src/gateway/app.ts`：`/api/files/preview` 改 async，按扩展名 `.xmind` 分发到 xmind 预览；新增错误码映射（too_large/bad_xmind → 415）。
3. 测试：`files.test.ts` 合法 .xmind 回读 / 超大拒绝 / 损坏 / 路径防护；`app.test.ts` 路由级 200 读回大纲 + 损坏 415。
4. UI：`App.tsx` 预览卡顶栏 `.xmind` 时标「思维导图 · 大纲」，正文 `<pre>` 已有无需改动。
5. 文档：计划（本文件）、需求附录 A E345、当日 handoff 登记。

**验收标准**

- 双击沙箱根内 `.xmind`，预览卡出现中心主题 + `1 / 1.1 / 2` 编号大纲，不再报二进制不支持；
- 损坏的 `.xmind`（伪 zip）与超大文件均 415 提示，文案区分「不是可读的 .xmind 文件 / 文件过大，不支持预览」；
- 文本类预览（.txt/.md/.kicad_sch 等）行为不变。

## 执行过程

### 改动

- `src/gateway/files.ts`：`FilePreviewResult` 错误码扩 `too_large`/`bad_xmind`；抽 `resolvePreviewPath`/`statPreviewFile`（`readTextFilePreview` 复用同口径，行为不变）；新增 `readXmindFilePreview`（`readFileSync` 全量 + `parseXmindBuffer` → `treeToOutlineText`，超 [P-151] 拒绝不截断）。
- `src/gateway/app.ts`：`/api/files/preview` 改 async，按 `.xmind` 扩展名分发；错误消息区分 too_large / bad_xmind。
- 测试：`src/gateway/files.test.ts` +4（E345 合法读回大纲 / 超大拒绝 / 损坏 bad_xmind / 不存在·目录·非法路径）；`src/gateway/app.test.ts` +1（路由级 200 读回大纲 + 损坏 415）。
- `ui/prototype/src/App.tsx`：预览卡顶栏 `.xmind` 时加「思维导图 · 大纲 ·」前缀（正文 `<pre>` 已有）。

### 遇到的问题

- 无（沿用 E337 只读防穿越口径；`.xmind` 为 zip 无法部分解包，故超上限直接拒绝而非截断——语义已在计划 1 与代码注释写明）。

## 结果

- 验证：`npm run build` 绿；`node --test dist/gateway/files.test.js dist/gateway/app.test.js` 38/38 全绿（含新增 E345 files 1 + gateway 1）；`npm --prefix ui/prototype run build` 绿（tsc+vite）；`npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）；全量 test:all/bench 未跑（成本纪律）。
- 测试：files 4/4 + gateway 34/34。
- 提交：未提交，待 owner 拍板批次。
- 遗留事项：owner 手动复验——重启 gateway 后双击右栏 `.xmind`，预览卡应出「中心主题 + 1/1.1/2 WBS 大纲」并标「思维导图 · 大纲」；损坏 `.xmind` 与超大文件给 415 中文文案。
