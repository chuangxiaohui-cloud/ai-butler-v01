# 推进计划：架构审计安全批（H1+H2 / H3 / H4 / H10）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

处置第三方架构审计 `docs/2026-08-23-architecture-code-audit.md` 第六节「立即（安全）」批次：
project-packager 命令注入 + 沙箱绕过（H1+H2）、gateway 鉴权覆盖/白名单语义反转/硬拒绝表缺失（H3）、
SMTP 明文发送 AUTH 凭据（H4）、yt-dlp 参数注入（H10）。与已收口 SEV-1.1~1.4 批同主题，
修复模式沿用「安全 TDD：先补测试再改代码」。

## 计划

1. H1+H2 `src/skills/project-packager/index.ts`：弃用 PowerShell `Compress-Archive -Command`
   字符串拼装，改用 jszip（已在 node_modules，exceljs 传递依赖，升为直接依赖并在 package.json
   登记）；执行前过 `isPathAllowed` 沙箱白名单（§10.1），越界拒绝 + 审计日志；排除集扩到
   `.env`/`data/`，防凭据聚合打包。skill 支持注入 `cwd`（对齐 project-writer 测试模式）。
2. H3 `src/gateway/app.ts`：所有非 GET 端点统一挂 `requireGatewayAuth`（含 /api/ask、
   security/persist、usage/budget、skills/sync、providers/*、memory/forget、calendar/import、
   routing/batch-mark|export）；终端白名单改 default-deny（空 = 全拒，§10.2 语义）；
   `src/gateway/terminal.ts` 补硬编码拒绝表（`rm -rf <根>`、`del /S /Q`、`sudo`、`eval`、
   `powershell -enc/-EncodedCommand`、`format`），`classifyCommand` 供 app 层复用；
   `.env.example` 登记 `GATEWAY_AUTH_TOKEN`。
3. H4 `src/mail/smtp.ts`：AUTH LOGIN 仅在加密通道（secure 直连或 STARTTLS 升级后）发送；
   服务器要求 AUTH 但连接为明文时拒绝发送凭据并给出可操作错误。
4. H10 `src/skills/video-learner/index.ts`：yt-dlp 调用前加 `--` 选项终止符 + `^https?://`
   校验（downloadSubtitles/downloadMedia 两处）。
5. 验证：`npm run build` → 相关单测 → `npm run test:all` → `npm exec tsx scripts/doc-lint.ts`。
6. 文档：本计划补结果；`docs/2026-08-23-progress-handoff.md` 登记；审计文档登记
   documentation-map（归档位置随本批确定）。

**验收标准**

- project-packager 不再 spawn PowerShell；`打包 projects/xxx` 正常出 zip；打包 `C:\Windows`
   /仓库根（含 .env/data）被拒并写审计日志；含 `'`/`;` 的合法目录名可正常打包。
- 终端白名单为空时任何命令 403；`rm -rf /`、`del /S /Q`、`sudo`、`powershell -enc` 硬拒；
  dev 模式（无 token）下既有 gateway 接口全部可用。
- 明文 SMTP 服务器通告 AUTH 时 sendMail 拒绝发送并报错；TLS/STARTTLS 通道 AUTH 正常。
- video-learner 传给 yt-dlp 的 url 前有 `--` 终止符。
- 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/skills/project-packager/index.ts`（H1+H2）：弃用 PowerShell `Compress-Archive -Command`
  字符串拼装，改用 jszip（纯 JS，node_modules 已随 exceljs 存在，升为直接依赖）；
  执行前过 `isPathAllowed`（§10.1 沙箱白名单），越界拒绝 + `logSandboxAudit`；
  排除集扩到 `.env*` 与 `data/`；`createProjectPackagerSkill` 支持注入 `cwd`/`zipDir`。
- `src/gateway/app.ts`（H3）：所有非 GET 端点统一挂 `requireGatewayAuth`
  （providers/default|test、skills/sync、memory/forget、security/persist、calendar/import、
  usage/budget、routing/batch-mark|export、ask）；终端白名单改 default-deny（空 = 全拒）；
  terminal handler 接 `classifyCommand` 硬拒绝 + 解释器通道显式放行。
- `src/gateway/terminal.ts`（H3）：新增 `classifyCommand`——§10.2 硬拒绝表
  （`rm -rf <根>`、`del/rd /S`、`sudo`、`eval`、`format <盘符>`、PowerShell `-enc/-EncodedCommand`）
  与解释器通道标记（node -e / python -c / powershell -command / sh -c）。
- `src/mail/smtp.ts`（H4）：AUTH LOGIN 仅在加密通道发送（secure 直连或 STARTTLS 升级后）；
  服务器要求 AUTH 但连接为明文时拒绝发送凭据并给出可操作错误。
- `src/skills/video-learner/index.ts`（H10）：yt-dlp 调用前加 `--` 选项终止符 +
  `isSafeYtDlpUrl`（`^https?://` 且不以 `-` 开头）。
- `.env.example`：登记 `GATEWAY_AUTH_TOKEN`。
- `package.json`/`package-lock.json`：jszip `^3.10.1` 升为直接依赖。
- 测试：project-packager（沙箱拒绝/排除聚合面/`'`+`;` 目录名回归）、terminal
  （硬拒绝表/解释器通道/不 spawn 危险命令）、app（token 401/白名单 default-deny/硬拒绝/
  解释器通道显式放行）、smtp（明文免认证流程/明文 AUTH 拒绝/TLS 认证失败）、video-learner
  （URL 安全校验）；适配既有 pipeline 打包测试（沙箱内目录）与 office-daily 假 SMTP
  （改免认证服务器，AUTH 通道由 smtp.test.ts TLS 用例覆盖）。

### 遇到的问题

- `requireGatewayAuth` 内 `require('node:crypto')` 在 ESM 下未定义——此前 dev 模式
  （无 token）提前 return 从未触发；改顶部 import `timingSafeEqual`。
- 明文免认证假 SMTP 的 EHLO 响应以 `250-` 续行结尾会令客户端等终止行超时；
  补 `250 OK` 终止行。
- 审计 H3 建议与旧计划 `2026-08-16-terminal-allowlist.md`（默认空=放行）相反：
  以 §10.2"仅允许白名单内命令"的 default-deny 为权威，旧行为登记为偏差并修正。

## 结果

- 验证：`npm run build` 通过；`npm exec tsx scripts/doc-lint.ts` 0 FAIL 0 WARN
  （正文 1185/1800，附录 939/950）；`npm run test:all` 单测 612/613（1 skip）+ 集成 17/17。
- 测试：单测 612 pass + 集成 17 pass，0 fail。
- 提交：60b419d（安全/数据/正确性批，H1-H4/H10，无 E-NN）
- 遗留事项：
  - 审计「立即（数据）」H5（SessionContextStore 单实例 + 原子写）未在本批处置，建议下批。
  - 审计「短期」H9/B1/B4/H8 与 H6/D1-D5 决策项按优先级排队。
  - GATEWAY_AUTH_TOKEN 一旦在生产设置，UI/桌面壳需带 `Authorization: Bearer` 头，
    `.env.example` 已注明。
