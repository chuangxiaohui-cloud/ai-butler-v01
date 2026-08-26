# 隐私与数据处理说明 · v1.0

> 版本快照：2026-08-26（v0.2b 分支）· 文档类型：交付期审核快照（documentation-map 第四组 #2）
> 证据来源：`.env.example`、`data/` 目录约定、需求 §8.1.4（memory-core sidecar）/§10.3（联网搜索脱敏）/
> §10.5（五源信任域）。

## 1. 数据分类与存储位置

| 数据类别 | 存储位置 | 生命周期 |
|---------|---------|---------|
| 对话轨迹 | `data/trajectory.jsonl`（append-only，[P-113] 轮转保留一份 `.1` 归档） | 本地，git 忽略，不提交 |
| 记忆（L0-L2/经验/用户上下文） | 本地 SQLite（`data/`）或 MemoryCore sidecar（`~/.tdai-memory/data/`，§8.1.4） | 本地持久化；冷存不删（§8.2.2） |
| Skill 安装/生命周期 | `data/` JSONL | 本地；卸载保留记录，不静默删除 |
| 仓库白名单与 push 审计 | `data/repo-whitelist.jsonl`、`data/repo-push-events.jsonl` | 本地；审计条目不含 token |
| 命令审计 | `data/audit-command.jsonl` | 本地 |
| 用量/指标/会话上下文 | `data/usage-budget.json`、`data/search-metrics.jsonl`、`data/session-context/` | 本地 |
| 浏览器 CDP 端口/登录态/OCR 缓存 | `data/`（运行时状态） | 本地，git 忽略 |

**原则**：一切运行时数据本地落盘（`data/`，git 忽略不提交）；机器轨迹、搜索指标、登录态均不入版本库。

## 2. 外发数据最小化

| 外发方向 | 内容 | 控制 |
|---------|------|------|
| 搜索引擎（Bocha/AnySearch/Tavily） | 脱敏后的查询文本 | §10.3 最小化脱敏：剥离本地绝对路径、用户名/主机名、API Key/token、内网地址（192.168/10.x）、公司/项目内部代号；仅传芯片型号 + 问题本质；脱敏开关默认开，工程栏可显式选择携带上下文 |
| LLM 推理（DeepSeek/MiniMax/智谱） | 问答上下文与任务内容 | §8.1.4：云端只接收推理请求并返回文本，不存储用户数据；Provider 未配置 key 不参与（fallback 链仅含已配置 Provider） |
| 代码托管（GitHub/Gitee） | 用户显式授权的仓库推送内容 | 仅 `repo:push --yes` 显式触发；仓库需先 `repo:whitelist --authorize`；token 仅环境变量注入，审计不含 token（E225/E244） |
| IM 通道（QQ OneBot） | 本地 HTTP 端点接收消息事件、回发回复 | 仅 `127.0.0.1` 监听，accessToken 必填（E241）；gate 未授权平台不回复；CQ 图片/文件不下载 |

## 3. 敏感信息保护

- **密钥**：所有 API Key 仅存 `.env`（git 忽略，从 `.env.example` 复制）；进程内注入，不写 `.git/config`、不落审计日志（E225/E244 断言覆盖）。
- **记忆侧脱敏**：写入记忆服务的查询日志同样经 §10.3 脱敏；召回结果标置信度，低置信不自动执行（[P-16]）。
- **搜索查询日志**：`bench/search-metrics.jsonl` 仅记录脱敏后的查询与引擎耗时/成败，不含项目上下文。

## 4. 本地优先与离线能力

- 搜索管道各 Stage 本地计算；记忆检索（BM25/向量）纯本地（§8.1.4 三硬约束：蒸馏失败不阻塞主对话、结果写本地 SQLite 离线可用、SDK 调用超时兜底 [P-42]）。
- 网络断开时：已蒸馏记忆正常检索；新记忆蒸馏积压 L0 队列，网络恢复自动续跑。

## 5. 用户控制权

- 记忆管理：`GET /api/memory` 查看、`POST /api/memory/forget` 遗忘（E114，UI 记忆管理页）。
- 仓库授权：`npm run repo:whitelist -- --authorize|--revoke|--list` 显式控制可推送仓库。
- 反馈与修正：§9 轻量反馈（赞/踩/修改建议）驱动经验闭环；`npm run route:feedback` 提交 accept/reject。

## 6. 已知边界（诚实登记）

- LLM 推理请求承载问答内容本身，属于外发数据；云端服务商隐私政策由用户自行评估（本项目侧仅保证最小化原则与配置可见）。
- 浏览器会话登录态存本地 `data/`；使用内置浏览器抓取时，目标站点可见访问行为（与普通浏览器一致）。
- 本说明为 v1.0 收口快照；数据处理规则变更时重新生成，不覆盖本版。
