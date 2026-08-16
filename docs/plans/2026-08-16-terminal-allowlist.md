# 推进计划：终端命令白名单细化（E117）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

在 Shell 权限之外增加命令前缀白名单：安全中心可配置允许执行的命令前缀，
gateway 执行前校验，未授权前缀返回 403，降低终端误执行风险。

## 计划

1. `SecurityConfig` 增加 `allowedCommandPrefixes: string[]`（默认空 = 允许任意）。
2. gateway `/api/security/persist` 支持写入前缀；`/api/terminal/exec` 执行前校验。
3. UI 安全中心增加命令前缀输入框，失焦持久化。
4. 补测试、登记需求文档附录 A（E117），更新交接，提交推送。

**验收标准**

- 白名单非空且命令前缀不匹配 → 403。
- 白名单为空时维持“Shell 开启即可执行”的旧行为。
- UI 输入前缀后持久化并显示。

## 执行过程

### 改动

- `src/config/security-config.ts`：新增 `allowedCommandPrefixes`。
- `src/gateway/app.ts`：persist 写入 + exec 白名单校验。
- `ui/prototype/src/App.tsx` + `styles.css`：命令前缀输入。
- 测试：security-config 读写、gateway 白名单 403。

## 结果

- 验证：主项目与 UI `npm run build` 通过；`npm run test:all` 单测 335/335 +
  集成 17/17 全绿；doc-lint 0 FAIL / 0 WARN。
- 提交：E117 已提交并推送 Gitee/GitHub。
- 遗留：SSE/流式 artifact 事件、HTML 预览自动弹出、桌面端封装。
