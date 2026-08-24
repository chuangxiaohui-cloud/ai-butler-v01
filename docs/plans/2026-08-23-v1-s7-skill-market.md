# 推进计划：v1.0 S7 Skill 市场远程化

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

v1.0 切片第七片（S7）：落地 §8.2.3 Skill 市场安装的远程化骨架——官方市场索引拉取（来源：官方 Skill 市场索引 / GitHub/Gitee 仓库包 URL）、远程包下载与扩展 manifest 校验（版本/触发词/执行步骤/验证规则/依赖/权限声明）、权限声明门禁（高风险权限逐项征求用户确认，默认拒绝，§10 联动）、安装记录 JSONL（可追溯、卸载标记保留记录不静默删除、复用 §8.2.2 冷存与复审语义）、市场安装 Skill 登记进生命周期统计（§8.2.3 成熟度）。真实 handler 可执行能力接入需过 §10 文件沙箱与命令白名单，骨架阶段只落盘 manifest 与记录，执行链留待后续（诚实登记）。

## 计划

1. **新模块 `src/skills/market/`**：
   - `types.ts`：`SkillPermission`（none/filesystem/command/network/browser）、`HIGH_RISK_PERMISSIONS`、`MarketSkillEntry`（市场索引条目）、`MarketSkillManifest`（扩展 manifest）、`MarketInstallRecord`（ts/name/version/sourceUrl/checksum/permissions/status）
   - `manifest.ts`：`validateMarketManifest`——复用 install.ts 基础校验，强制显式声明 permissions（可为空数组），steps/verify/deps 可选但必须是非空字符串数组
   - `index-client.ts`：`fetchMarketIndex`（injectable fetch，http/https 校验，256KB 大小上限）+ `parseMarketIndex`（JSON 数组 / `{skills:[...]}` / JSONL 三种格式，损坏条目跳过）
   - `store.ts`：`MarketStore` JSONL 记录（`data/skill-market-installs.jsonl`，复用 src/log/jsonl.ts；list/latest/statusOf/installed/markDisabled）
   - `installer.ts`：`MarketInstaller.install(entry)`——拉取包 → manifest 校验 → 包与条目 name/version 一致性 → 高风险权限逐项 `confirm`（默认拒绝）→ SHA-256 checksum → 原子落盘 `data/market-skills/<name>/manifest.json` → 记录 JSONL；`uninstall(name)` 标记 disabled 保留记录与文件
2. **生命周期接入**：`SkillLifecycle.ensureMarketSkillsRegistered(installed)`——市场安装 Skill 进入 skill_stats 统计（§8.2.3 成熟度），幂等。
3. **登记**：需求文档 E226；`docs/code-directory.md`、`docs/directory-structure.md`、handoff。
4. **验收**：doc-lint 0 FAIL 0 WARN + build + 全量单测/集成全绿。

**验收标准**

- 索引解析：JSON 数组 / `{skills}` / JSONL 均可解析，非法条目跳过，空索引报错。
- manifest 校验：缺 permissions 或非法权限值拒绝；steps/verify/deps 非字符串数组拒绝。
- 权限门禁：高风险权限默认拒绝并列出；confirm 放行后安装成功；无高风险权限直接安装。
- 安装产物：manifest 落盘 + 记录 JSONL（含 checksum/来源/权限/状态）；name/version 与市场条目不一致拒绝。
- 卸载：标记 disabled、保留记录与文件（不静默删除）；未安装返回错误。
- 生命周期：市场 Skill 进入 skill_stats 统计且幂等。
- doc-lint 0 FAIL 0 WARN；单测 + 集成全绿。

## 执行过程

### 改动

- `src/skills/market/types.ts` / `manifest.ts` / `index-client.ts` / `store.ts` / `installer.ts`（新增）
- `src/skills/lifecycle.ts`：`ensureMarketSkillsRegistered` + 提取 `insertStat` 私有方法
- 测试：`src/skills/market/*.test.ts` + `lifecycle.test.ts` 增量
- 文档：本计划 + 需求文档 E226 + 目录文档 + handoff

### 遇到的问题

- 权限模型定为「索引策展方声明为准」：包声明的权限不得超出市场条目声明（否则拒绝），门禁确认对象即条目权限，避免包自提权限绕过审核。
- 真实 handler 可执行能力接入（落盘并执行源码）涉及 §10 文件沙箱与命令白名单全流程，骨架阶段只落盘 manifest 与安装记录，执行链留待后续接入（诚实登记）。

## 结果

- 验证：`npm exec tsx scripts/doc-lint.ts` 0 FAIL 0 WARN（C8 44 key、附录 522/950）；主项目 `npm run build` 通过；`npm run test:all` 全绿。
- 测试：单测 777/778（1 skip）+ 集成 15/15；新增 21 条（manifest 4 + index-client 4 + store 4 + installer 7 + lifecycle 2）。
- 提交：`3f10293`（E226）+ `ccaadeb`（handoff 登记）
- 遗留事项：S7 骨架完成（索引/校验/权限门禁/安装记录/生命周期统计）；真实可执行 handler 接入需过 §10 文件沙箱与命令白名单流程；剩余 S8 LLM 增强路由 + fast description + MemoryCoreStore 切换按 `docs/plans/2026-08-23-v1-slicing.md` 排期继续。
