# 架构审计报告（2026-08-23）

> 审计对象：`v0.2b` 分支 `src/` 全量（117 源文件 / 约 17.3k 行）+ gateway 装配层 + `docs/` 设计文档一致性。
> 审计口径：需求文档 v2.5（§0 宪法、§5 PARAM、§6 搜索管道、§10 安全模型）为唯一权威；只列真问题，不为改而改。
> 定级：高 = 可利用安全漏洞 / 数据丢失 / 核心能力与宣称不符；中 = 性能黑洞 / 资源泄漏 / 边界与统计错误；低 = 代码卫生。
> 状态：第三方审计输入，未登记 documentation-map，归档位置由 owner 决定。

---

## 一、总体评价

先说做得好的，这些不是客套：

1. **文档治理工程纪律罕见地强**。§0 宪法 + doc-lint 七检查 + [P-NN] 注册表 + bench 联动，代码侧 `params.ts` 与文档同步维护，实测抽查（P-80~P-107）映射完整。大多数商业项目做不到这个水平。
2. **契约统一执行到位**。CLI（`main.ts`）、gateway（`server.ts` → `app.ts`）、UI 全部收敛到同一个 `pipeline()`，没有第二套问答链路，符合 §0 的红线要求。
3. **SEV-1.3 修复本身质量高**。`src/gateway/terminal.ts` 的 `shell:false` + 元字符拒绝 + 1MB 流缓冲截断 + 超时 SIGTERM→SIGKILL 升级，是教科书式实现。
4. **sandbox fail-closed 方向正确**。`src/security/sandbox.ts` 对 `\\?\` 设备路径、UNC、跨盘符、短名路径实测全部拒绝（误拒而非误放行），SEV-1.2 修复有效。
5. **providers 超时纪律好**。三个引擎 adapter 的 AbortController / clearTimeout / JSON.parse try-catch 全部规范（详见"审查过无问题"清单）。
6. **测试面广**：96 个测试文件对 117 个源文件，关键安全件（sandbox/terminal/security-config）均有测试锁定。

核心结论一句话：**这个仓库的强项在"文档-参数-基准"治理，弱项在"运行时工程"——安全修复批只修了点名文件、同类漏洞留在 Skill 层；宣称的三层路由生产上只跑一层；热路径上同步 I/O 和每请求重建对象的密度过高。**

---

## 二、高危发现（10 项）

### H1. project-packager：PowerShell 命令注入（SEV-1.3 同类遗漏）

`src/skills/project-packager/index.ts:30-38`

```ts
spawnSync('powershell', ['-NoProfile', '-Command',
  `Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${zipPath}' -Force`], ...)
