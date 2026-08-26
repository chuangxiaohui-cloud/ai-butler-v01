# 推进计划：S7 可执行 handler——市场 Skill 执行链（E243）

> 日期：2026-08-26 · 分支：v0.2b · 状态：计划中

## 目标

v1.0 S7（E226）骨架已收口（索引/校验/权限门禁/安装记录/生命周期统计），但「真实 handler 可执行能力」
未接入：`MarketInstaller.install` 只落盘 manifest 与记录，`steps`/`verify` 从不执行（E226 已诚实登记
「执行链留待后续」）。本轮补齐执行链 = `MarketSkillRunner`：加载已安装市场 Skill → §10.2 命令白名单
逐条校验 → §10.1 文件沙箱 cwd（`sandbox/market-skills/<name>`）内以 shell:false 执行 steps →
成功后再跑 verify → 有界输出；并给 CLI 入口 `npm run skill:market:run`。S7 全链路（拉取 → 校验 →
权限门禁 → 落盘 → 执行）由此闭环，为 P-10「S7 可执行 handler」提供真实证据。

## 背景与差距

- 需求锚点：§8.2.3 Skill 市场远程化（安装/执行/生命周期）、§10.1 文件沙箱、§10.2 命令白名单
  （`checkCommand` + 硬编码拒绝 + [P-38]/[P-39]/[P-40] 超时）、§8.2.2 冷存不删语义。
- 现状：`src/skills/market/` 已有 `types/manifest/index-client/store/installer/lifecycle`；
  `installer.ts` 头注明确「真实 handler 可执行能力接入需过 §10 文件沙箱与命令白名单，骨架阶段不落盘
  执行源码」——本轮即补这一环。
- 安全设计：可执行内容只来自已过门禁的 manifest steps（非用户输入）；每条命令过 §10.2 白名单
  （拒绝即中止并自动写审计）；`shell:false` + 沙箱 cwd，杜绝 shell 注入与越界写；未声明 `command`
  权限的 Skill 拒绝执行任何步骤（§8.2.3 权限模型：包不得自提权限）。

## 计划

1. **新模块 `src/skills/market/runner.ts`**：`MarketSkillRunner`
   - `run(name)`：store 状态校验（installed，disabled 拒绝）→ 加载并复验 manifest
     （`validateMarketManifest`）→ `command` 权限门禁 → 建沙箱 cwd
     `sandbox/market-skills/<name>` → 逐条执行 `steps`+`verify`：
     - 每条过 `checkCommand`（拒绝即中止，reason 透出，审计自动落盘）；
     - argv 复用 `command-whitelist.tokenize`（引号/空白正确拆分），`spawnSync` shell:false，
       timeout 按 kind（[P-38]/[P-39]/[P-40]），maxBuffer 1MB；
     - stdout/stderr 有界截断（4KB/条，Skill 内部常量，同 github-reader 先例不登记 P-NN）；
   - `listInstalled()`：当前 installed 记录（供 CLI `--list`）；
   - 返回 `MarketRunOutcome { ok/name/version/results[]/error/durationMs }`，steps 任一失败即停
     （verify 失败同样记为不通过，如实归因）。
2. **CLI 入口 `scripts/market-run.ts`**：`npm run skill:market:run -- <name> | --list`
   （构造默认 runner，JSON 输出，非 0 退出码表示执行失败；对齐 `scripts/im-gate.ts` 风格）。
3. **测试**：
   - 单测 `src/skills/market/runner.test.ts`（注入 spawn/check，不落真进程）：未安装/已卸载拒绝、
     manifest 缺失、无 `command` 权限拒绝、白名单拒绝中止、步骤成功收集、非 0 退出码失败、
     超时标记、输出截断、verify 失败归因、listInstalled；
   - 集成 `tests/integration/market-skill-runner.test.ts`（真实 git 命令 + 临时目录端到端）：
     fixture 包经 `MarketInstaller.install`（真实校验/门禁/落盘）→ `runner.run` 真实执行
     steps+verify（`git --version`/`git init`，跨平台 exe 规避 .cmd 解析问题）→ 正向通过 +
     白名单拒绝负向 + 未安装负向。
