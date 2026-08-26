# 推进计划：市场 Skill 安全输入通道（E251）

> 日期：2026-08-26 · 分支：v0.2b · 状态：完成
> 背景：E250 落地本地安装通道后，首批 4 个精选包均为参数无关命令（doc-lint/build-check/skill-inventory/git-status）；
> 大量真实高频场景（datasheet 查证、BOM 对比、文档处理）需要把「用户的问句/参数」固化进 Skill 才有意义。

## 计划

- 目标：让带参高频场景可固化为市场 Skill，同时不破坏 E243/E250 的安全边界。
- 方案（输入文件通道）：manifest 声明 `input:'query'` → `MarketSkillRunner.run(name, { input })`
  把用户查询（有界 4KB，`INPUT_MAX_CHARS`）写入沙箱 `sandbox/market-skills/<name>/input.txt` →
  步骤/verify 中的字面量 `@input` 替换为该文件绝对路径。用户文本永不进入命令行：
  无注入面，保持「§10.2 白名单先行 + shell:false」语义（Windows 绝对路径可安全经 `isCmdSafeCommandLine` 的 cmd 回退执行）。
- 接线：pipeline 直连执行改为 `run(skillHit.skillName, { input: prepared.cleanQuery })`；
  CLI `skill:market:run -- <name> --query "<文本>"`；首个带参精选包 route-query
  （`npm run route:query:file -- @input`，`scripts/route-query-file.ts` 读文件 → `routeV2()` JSON）。

## 执行

### 改动
- `src/skills/market/types.ts`：`MarketSkillManifest.input?: 'query'`（E251 注释）。
- `src/skills/market/manifest.ts`：`input` 校验（undefined 或 `'query'`，否则抛「非法 input 声明」）+ 返回值归一化。
- `src/skills/market/runner.ts`：`run(name, opts: { input?: string } = {})`；声明 `input:'query'` 且传值时
  写 `input.txt`（超 4KB 截断）；steps/verify 循环把 `@input` 替换为路径；未声明/未传值不写文件、步骤原样。
- `src/search/pipeline.ts`：deps 签名补 `opts?: { input?: string }`；直连执行传 `{ input: prepared.cleanQuery }`。
- `scripts/market-run.ts`：解析 `--query "<文本>"` 传入 `{ input }`。
- `scripts/route-query-file.ts` + `npm run route:query:file`：读 argv[2] 文件 → `routeV2()` → stdout JSON。
- `configs/market-skills/route-query/manifest.json`：`input:'query'` + `npm run route:query:file -- @input` + verify。
- `.gitignore`：追加 `sandbox/`（市场 Skill 运行时沙箱与 input.txt 不提交）。
- 集成：INT-MARKET-005（安装 input 技能 → 真实 `git hash-object @input` 执行成功，输出不含用户文本）。

### 遇到的问题
- Windows 集成测试陷阱：本机 `C:\Users\zhxh\AppData` 为异常 junction，git 在无 `.git` 的
  `os.tmpdir()` 目录下做仓库发现向上遍历时报 `fatal: cannot change to 'C:/Users/zhxh'`（`git init` 后正常，
  INT-MARKET-001 正是靠先 `git init` 规避）。INT-MARKET-005 同样先 `git init` 再 `git hash-object @input`；
  生产路径（仓库根下 `sandbox/`，向上可达 `M:\202608111\.git`）无此问题，已用 route-query 真实冒烟验证。
- PowerShell 写文件陷阱：`apply_patch` 不可用，用 `_tmp_*.cjs` 脚本做文本替换（用完删除）；手写
  `.Replace` 时误把 `\n` 字面量写进 package.json，导致 JSON 损坏，已用 Node 重写修复。

## 结果

- 单测：runner 新增 4 条（输入写入/未传不写/未声明不写/4KB 截断）+ manifest 2 条 + pipeline 1 条；
  全量单测 896/897（1 skip）。
- 集成：INT-MARKET-005 1 条；全量集成 31/31。
- 真实冒烟：`skill:market:install -- --source configs/market-skills/route-query --yes` 安装成功；
  `skill:market:run -- route-query --query "帮我查一下 STM32F103C8T6 的主频"` → routeV2 JSON 正确、
  查询来自 `input.txt`、步骤输出不含用户文本；verify `git status --short` 通过。
- 文档：附录 A 登记 E251；累积路径 Phase 1 补「带参 Skill 可用」；code-directory/directory-structure/AGENTS 同步；`maturity:check` 用户累积 Skill 4→5。
- 提交：E251 代码批 = `3383c5c`、E251 文档批 = `0bfa36b`、交接批 = 本次提交回填。