```

`srcDir` 来自 `extractPath(input.query)`（:19-27），其排除集 `[^\s，。；,!！]+` **不含半角 `;` 与 `'`**（均为合法 Windows 文件名字符）。`'` 闭合 PS 单引号 + `;` 分隔即可注入任意 PowerShell。这正是 SEV-1.3 在 terminal.ts 修掉的"字符串拼进解释器"模式，修复批没有扫到 Skill 层。
**修复方向**：改用 `Compress-Archive -LiteralPath` + 独立 argv 传参，或直接换 zip 库消灭 `-Command`。

### H2. project-packager：打包完全绕过 §10.1 沙箱白名单，凭据聚合外泄

`src/skills/project-packager/index.ts:58-91`

`resolve(raw)` 后仅 `existsSync` 即 `cpSync` 整目录再压缩，无 `isPathAllowed` 检查。诱导一句"打包 M:\202608111"即可把 `.env`（全部 LLM key）、`data/mail/mail-credentials.json`（SMTP 密码）、`data/browser-session`（登录态）打进 zip 并在回复中给出路径。直接违反 §10.1。

### H3. gateway 鉴权覆盖不一致 + 命令白名单语义反转，组成 RCE 链

- `src/gateway/app.ts:314`：`POST /api/security/persist` **无** `requireGatewayAuth`（对比 :426 terminal 有）。未持 token 者可直接写 `data/security-config.json`：`shellEnabled:true` + `allowedCommandPrefixes:[]`。
- `src/gateway/app.ts:441-449`：`allowlist.length === 0` 时**全放行**（默认配置即为空），与 §10.2"仅允许白名单内命令"的 default-deny 语义相反。
- `src/gateway/terminal.ts`：无 §10.2 要求的硬编码拒绝表。`del /S /Q x`、`powershell -enc <base64>`、`node -e ...` 均不含元字符 `;|&<>`，全部通过（terminal.test.ts:41 还把 `node -e` 注释为"合法场景"）。
- 无鉴权敏感端点还有：`/api/ask`（烧 LLM 配额）、`/api/files`、`/api/memory/forget`、`/api/usage/budget`、`/api/skills/sync`、`/api/providers/default|test`、`/api/routing/batch-mark|export`、`/api/calendar/*`。
- `.env.example` 未登记 `GATEWAY_AUTH_TOKEN`，新部署默认落在 dev 放行模式，SEV-1.4 修复实际生效概率低。

**修复方向**：所有非 GET 端点统一挂 `requireGatewayAuth`；白名单语义改"空=全拒"；按 §10.2 补硬编码拒绝表（`del /S`、`rm -rf`、`sudo`、`powershell -enc`、`node -e` 等解释器通道需白名单明示）。

### H4. SMTP：未加密连接上明文发送 AUTH LOGIN 凭据

`src/mail/smtp.ts:262-278`。`secure=false` 且服务器未通告 STARTTLS 时，条件 `creds.secure || didStartTls || /AUTH\s+LOGIN/i.test(caps)` 仍为真，继续 base64 发送用户名/授权码——base64 不是加密，中间人可直接截获邮箱授权码。`allowInsecureTls` 只管证书校验，管不到这条路径。**修复方向**：无 TLS 时拒绝 AUTH，或要求显式 `allowInsecureAuth` 配置。

### H5. 同进程两个 SessionContextStore 实例操作同一会话文件，互斥锁失效 + 非原子写 = 会话历史丢失路径

- `src/gateway/app.ts:64`：slash 命令用 `new SessionContextStore()`；
- `src/search/pipeline.ts:130-134`：pipeline 用模块级单例 `defaultSessionContext()`；
- `src/gateway/server.ts` 的 `deps` **没传** `sessionContext`，两个实例并存于同一 gateway 进程。

`runExclusive` 的 `queues` Map / `compacting` Set 都是实例内状态（`session-context.ts:93-94`），跨实例互斥为零。`persist` 用 `writeFileSync` 非原子（无 temp+rename）：一个 `/compact` 请求与一个正常问答并发时，两实例同时读-改-写同一 `data/session-context/<id>.json`——读到半截 JSON → `load()` 返回 null → `append()` 以空上下文重建 → **整段会话历史被清空**。CLI 与 gateway 跨进程共享该文件时锁同样不跨进程。
**修复方向**：server.ts 把同一个实例同时传给 app 与 pipeline deps；`persist` 改 temp+rename 原子写；跨进程场景加文件锁或单写者。

### H6. 三层意图路由的第二层（LLM 特征提取）在生产入口完全不可达

`src/agent/extract.ts:38-44`（`if (!llm) return rule-based`）+ `src/gateway/server.ts:52-62` 与 `src/main.ts:69-79`：两个真实入口的 deps 均未设置 `llm`。宣称的"规则→轻模型→LLM"三层，生产上只跑第一层；LLM 提取、P-84 fallback 折扣全部是"测试专用代码"。架构宣称与实际运行不符——要么接线，要么在文档里明确降级为单层并归档相关 PARAM（P-83/P-84）。

### H7. video-learner：固定共享工作目录，并发执行互相删除对方文件

`src/skills/video-learner/index.ts:566,716`。`workDir = join(outDir ?? 'data/learned-videos', 'tmp')` 固定为 `tmp`，`finally { rmSync(workDir, {recursive:true}) }` 整删。两次"学习视频"并发时：`downloadSubtitles` 的 `readdirSync + sort() 取 files[0]` 会拿到对方请求的文件，任一请求结束会删掉对方正在用的目录。**修复方向**：`mkdtempSync` 独立目录，一行改动。

### H8. skills-config 无缓存：每次问答 ~24 次同步读盘

`src/config/skills-config.ts:13-23`（`readDisabledSkills` 每次 `existsSync + readFileSync + JSON.parse`）× `src/skills/lifecycle.ts:118-137`（`findBest` 对**每个技能**调一次 `isSkillEnabled`）。pipeline 请求路径（`pipeline.ts:627`）每条问答触发约 24 次同步文件读 + 24 次 `SELECT *`。**修复方向**：读结果缓存为模块级 Set（写时失效），一行改动消除。

### H9. search-loop：字面量 "null" 查询发出 + Tavily 补搜串行黑洞

`src/search/search-loop.ts:311-316, 339-361`（已实测验证）：

- 触发条件 `(part || techDomains.length > 0)`：无型号但命中技术域（如"rtos 看门狗怎么配置"）时 `part === null`，:340 无条件拼 `` `${part} 立创商城 芯查查 半导小芯 datasheet` `` → 实际发出查询为 **"null 立创商城 …"**，且 :321 已先消耗一次 Tavily 月配额。`:335-338` 的 `${part} ${officialHint.domain} datasheet` 同病。
- `fallbackSearches`（最多 ~6 条，各 5s 超时）在 for 循环里**串行 await**，最坏 ~30s，且整段路径不受 Stage3 `budgetMs` 约束——这是"数据手册查询"这一核心场景的延迟黑洞，直接击穿 [P-15]=14s 管道预算。这些搜索相互独立（不同 includeDomains），`Promise.allSettled` 并联即可把尾部压到单次超时。

### H10. yt-dlp 参数注入

`src/skills/video-learner/index.ts:115-131`。用户/LLM 提取的 `url` 作为数组最后一项直接传入，无格式校验、无 `--` 分隔符。url 以 `-` 开头（`--exec=...`、`--cookies ...`）会被 yt-dlp 当作选项解析，可任意命令执行或读本地 cookie。**修复方向**：校验 `^https?://` 或加 `--` 终止符。

---

## 三、中危发现（按主题分组）

### 3.1 性能

| # | 位置 | 问题 |
|---|------|------|
| P1 | `src/search/pipeline.ts:749-793` | 低置信二次取证：`for target of targets` **串行** `fetchPage(url, 8000, 3000)`，每目标最坏 8s+，无总预算控制，叠加进 [P-15] 关键路径；PDF 分支 `readFileSync(dest)`（:768）同步读整份 datasheet（可达数十 MB）阻塞事件循环，且无大小上限 |
| P2 | `src/search/pipeline.ts:765` | 二次取证 PDF 落盘 `data/datasheets/${safeName}-${Date.now()}.pdf`：每次新文件名，**从不清理**，磁盘无界增长 |
| P3 | `src/search/llm-registry.ts:304-306` | `defaultRegistry()` 每次调用重建 Registry + new 一组 client，且 `LLM_PROVIDER_ORDER` 未设时每次 `existsSync+readFileSync` provider-order；每请求轻/重客户端各触发一次 |
| P4 | `src/search/stages/s3_search.ts:182-185` | `timeoutRace` 的 setTimeout 从不清理（Promise.race 后仍存活），长驻进程 timer 泄漏，CLI 退出被拖住；超时后底层 provider fetch 不取消，继续烧配额 |
| P5 | `src/search/stages/s3_search.ts:93-95` + `src/search/quota.ts:31-75` | 每次搜索 stage `new FileQuotaStore + FileMonthlyQuotaStore`，`take()` 全量同步读写 JSON；一次请求最多 9 个 stage × 2 provider ≈ 十几次同步文件 IO；读-改-写无锁，gateway 并发时丢计数 |
| P6 | `src/search/fusion.ts:76-82, 409` + `src/search/authority.ts:170-195` | 循环不变量在 per-item 循环内重算：query 侧 tokenize/Set 去重每条结果重跑一遍；同一 `${title} ${content}`.toLowerCase() 在 5 个函数里重复拼接最多 5 次；`isOfficialForQuery` 每次为每条规则 `new RegExp`——应模块级预编译 + query 派生值一次算好传入 |
| P7 | `src/search/cache.ts:14-45` | 缓存 Map 无容量上限、无 LRU、过期条目只在再次命中时删除——长驻 gateway 中 7/30 天 TTL 的死条目永久驻留内存 |
| P8 | `src/main.ts:62-63` | CLI 每次运行（含 `/context`、`/compact` 这类零网络命令）先**串行 await** Bocha 余额网络探测，白加一个 RTT+超时 |
| P9 | `src/search/document-parser.ts:29-61` + `src/skills/office-daily/index.ts:347-386` | 两处 Python 子进程**无超时**：PyMuPDF/OCR 卡死则请求永久挂起；document-parser 的 `child.stdin.end(buffer)` 无 error 监听，子进程提前退出时 EPIPE 变未捕获异常；office-daily `runPython` 的 stdout 累加无上限 |
| P10 | `src/agent/multimodal-preprocessor.ts:86-127` | PNG 归一化：请求路径同步写整图 Buffer + `python`/`python3` 串行候选各 15s 超时，单张图最坏阻塞 ~30s |
| P11 | SQLite 全线无 `PRAGMA journal_mode=WAL` / busy_timeout；热路径每请求 5+ 次同步 SQLite 落盘（put/addSessionSummary/recordUse×2），prepared statement 每次重编译；`user-context-store.ts:245-268` archiveExpired 循环逐行 UPDATE 无事务（每行一次 fsync） |
| P12 | `src/memory/experience.ts:127-167` | `search()/list()/stats()` 全表 `SELECT *` 载入内存再关键词过滤，O(N)/请求，随经验库增长线性恶化 |
| P13 | `src/agent/route-case-store.ts:62-98` + `app.ts:496-521` | route-cases.jsonl 无轮转（已 900KB）无界增长；`recordFeedback` 全文读+全文写；`batch-mark` 循环调它 = O(m×n) 同步重写；读-改-写无锁，与 pipeline `record()` 并发丢数据 |
| P14 | `src/memory/session-context.ts:195` vs `:69` | 会话摘要只追加不合并（每轮 ≤600 字符永久累加），注入端却只取前 600——存储无界膨胀 + 第 601 字符后的信息**静默丢失**；`compactIfNeeded` 失败被吞（`pipeline.ts:234-238`）时 turns 全量注入 prompt（各 120 字符）无硬顶 |
| P15 | `src/trajectory/trajectory-log.ts:82-88`、`src/usage/usage-store.ts`、`src/search/metrics.ts:28-30` | 轨迹/用量/指标 JSONL 每事件一次 open-write-close 同步追加，且均无轮转/大小上限；`readUsage` 每次全量解析整文件 |
| P16 | `src/gateway/app.ts:99-115` | rateBuckets Map 只增不删（每个新 IP 永久占一条），且 `/api/ask` 只有速率限制无并发上限，30 req/min 内的并发请求可同时打满 LLM 配额 |
| P17 | `src/search/llm-registry.ts:170-187` | fallback 链 3 家 × 30s 串行无总预算，最坏 90s——Stage5 降级时间远超 [P-06]=12s 预算 |

### 3.2 边界条件与正确性

| # | 位置 | 问题 |
|---|------|------|
| B1 | `src/agent/router-v2.ts:246-248` | **P-82 死参数**：`(second && 分差 < gap) \|\| deduped.length > 1` 逻辑上恒等于 `deduped.length > 1`（second 存在 ⇔ length>1）——中置信带出现 ≥2 候选就强制 option_clarify，分差 0.001 和 0.6 同等对待。消歧率被硬性放大，调 gap 无效（这正是根目录一堆 `_route_worse.ts` 调试脚本的病根之一） |
| B2 | `src/agent/confidence-calibration.ts:25-29, 68-78` | 校准统计两个系统性偏差：① percentile 用 `Math.floor(p*n)`，小样本（n=4, p=0.75）取到最大值而非 75 分位，建议阈值方向性偏激；② `Math.max(现值, 建议值)` 棘轮——阈值只升不降，全量历史样本无时间窗，早期一条误标把 Low 永久钉在 clamp 上限，回路不收敛，长期单调漂向"过度澄清" |
| B3 | `src/agent/llm-rule-proposer.ts:114-116` | LLM 提案的 `confidenceBoost` 仅 `Number.isFinite` 即接受（可 0.9/负值），进 ROUTING_TABLE 后直接支配排序；确定性路径固定 0.15，LLM 路径无 clamp，不对称 |
| B4 | `src/search/pipeline.ts:588-591` | Skill 执行失败 `catch {}` 静默后落到"⚠️ 执行器尚未接入"文案——已接入但失败的 skill 被误报为"未接入"，错误归因误导用户与后续排障 |
| B5 | `src/skills/office-daily/index.ts:852-853` | PDF 加密默认密码 `'123456'`：用户未提供时静默用弱密码加密并在回复中回显 |
| B6 | `src/skills/video-learner/index.ts:660-664` | LLM 输出 `JSON.parse` 无 try/catch（同文件其他解析都有），模型输出畸变即整个 skill 失败 |
| B7 | `src/skills/install.ts:40-49` | manifest 的 version/triggers 校验仅非空，内插进单引号 JS 字符串生成 skill 源码——含 `'` 或反斜杠可注入任意代码到生成文件；应改 `JSON.stringify` |
| B8 | `src/memory/memorycore-cleaner.ts:25` | `readdirSync` 目录不存在直接 ENOENT 抛出（无 existsSync/try），清理流程整体崩溃；:25-49 的读-改-写重写 JSONL 与 sidecar 追加并发时静默丢单（.bak 只兜底恢复） |
| B9 | `src/reminder/reminder-store.ts:103-129` | `dueReminders` 的 SELECT→UPDATE 非原子：两步间崩溃重复推送；gateway 与 CLI 同时轮询双双取到同一批行；返回值带顺延前的旧 remindAt |
| B10 | 时区口径三处不一致：`weekend-market.ts:7-8`（本地时区判 A 股周末）、`s5_synthesize.ts:33-39`（本地日期注入"今天是"）、`usage-store.ts:63-71`（本地时区切日）——非东八区部署时行情判定/时效问答/统计全部漂移 |
| B11 | `src/skills/calendar-skill/index.ts:90-95` | ICS 全天事件按 UTC 00:00 存、无时区时间按服务器本地时区解析，导入结果随部署机器漂移；导出无 `VALUE=DATE`，全天事件变成 08:00 定时事件 |
| B12 | `src/memory/experience.ts:65-74` | `INSERT OR REPLACE` 重学同 id 经验时 usage_count/confidence 全部清零（REPLACE=删+插），生命周期统计被悄悄归零 |
| B13 | `src/skills/office-daily/index.ts:305,895` + `calendar-skill:341` | 标题/正文"关键词切除"用全局 `replace` 而非剥前缀："请帮我安排和老板的会议"→标题"和老板"；正文含"请"字被挖字 |
| B14 | `src/gateway/app.ts:294` | `/api/memory/forget` 的 `Number(id.replace(...))`：id 传 `"fact:"` 得 0，`Number.isFinite(0)` 为真，可能误操作 id=0 |

### 3.3 安全（中危）

| # | 位置 | 问题 |
|---|------|------|
| S1 | `src/browser/session.ts:268-368` | `fetchPage/downloadFile` 无 URL 校验（SSRF 面）：带登录态的浏览器可被网页内容里的提示注入驱动访问 `http://127.0.0.1:8420`（MemoryCore sidecar，弱 key）或内网管理页，结果回填进回答。建议内网地址/协议黑名单 |
| S2 | `session.ts:246` + `scripts/browser-launch.ts:68-76` | CDP 调试口期间本机任意进程可经 9222 完全控制浏览器读全部 cookie；CDP 态持久化在 `data/browser-session-cdp.json` 长期自动重连，"曾经开过调试口"的风险窗口无限延长。建议不用时显式关闭+提示 |
| S3 | `configs/tdai-gateway.local.yaml:10` + `memorycore-store.ts:19` | sidecar 与客户端双双弱默认 key `'local-dev-key'`：本机任意进程可冒充服务跨 team/user 读写全部记忆。部署时强制随机 key、拒绝默认值启动 |
| S4 | `src/mail/credentials.ts:77-81` | SMTP 授权码明文 JSON 落盘（注释自认 DPAPI 留作后续）；叠加 H2 的打包外泄可被聚合。建议至少收紧 ACL |
| S5 | `src/skills/project-writer/index.ts:78-106` + `sandbox.ts` | TOCTOU：`isPathAllowed` 返回 resolved 字符串后 `writeFileSync(filePath)` 按路径重新遍历，检查与写入之间 symlink 交换可逃逸（单用户本机前提较强，定级中）。写后 realpath 复核可收口 |
| S6 | `src/skills/calendar-skill/index.ts:283-295` | 从聊天文本正则抓路径直接 `readFileSync`（限 .ics），经 gateway 暴露后是任意 .ics 读取原语，无白名单 |
| S7 | `src/config/params.ts` | §10.2 引用的 P-38/39/40（编译/烧录/单文件超时）已登记但**全仓库未实现**（terminal.ts 硬编码 15s 单一超时）；文档-代码联动在"已登记未实现"维度没有 lint 覆盖 |

### 3.4 死代码 / 宣称与实现脱节

| # | 位置 | 问题 |
|---|------|------|
| D1 | `src/config/params.ts:16`（P-83） | `routeLlmTimeoutMs=1500ms` 全仓库无引用；实际生效 light 档 1750ms × 3 provider 串行 = 最坏 5.25s。PARAM 注册表存在"登记即生效"的治理空隙——建议 doc-lint 或单独 lint 校验每个 numeric PARAM 在代码侧有引用 |
| D2 | `session-context.ts:16` | `COMPACT_TIMEOUT_MS=8000` 死常量：/compact 实际用轻档 1750ms 超时，大会话压缩极易失败，叠加 P14 造成无界增长 |
| D3 | `multimodal-preprocessor.ts:185-201` | fast-description 整条链路（P-87/P-88）无任何调用方 |
| D4 | `src/memory/distill.ts:69-84` | L1 蒸馏 `distillRecord` 无业务调用方（仅测试引用），§8 宣称的蒸馏链路未接线 |
| D5 | `src/memory/memorycore-store.ts` | SEV-1.1 身份隔离修复**正确但未接线**：全仓库无 `new MemoryCoreStore` 业务调用，修复无实际暴露面（也未经真实流量检验） |
| D6 | `package.json:80` | `better-sqlite3` 声明但全仓库未使用（实际走 node:sqlite，见附录 A E4 偏离登记）——原生模块被无谓安装 |
| D7 | `src/agent/executors.ts:28` + `mode-mapper.ts:16-23` | `executorStatus(undefined)` 返回 'available'（语义反转）；`LIFE_INTENTS` 漏 companion_chat 与 pipeline 硬编码 `mode:'life'` 口径分裂 |

---

## 四、Pro 级实现建议（架构层，非必改）

1. **pipeline.ts 瘦身**：932 行单函数、`decision.type === 'direct' || 'confirm'` 收窄重复 10+ 次、每个 intent 一段手写 return。建议抽 `isSelectedDecision` 类型守卫 + intent→handler 表驱动（`Map<intent, handler>`），各 handler 只负责组装差异部分，公共的 return 骨架/trajectory/记忆写入收口到一处。这也是 B4（错误归因）这类 bug 的结构性病根。
2. **消灭三份重复基础设施**：`dedupe` 三份（fusion/search-loop/s3_search，s3 版已丢 content 兜底 key）、tokenizer/相关性两份（fusion/second-pass，已开始漂移）、`extractJsonObject` 两份、`csvCell` 两份、"10 样本"常量两份。漂移已经发生，抽公共模块的收益是确定的。
3. **热路径 I/O 纪律**：确立"请求路径禁止同步 fs/子进程"的约定（现在是 `readFileSync`/`writeFileSync`/`spawnSync`/同步 SQLite 混布在 gateway 每请求路径上）。一次性动作：quota/config/registry 缓存化 + WAL + statement 复用 + 轮转，即可把单请求的同步 I/O 从几十次降到个位数。
4. **PARAM 治理补代码侧闭环**：文档侧 doc-lint 很强，但 P-82（逻辑死）、P-83（无引用）、P-87/88（无调用方）、P-38/39/40（未实现）说明"登记≠生效"。建议加一个 `params-usage` lint：每个 numeric/conditional PARAM 必须 grep 到 `src/` 引用，否则 WARN。这与 §0.2 数值单家规则是同构延伸。
5. **并发模型统一**：SessionContextStore 的实例内锁在"跨实例、跨进程"两个维度都失效，是当前唯一有数据丢失现实风险的设计。单写者（写队列进程/文件锁）比修 Map 锁更符合 CLI+gateway 并存的现实拓扑。

---

## 五、审查过、确认无问题的面（避免重复劳动）

- **JSON.parse**：providers/quota/balance/cache/judgeCoverage/query-rewrite/s2_classify/metrics 全部在 try/catch 内，无裸解析（唯一例外 video-learner:660，已列 B6）。
- **除零/NaN**：fusion 的 hits/tokens、quota 的 ratio、timeliness 的 days 全有守卫；router-v2 权重求和有 `>0` 守卫 + clamp 完整；阈值比较统一 ±1e-9 epsilon。
- **正则回溯**：collectPdfText 交替组互斥、streamRe 惰性量词，无嵌套量词，无灾难性回溯；entityFilter 对型号正确转义。
- **providers 超时清理**：bocha/anysearch/tavily/balance/llm-client/vision 的 clearTimeout 均在 finally（唯一例外 s3_search timer，已列 P4）。
- **斜杠命令注入面**：整行白名单匹配、无参数拼接、`safeId` 净化 conversationId，干净。
- **sandbox 逃逸向量**：`\\?\` 设备路径、UNC、跨盘符、8.3 短名实测全部 fail-closed 拒绝。
- **密钥管理**：env.ts 不覆盖已有值；key 只进 Authorization 头；model-catalog/providers 端点不回传 apiKey；trajectory 不记 header/key；git 历史 .env 从未提交。
- **Express CSRF/CORS**：无 CORS 头，浏览器跨域 POST 预检必失败，同源隔离成立。
- **routing-table 规则表本身**：未发现独立缺陷（问题都在打分/决策侧）。
- **rule3/tavily-trigger/heartbeat/emergency-reply/model-router/model-id/rule1/s1_prepare/s2_classify**：无实质问题。

---

## 六、修复优先级建议（最小集合）

| 批次 | 内容 | 理由 |
|------|------|------|
| 立即（安全） | H1+H2（project-packager 注入+沙箱绕过）、H3（gateway 鉴权/白名单语义/硬拒绝表）、H4（SMTP 明文 AUTH）、H10（yt-dlp） | 全部是可利用漏洞，且 H1/H3 与已收口的 SEV 批同主题，修复模式现成 |
| 立即（数据） | H5（SessionContextStore 单实例 + 原子写） | 唯一正在产生数据丢失风险的项，改动小 |
| 短期（正确性） | H9（null 查询 + 补搜并联）、B1（P-82 逻辑）、B4（skill 失败误报）、H8（skills-config 缓存） | 影响核心问答质量与延迟预算，均为小改动 |
| 短期（决策） | H6（三层路由接线或降级声明）+ D1-D5 死代码清理 | 消除"宣称与实现脱节"，这是本项目文档治理品牌的命门 |
| 中期 | P1-P17 按热路径顺序（P4/P5/P3/P6 收益最大）、B2+B3 校准回路、S1-S3 | 性能与统计质量批次 |

---

*审计方法：需求文档 v2.5 全文 + docs/ 设计文档一致性核对；4 个并行模块深审（search / agent+slash / memory+skills / security+config）+ 核心文件人工复读（pipeline、gateway/app、terminal、files、sandbox、main、server）+ 高危项逐条实测验证（null 查询拼接、SMTP 分支、共享 tmp、无缓存读盘、死参数逻辑均已代码证实）。旧 `文档/` 目录已按 owner 指示忽略，以 `docs/` 为准。*