4. **文档与登记**：
   - 需求文档附录 A E243（S7 执行链补实现，无 §5/§6 参数变更 → bench:na(new-param)）；
   - `src/skills/README.md` 与 `docs/code-directory.md`/`docs/directory-structure.md` 更新
     `src/skills/market/` 行 + `scripts/market-run.ts`；
   - package.json 新增 `skill:market:run`；完成后补本计划「执行过程/结果」并在当天 handoff 登记。
5. **验证**：`npm run build` + `npm run test:all` 全绿；`doc-lint` 0 FAIL 0 WARN；
   真实冒烟 `npm run skill:market:run -- <fixture>`。

**验收标准**

- 已安装（status=installed）且声明 `command` 权限的市场 Skill 可被真实执行 steps+verify，
  输出含每步 exit/stdout/stderr；任一命令被 §10.2 拒绝或退出非 0 即中止并如实归因；
- 未安装/已卸载/无 `command` 权限 → 明确拒绝，不执行任何命令；
- 命令始终 shell:false + 沙箱 cwd（`sandbox/market-skills/<name>`），无 shell 解释路径；
- 新增单测 ≥10 条 + 集成 ≥3 条；全量单测 + 集成全绿；doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/skills/market/runner.ts`（新增）：`MarketSkillRunner`——store 状态校验（installed 才可执行、
  disabled 拒绝）→ 复验 manifest（validateMarketManifest）→ command 权限门禁 → §10.1 沙箱 cwd
  （`sandbox/market-skills/<name>`）内逐条执行 steps+verify：§10.2 checkCommand 逐条校验
  （拒绝即中止并自动写审计）、argv 复用 command-whitelist.tokenize、spawnSync shell:false、
  timeout 按 kind（[P-38]/[P-39]/[P-40]）、stdout/stderr 4KB 有界截断；任一命令非 0 退出即停
  并如实归因（exit/超时/白名单原因）；listInstalled() 供 CLI。
- `scripts/market-run.ts`（新增）+ package.json `skill:market:run`：`-- <name>|--list`，JSON 输出，
  ok=false 退出码 1。
- 测试：`src/skills/market/runner.test.ts` 单测 12 条（注入 spawn/check 不落真进程）；
  `tests/integration/market-skill-runner.test.ts` 集成 3 条（真实 git 命令端到端，临时目录）。
- 文档：需求文档附录 A E243、`src/skills/README.md`、`docs/code-directory.md`、
  `docs/directory-structure.md`、本计划、当天 handoff。

### 遇到的问题

- Windows 下 `spawnSync("npm", ...)` 无法解析 `.cmd`（需 cmd.exe 或显式 npm.cmd）：集成测试与冒烟
  改用真实 exe（git），规避跨平台 .cmd 解析问题；步骤拆分复用既有 `tokenize`（引号/空白正确）。
- `listInstalled()` 初版直接返回 store.installed()（完整记录），与声明类型 `{name,version}` 不符
  （结构类型静默兼容）：修正为显式 map，避免 CLI --list 泄漏 sourceUrl/checksum。
- 多行文档替换踩 CRLF 坑：README 用行级插入，避免 PowerShell 多行 Replace 失配。

## 结果

- `npm run build`：通过（tsc 0 错误）。
- `npm run test:all`：单测 852/853（1 skip）+ 集成 25/25（含 INT-MARKET-001~003）。
- 真实冒烟：`npm run skill:market:run -- smoke-check`——安装 fixture（MarketInstaller 真实校验/门禁/落盘）
  后执行 `git --version`/`git init`/verify 全 ok，产物落 `sandbox/market-skills/smoke-check/`；冒烟后清理。
- `npm exec tsx scripts/doc-lint.ts`：0 FAIL 0 WARN。
- 提交：见 git log（提交号登记于 handoff）；推送：未推送（待 push:hosts 双端同步）。
- 遗留：市场 Skill 自然语言路由（命中已安装 Skill 触发词进 pipeline）需扩展意图 targetDomain，
  本轮不动意图枚举，留后续；verify/deps 语义可进一步细化。
