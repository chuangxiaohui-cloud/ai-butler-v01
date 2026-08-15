# 推进计划：QQ浏览器 CDP 登录态验证

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

验证 QQ浏览器以调试端口启动后，Agent 能通过 CDP 复用其已登录会话：`browser:launch -- qq` → `browser:cdp -- 9222` → 新进程自动连接并带会话抓取页面。

## 计划

1. 确认 QQ浏览器已完全关闭（用户已配合）。
2. `npm run browser:launch -- qq` 启动调试端口。
3. `npm run browser:cdp -- 9222` 连接并持久化端口。
4. `npm run browser:status` 查看保存端口与会话域；`browser:fetch` 验证登录态自动兜底。
5. 更新进度与计划文档；如有代码改动再登记 v2.5 并提交推送。

**验收标准**

- CDP 连接成功且 `data/browser-session-cdp.json` 保存端口。
- 新进程 `browser:fetch` 自动连接已保存端口并复用 QQ 登录会话。
- 文档记录真实会话域与抓取结果。

## 执行过程

### 改动

- `scripts/browser-launch.ts`：自动选择最新版 QQ浏览器（不再硬编码 `21.7.6019.400`）；进程检测改用 PowerShell `Get-Process`（避免受限环境 `tasklist` 拒绝访问误判未运行）；`spawn` 加 `detached + unref`，让浏览器在命令退出后继续监听调试端口。

### 遇到的问题

- 本机 QQ 新旧两个版本目录并存，硬编码旧版导致启动路径不可靠。
- 受限环境下 `tasklist` 返回 Access denied，启动脚本误以为 QQ 未运行而重复拉起，调试端口起不来。
- 普通 `spawn` 启动的浏览器会随命令结束被回收，端口消失；`Start-Process` 能存活。改用 `detached + unref` 修复。

## 结果

- 验证：`npm run browser:launch -- qq` 后 9222 LISTENING；`browser:cdp -- 9222` 持久化端口；新进程 `browser:fetch` 自动复用 QQ 会话，sessionDomains 含 szlcsc/xcc/taobao/jd/github 等大量登录域。
- 测试：单测 255/255 + 集成 17/17 全绿；doc-lint 0 FAIL/0 WARN。
- 提交：`f0ed456` · 推送：Gitee / GitHub
- 遗留事项：QQ 浏览器保持 9222 运行中，Agent 已自动复用；后续 QQ 升级路径变化时重跑 `browser:launch -- qq` 即可。
