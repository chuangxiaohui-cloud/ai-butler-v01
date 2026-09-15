# 推进计划：产物 HTML 面板内直接看图（E354）

> 日期：2026-09-06 · 分支：v0.2b · 状态：完成（未提交，待 owner 手动验收）
> 关联：owner 手动验收 E352 Archify 时问「outputs/archify/archify-*.html 为什么不能用内置浏览器打开」——查证：右栏「浏览器」tab 只是证据来源提示面板（App.tsx:1244-1255），文件双击预览对 .html 走 readTextFilePreview 纯文本读（files.ts:151-188），不渲染。owner 拍板「要做成面板里直接看图」。

## 目标

产物区 HTML（Archify 系统图等）双击后在面板内 iframe 渲染为可交互页面，不再显示源码文本；保留沙箱路径防护与只读语义。

## 方案（最小）

1. files.ts：导出 readHtmlArtifactRaw(workspaceRoot, relPath)——复用 resolvePreviewPath/statPreviewFile 同口径防穿越，仅放行沙箱根内 .html/.htm，整文件读回 Buffer（不截断）。
2. app.ts：新增只读 GET /api/files/raw?path=——200 返回 text/html; charset=utf-8（Cache-Control no-store + nosniff），错误 400/404/415 JSON 与 /api/files/preview 同风格。
3. ui App.tsx：双击 .html/.htm 不再请求 /preview，改为渲染 iframe（sandbox 禁同源/父窗口访问，allow-scripts 保交互）；预览条加「浏览器打开」外链按钮。
4. styles.css：.file-preview-frame（白底、定高、可滚动）。

## 测试与验收

- files.test.ts 单测：合法 html 全量读回 / 非 html 拒绝 / 缺失 404 / 穿越与非沙箱根 400（同 preview 口径）。
- app.test.ts：/api/files/raw 端点 200 Content-Type text/html + 防护 400/415。
- npm run build + UI build + doc-lint 0 FAIL 0 WARN；不自主跑 test:all/bench（成本纪律）。
- 手动（owner）：双击 outputs/archify/architecture-*.html → 面板内出现可缩放/主题切换的系统图；「浏览器打开」在新标签渲染。

## 执行过程

### 改动

- files.ts：新增 readHtmlArtifactRaw（复用私有 resolvePreviewPath/statPreviewFile；错误 not_html 新增进返回联合）。
- app.ts：/api/files/raw 路由（错误映射 bad_path 400 / not_found、not_file 404 / not_html 415）。
- ui/prototype/src/App.tsx：filePreview 状态增 htmlUrl；previewFile 对 .html/.htm 短路为 raw iframe（不请求 /preview）；预览条增「浏览器打开」链接；XMind 分支不动。
- ui/prototype/src/styles.css：.file-preview-frame。

### 遇到的问题

- （无重大；raw 与 preview 共用一条 resolve 口径，扩展名判定基于 norm 小写后缀，绝对路径同样受限沙箱根内。）

## 结果

- npm run build 绿；files.test 5/5（新增 E354 html 整读/htm 放行/非 html 拒绝/目录与缺失/超限拒绝/穿越 400）、app.test 36/36（新增 /api/files/raw 200 + content-type text/html + nosniff + 内容一致、txt 415、穿越 400、缺失 404）；UI build（tsc+vite）绿；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0）。
- 手动验收待 owner：双击产物 HTML → 面板 iframe 渲染可交互图；「浏览器打开」外部新标签。
