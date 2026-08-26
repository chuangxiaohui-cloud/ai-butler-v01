# 推进计划：成熟度 Phase 1 启动——市场 Skill 累积通道（E249 + E250）

> 日期：2026-08-26 · 分支：v0.2b · 状态：已完成
> 背景：累积路径清单 M1 第二项——Phase 0 观测基建已收口（E247/E248），本轮让「累积」本身可执行。
> 发现：`install:skill` 实际是预置注册（src/skills），与「用户累积 Skill = 市场安装」口径错配；
> Windows 下 runner 以 shell:false spawn `npm`（.cmd shim）会 ENOENT——两个阻塞项。

## 目标

打通市场 Skill 的「本地沉淀 → 安装 → 触发直连 → 复用率计入」全链，落地 E249（复用率口径校准）与
E250（本地安装通道 + Windows .cmd shim 安全执行 + 生产接线 + 首批精选 Skill），用户累积 Skill 0→4。

## 计划

1. **E249 复用率口径校准**：新增 `countReuseEvents` 纯函数（只计 direct/market_trigger 派发与
   answer，injected 上下文注入不计入）；maturity-check 改用；缺口文案移除「待 E243 收口后校准」。
2. **E250 本地安装通道**：`MarketInstaller.installFromLocalDir(packageDir, confirm?)`（本地包用户即
   策展方，高风险权限仍逐项确认；sourceUrl 记 file:///）；`npm run skill:market:install -- --source <dir> [--yes]`。
3. **E250 Windows .cmd shim 安全执行**：`defaultStepSpawn` 在 win32 + ENOENT 且命令串通过安全守卫
   （`isCmdSafeCommandLine`：仅字母数字与路径/参数分隔符，无 cmd 元字符）时经 `cmd.exe /d /s /c` 执行，
   保持 shell:false 语义（元字符一律拒绝，白名单仍先行拦截）。
4. **E250 生产接线**：CLI（main.ts）与 gateway（server.ts）pipeline 注入 `marketSkillRunner`，
   E248 触发词直连在真实使用中生效。
5. **首批精选 Skill**：`configs/market-skills/{doc-lint,build-check,skill-inventory,git-status}`，
   真实能力包装、参数无关、steps 过 §10.2 白名单；安装并 `skill:market:run` 逐个验证。
6. **文档与验证**：附录 A 登记 E249/E250；累积路径 Phase 1.2 改为市场安装通道；doc-lint + 全量测试。

**验收标准**

- `npm run maturity:check` 用户累积 Skill 0→4；复用率文案为校准口径。
- 4 个精选 Skill `skill:market:run` 全 ok（含 npm 步骤在 Windows 真实执行）。
- INT-MARKET-004（本地安装 → 真实 npm 步骤）通过；doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/maturity/metrics.ts`：`countReuseEvents` + 口径注记与缺口文案更新；`metrics.test.ts` 新增 2 条。
- `scripts/maturity-check.ts`：改用 `countReuseEvents` 统计轨迹事件。
- `src/skills/market/installer.ts`：`installFromLocalDir` + 私有 `confirmAndPersist` 共享落盘；`installer.test.ts` 新增 3 条。
- `src/skills/market/runner.ts`：`isCmdSafeCommandLine` + win32 ENOENT 时经 cmd.exe 重试；`runner.test.ts` 新增 1 条（含 10 个守卫断言）。
- `scripts/market-install.ts`（新）+ package.json `skill:market:install` / `doc-lint` 脚本。
- `src/main.ts`、`src/gateway/server.ts`：注入 `marketSkillRunner`（E248 生产接线）。
- `configs/market-skills/*/manifest.json`（新 4 个）：doc-lint / build-check / skill-inventory / git-status。
- `tests/integration/market-skill-runner.test.ts`：INT-MARKET-004。
- 文档：附录 A 登记 E249/E250；累积路径 Phase 1.2 修正；计划文档本文件。

### 遇到的问题

- `spawnSync('npm', shell:false)` 在 Windows ENOENT（npm 是 .cmd shim）——经安全守卫走 cmd.exe 解决；
  守卫排除全部 cmd 元字符（&|<>^()%!*? 等），`del`/`cmd` 等非白名单命令由 §10.2 先行拒绝，双层兜底。
- 锚点 CRLF 失配导致 patch 脚本报错——统一先归一化换行再替换。
- `isCmdSafeCommandLine('cmd /c dir')` 无元字符放行（白名单另行拦截）——测试断言按守卫语义修正。

## 结果

- `maturity:check`：用户累积 Skill **0→4**/50+；复用率口径 = direct+market_trigger 派发/回答事件（injected 不计入）。
- 4 个精选 Skill 已安装并 `skill:market:run` 逐个验证 ok:true（doc-lint 0 FAIL 0 WARN、build-check tsc 通过、
  skill-inventory 列出 4 个、git-status 返回工作区状态）。
- 验证：`npm run build` 通过；单测 889/890（1 skip）+ 集成 30/30；INT-MARKET-004 真实 npm 步骤通过；doc-lint 0 FAIL 0 WARN。
- 提交：E249 = `78c83c2`、E250 = `0df0307`、文档批 = `ed16181`、bench housekeeping = `1103373` · 推送：待执行（Gitee / GitHub）
- 遗留事项：Phase 1 真实使用累积继续（每日问答 + route:feedback、每周沉淀 3-5 个新 Skill）；
  Windows .cmd shim 守卫暂不支持含空格/引号参数的步骤（后续需要时扩展并补测试）。