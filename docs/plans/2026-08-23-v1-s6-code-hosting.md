# 推进计划：v1.0 S6 代码托管联动（GitHub/Gitee）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

v1.0 切片第六片（S6）：落地 §11.4 代码托管与远程协作的库级骨架——本地变更清单 → 仓库白名单授权校验 → 测试/build/安全审计预检 → commit → push → 返回仓库 URL；每次 push 写 JSONL 审计日志（§11.3）；失败保留本地变更与日志、远程冲突提示 rebase/merge；Token 只从环境变量读取（不落盘、不写入 .git/config），参数校验拒绝明文 key。复用 §10.2 命令白名单（git 破坏性子命令拒绝），与 `scripts/push-to-hosts.ts`（E18/E19/E93 发布脚本）互补——脚本是运维通道，本模块是可注入依赖的库骨架，供 pipeline/Skill 按授权流程调用。

## 计划

1. **新模块 `src/repo/`**：
   - `types.ts`：`RepoHost`（github.com/gitee.com）、`RepoIdentity`（host/owner/name）、`PushPlan`（变更清单/分支/目标裸 URL/授权状态/缺 token 主机）、`PushResult`（ok/commit/url/error/conflict/hint）
   - `repo-whitelist.ts`：`RepoWhitelist` 仓库白名单（默认空，显式 `authorize` 后放行；JSONL 落盘 `data/repo-whitelist.jsonl`，复用 `src/log/jsonl.ts` 追加与缓存读；`revoke` 原子重写；损坏行忽略）
   - `push-audit.ts`：`logPushEvent` JSONL 事件日志（`data/repo-push-events.jsonl`：ts/host/owner/repo/branch/commit/url/ok/conflict/error，§11.3 复用）
   - `push-service.ts`：`PushService.push(repo)`——未授权拒绝 → token 缺失拒绝 → 预检（默认 npm test + build，可注入）→ add/commit → push（URL 内联带 token 直推，不写 `.git/config`）→ 冲突识别（non-fast-forward/rejected → conflict + rebase/merge 提示）→ 审计落盘；git 命令逐条过 §10.2 命令白名单；参数校验拒绝明文 token
2. **登记**：需求文档 E225；`docs/code-directory.md`、`docs/directory-structure.md`、AGENTS.md 目录地图、handoff。
3. **验收**：doc-lint 0 FAIL 0 WARN + build + 全量单测/集成全绿。

**验收标准**

- 未授权仓库拒绝推送并提示先授权；authorize 后放行；revoke 收回。
- push 前预检失败中止，不执行任何 git 写操作（本地变更保留）。
- 远程冲突返回 conflict=true 与 rebase/merge 提示，不强制推送、不吞错。
- Token 不落盘：push URL 仅进程内存携带，审计日志不含 token；明文 token 参数被拒绝。
- 每次 push（成功/失败）写 JSONL 审计事件；git 命令过命令白名单。
- doc-lint 0 FAIL 0 WARN；单测 + 集成全绿。

## 执行过程

### 改动

- `src/repo/types.ts` / `repo-whitelist.ts` / `push-audit.ts` / `push-service.ts`（新增）
- 测试：`src/repo/repo-whitelist.test.ts` / `push-audit.test.ts` / `push-service.test.ts`
- 文档：本计划 + 需求文档 E225 + `docs/code-directory.md` + `docs/directory-structure.md` + AGENTS.md 目录地图 + handoff

### 遇到的问题

- Windows 下 JSONL revoke 原子重写需先关文件句柄：rename 覆盖仍被打开的文件会 EPERM，`RepoWhitelist.revoke` 先 `closeJsonl` 再 rename（与 jsonl.ts 轮转同款处理）。
- 为确保「未授权仓库不执行任何 git 命令」，`push()` 先做白名单校验再读仓库状态（`plan()` 仍对外提供只读变更清单）。
- push 不写 `.git/config`：URL 内联直推避免 token 落盘（区别于 push-to-hosts 的 remote add 写法）。

## 结果

- 验证：`npm exec tsx scripts/doc-lint.ts` 0 FAIL 0 WARN（C8 44 key、附录 521/950）；主项目 `npm run build` 通过；`npm run test:all` 全绿。
- 测试：单测 756/757（1 skip）+ 集成 15/15；新增 15 条（repo-whitelist 4 + push-audit 2 + push-service 9）。
- 提交：`fcac8de`（E225）+ `27ed752`（handoff 登记）
- 遗留事项：S6 库级骨架完成（白名单/预检/commit+push/审计，与 push:hosts 运维通道互补）；真实远程推送由 push:hosts 承载；剩余 S7 Skill 市场远程化、S8 LLM 增强路由 + fast description + MemoryCoreStore 切换按 `docs/plans/2026-08-23-v1-slicing.md` 排期继续。
