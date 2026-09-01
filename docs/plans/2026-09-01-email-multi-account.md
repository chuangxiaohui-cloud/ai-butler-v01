# 推进计划：收邮件多账号（凭据容器化 + active 切换 + 按账号收件/搜信）

> 日期：2026-09-01 · 分支：v0.2b · 状态：完成（E302）
> 关联：`docs/roadmap.md` E293-后（多账号，最后一项）/ owner 指令 2026-09-01「继续」

## 目标

「查收件箱 / 搜信 / 附件下载 / 发信」目前只认 `data/mail/mail-credentials.json` 单个账号。本次把凭据升级为**容器**（`{ active, accounts }`），支持配置多个邮箱账号、自然语言切换（「切到 xx 邮箱」「用 xx 账号查收件箱」），收/搜/附件/发全部走 **active** 账号；旧单账号文件自动迁移，不破坏既有行为。

## 计划

1. `src/mail/credentials.ts`：新增 `CredentialsStore { active, accounts }`；`saveCredentials(creds, path, accountKey?)` 写容器（缺省沿用 active/`default` 并置 active）；`loadCredentials` 改为返回 **active** 账号（旧单对象格式自动迁移为 `active:'default'`）；新增 `loadCredentialsStore` / `setActiveAccount` / `listAccountSummaries`。
2. `scripts/mail-config.ts`：增 `--account <key>`（保存到指定账号并置 active）、`--set-active <key>`（纯切换）、`--list`（列出账号与 active）。
3. `src/skills/office-daily/index.ts`：email 模式最前新增切账号分支——`resolveAccountSwitch` 解析「切到/切换到/换成/用 xx (邮箱|账号) 查收件箱」等，按账号 key 或 from/user 邮箱定位；切到未配置账号诚实提示并列出已有账号；纯切换只回切换结果，带收件/搜/下载/发意图则切换后继续执行；多账号（≥2）时列表答案带 `（from）` 标签。
4. `src/agent/intent-feature.ts`：office_daily 特征正则补「切换/切到/换成 … 邮箱|账号」「用 … 邮箱|账号 … 查|看|收件|搜|发」→ 直连 office-daily。
5. 测试：credentials 容器/迁移/切换；office-daily 双假 IMAP 服务器多账号收件（切到 b 后走 b 的 LOGIN 与列表）；router-v2 切账号 → office-daily。
6. 文档：附录 A E302、roadmap E293-后「多账号」改已完成、当日 handoff。

**验收标准**

- `npm run build` 绿；credentials / office-daily / router-v2 相关单测全绿；`npm run doc-lint` 0 FAIL 0 WARN。
- 旧单账号文件读取行为不变；`saveCredentials` 无 key 时更新 active 账号。
- 「切到 b 邮箱」后「查收件箱」走 b 账号；「用 b 邮箱查收件箱」一条命令切换 + 列表。

## 执行过程

### 改动

- `src/mail/credentials.ts`：`CredentialsStore { active, accounts }` 容器 + `saveCredentials`（accountKey 参数）/`loadCredentials`（返回 active）/`loadCredentialsStore`/`setActiveAccount`/`listAccountSummaries`；旧单账号格式自动迁移。
- `scripts/mail-config.ts`：`--account <名称>` / `--set-active <名称>` / `--list`。
- `src/skills/office-daily/index.ts`：email 模式切账号分支（`resolveAccountSwitch`/`findAccountKey`/`activeAccountLabel`），收件/搜信列表多账号标注 active；`modeFrom` 补切账号关键词。
- `src/agent/intent-feature.ts`：office_daily 特征正则补切账号关键词。
- 测试：`src/mail/credentials.test.ts` +3、`src/skills/office-daily/index.test.ts` +4（含 `startFakeTlsImapServer` 暴露 transcript）、`src/agent/router-v2.test.ts` +3。

### 遇到的问题

- PowerShell 直接给 `apply_patch`（.bat 包装）传多行补丁会被 cmd 参数展开破坏（`<`/`>`/换行），改用直接调用 `codex.exe --codex-run-as-apply-patch` + here-string 传补丁。
- 单测用单字符账号 key（a/b）不符合解析正则（token 要求 ≥2 字符），改为 `qq`/`outlook` 真实风格 key 后通过。
- 全量 `test:all` 偶发 gateway 2 条 `fetch failed`（端口/时序抖动），gateway 隔离跑 24/24 两次通过、单测单独跑 0 fail；机器空闲重跑 `test:all` 全绿，判定为负载偶发、与本改动无关。

## 结果

- 验证：`npm run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN；`npm run test:all` 退出码 0（单测 1197/1198 含 1 skip + 集成 32/32）。
- 测试：新增单测 10 条——credentials 3（多账号容器建号/切换/摘要、旧单账号格式自动迁移、setActiveAccount 未知账号返回 false + 无 key 保存更新 active）、office-daily 4（切到未配置账号诚实提示、裸「切换账号」引导、双假 TLS IMAP 服务器切到 outlook 后查收件箱走 outlook LOGIN 与列表 + 多账号列表标注 active、用 qq 邮箱查收件箱一条命令切换+列表且持久化）、router-v2 3（切账号关键词 → office-daily）；credentials+router-v2+imap 119/119、office-daily 78/79（1 skip 为既有 PDF 用例）。
- 真实冒烟：待 owner 用两个真实邮箱验证——`npm run mail:config -- --account qq ...` / `--account outlook ...` / `--set-active outlook`，然后「切到 outlook 邮箱」「用 qq 邮箱查收件箱」。
- 提交：见 git log。
- 遗留事项：真实多账号 IMAP 冒烟待 owner 验证；Windows DPAPI 凭据加密仍为候选（既有 E170 候选）。
