# 推进计划：安全中心真实配置 + 终端执行通道（E115）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

让安全中心配置真实持久化，并打通终端真实执行通道：Shell 权限默认关闭，在安全中心
开启并二次确认后，终端命令真正执行并返回 stdout/stderr/exitCode。

## 计划

1. 新增 `src/config/security-config.ts`：安全策略持久化（Shell/文件/外部 API/三分支）。
2. 新增 `src/gateway/terminal.ts`：`runCommand` 执行通道（15s 超时）。
3. gateway 新增 `GET /api/security`、`POST /api/security/persist`、
   `POST /api/terminal/exec`（权限关闭返回 403）。
4. UI 安全中心改为真实开关；终端命令走 gateway 执行并回显输出。
5. 补测试、登记需求文档（§13 / 附录 A E115），更新交接，提交推送。

**验收标准**

- 安全配置读写持久化，Shell 默认关闭。
- 权限关闭时终端执行返回 403；开启后可执行并返回 stdout/exitCode。
- UI 开启 Shell 需二次确认，终端输入框随之解锁。

## 执行过程

### 改动

- 新增 `src/config/security-config.ts` / `src/gateway/terminal.ts` 及单测。
- `src/gateway/app.ts`：security 与 terminal 三接口，`securityConfigPath` 可注入。
- `ui/prototype/src/App.tsx`：安全中心真实开关 + 终端命令执行回显。
- `src/gateway/app.test.ts`：security 读取 + Shell 关闭 403 测试。

### 遇到的问题

- `promisify(exec)` 的 shell 参数类型不兼容 boolean，去掉显式 `shell: true`
  （exec 默认走系统 shell）。

## 结果

- 验证：主项目与 UI `npm run build` 通过；`npm run test:all` 单测 332/332 +
  集成 17/17 全绿；doc-lint 0 FAIL / 0 WARN。
- 提交：E115 已提交并推送 Gitee/GitHub。
- 遗留：命令白名单/审批流细化、artifact 事件流与右侧文件列表联动。
