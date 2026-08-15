# 推进计划：三站登录态重测

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

在 QQ 浏览器已登录立创/芯查查/半导小芯的前提下，用 CDP 会话重测三站登录态；`browser:fetch` 增加可选等待参数，让 JS 渲染后再取页面，避免 SPA 登录页误判。

## 计划

1. `scripts/browser-session.ts` 的 `fetch` 支持第三个参数 `waitMs`。
2. 确认/搜索芯查查、半导小芯会员中心 URL。
3. 带等待重测三站，输出登录态判断（不展示个人数据）。
4. 更新文档、登记 v2.5 附录 A（E91），提交推送。

**验收标准**

- `browser:fetch -- URL 5000` 能等 5 秒再取页面。
- 三站给出可判读的登录态结论。

## 执行过程

### 改动

- `scripts/browser-session.ts`：`browser:fetch` 支持第三个参数 `waitMs`，JS 渲染后再取页面，用法 `npm run browser:fetch -- "URL" 5000`。
- `scripts/browser-launch.ts`：`isRunning` 先去掉 `.exe` 再传给 `Get-Process -Name`；实测 `Get-Process -Name 'QQBrowser.exe'` 返回 0 条而 `'QQBrowser'` 返回 46 条，修复后能正确拦截普通模式实例、保证调试端口真正拉起。

### 遇到的问题

- 首次 `browser:launch -- qq` 提示已启动但 9222 未监听：QQ 正在普通模式运行，启动脚本进程检测因 `.exe` 后缀失配放行，新进程并入已有实例而未带调试端口。
- 芯查查没有公开的 `/user/*`、`/member`、`/account` 会员路由，首页也不显示“登录/退出”文字；改用首页本地存储与接口探测确认登录态。

## 结果

- **立创（E91 登录态确认）**：`member.szlcsc.com` 带等待抓取后落在 `member/center.html`，标题“账户信息-立创商城”，页面含“客编 260923S”、绑定手机（脱敏）、绑定邮箱（脱敏）等已登录标识。
- **芯查查**：首页无“登录/退出”字样；本地存储含 `PCuserInfo`（头像/用户 ID）与 `PCtoken`、`SaasFrontToken` 两个 JWT，可判定已登录；网站未提供可直判的会员中心 URL，后续可用“存在用户凭据”作为登录态判据。
- **半导小芯**：首页含“180****2273、我的消息、我的收藏、最近浏览、我的BOM、我的样品、退出登录”，明确已登录。
- `browser:fetch` 带 5 秒等待后，立创从会员中心正确识别登录态，半导小芯也能渲染出导航区登录信息。
- 回归：`npm run build` 通过；`npm run test:all` 255/255 + 17/17 全绿；`npm exec tsx scripts/doc-lint.ts` 0 FAIL / 0 WARN。
