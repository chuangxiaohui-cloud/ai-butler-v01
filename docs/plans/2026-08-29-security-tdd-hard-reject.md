# 推进计划：M7 安全 TDD §10.4 命令白名单硬编码拒绝补齐

> 日期：2026-08-29 · 分支：v0.2b · 状态：已完成

## 目标

按架构审阅 M7 补齐 §10.4 命令白名单的硬编码拒绝覆盖：`del /S /Q` 规则已在 `HARD_REJECTS` 但测试无显式断言；`powershell -enc` 与 `node -e` 目前在 `command-whitelist.ts` 仅因不在白名单被动拒绝，未形成显式硬拒绝与测试证据。

## 计划

1. `src/security/command-whitelist.ts`：`HARD_REJECTS` 增加 PowerShell `-enc/-EncodedCommand` 与 `node -e/--eval` 两条显式规则 → 验证：build
2. `src/security/command-whitelist.test.ts`：危险模式硬编码拒绝用例补 `del /S /Q`、`powershell -enc`、`node -e` 断言（含 reason）→ 验证：`node --test dist/security/command-whitelist.test.js`
3. `src/security/sandbox.test.ts`：补 §10.4 读 `~/.ssh/id_rsa` 独立断言 → 验证：`node --test dist/security/sandbox.test.js`
4. `docs/design/security-model.md`：硬编码拒绝状态与 §10.4 覆盖清单同步 → 验证：手工核对
5. `docs/2026-08-29-progress-handoff.md`：追加 M7 小节与计划链接 → 验证：手工核对

**验收标准**

- `npm run build` 绿
- `node --test dist/security/command-whitelist.test.js` 全绿
- `npm run doc-lint` 0 FAIL 0 WARN
- gateway 的 `node -e` 解释器通道语义不变（本次不触碰 `terminal.ts` / `app.ts`）

## 执行过程

### 改动

- `src/security/command-whitelist.ts`：`HARD_REJECTS` 新增 `powershell -enc` / `node -e` 规则。
- `src/security/command-whitelist.test.ts`：危险模式硬编码拒绝补 `del /S /Q`、`powershell -enc AAAA`、`node -e process.exit(0)` 断言。
- `src/security/sandbox.test.ts`：新增「越界读取（~/.ssh/id_rsa）拒绝」独立断言。
- `docs/design/security-model.md`：硬编码拒绝状态 `📋 待建` → `✅`，待补清单同步。
- `docs/2026-08-29-progress-handoff.md`：追加 M7 小节。

### 遇到的问题

- 无。

## 结果

- 验证：`npm run build` 绿；`node --test dist/security/command-whitelist.test.js` 5/5 绿；`node --test dist/security/sandbox.test.js` 8/8 绿；`npm run doc-lint` 0 FAIL 0 WARN（C8 64 key）。
- 测试：单测 command-whitelist 5/5 + sandbox 8/8；集成未跑（本轮不涉及跨模块行为）。
- 提交：未提交（用户约束：不主动 git commit）
- 遗留事项：无（§10.4 命令白名单与读侧越界用例已全量覆盖）。
