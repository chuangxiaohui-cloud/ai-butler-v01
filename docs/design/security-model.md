# 安全模型设计

> 权威需求：§10.1-§10.5；实现：`src/security/sandbox.ts`、`src/gateway/terminal.ts`、
> `src/config/security-config.ts`

## 1. 已实现

| 项目 | 实现 | 说明 |
|------|------|------|
| 文件沙箱 | `sandbox.ts` | 白名单根目录 `projects/`、`sandbox/`、`outputs/` + `SANDBOX_ALLOWED_DIRS` |
| 越界审计 | `logSandboxAudit` | `data/audit-sandbox.jsonl`，不阻塞主流程 |
| Agent 操作回滚 | `operation-log.ts` | `project-writer` 写入登记 `data/operations.jsonl`，撤销时恢复备份或删除新建文件 |
| Shell 权限 | `security-config.ts` | `shellEnabled` 默认 false |
| 命令前缀白名单 | `allowedCommandPrefixes` | 白名单非空且不匹配 → gateway 403 |
| 终端执行 | `terminal.ts` | `exec` 超时、stdout/stderr/exitCode 返回 |
| 安全中心 API | `gateway/app.ts` | `/api/security`、`/api/security/persist` |

## 2. 需求目标与当前差距

| 需求 | 当前状态 | 差距 |
|------|---------|------|
| 白名单完整命令集合（编译/烧录/包管理/文件/测试） | 🔨 部分 | 只落地前缀白名单，未做完整命令参数正则 |
| 硬编码拒绝（rm -rf /、del /S /Q、sudo、powershell -enc、node -e 等） | ✅ | `command-whitelist.ts` HARD_REJECTS + `terminal.ts` HARD_DENY_RULES 双层拦截 |
| 搜索脱敏 | ✅ 部分 | Stage 1 `sanitizeQuery` 已实现路径/IP/密钥剥离 |
| 五源信任域 | 🔨 部分 | prompt 隔离与元数据标记在合成 prompt 中体现，未形成独立防御模块 |
| 安全 TDD 用例 | ✅ 部分 | `sandbox.test.ts`、`terminal.test.ts`、`security-config.test.ts` 已存在，需按 §10.4 补齐全量 |

## 3. 安全配置

`SecurityConfig` 字段：

- `shellEnabled`：终端总开关。
- `fileAccess`：`project-only` 或 `all`。
- `externalApiEnabled`：外部 API 开关。
- `illegalEnabled` / `personalEmergencyEnabled` / `propertyEmergencyEnabled`：三类安全分支。
- `allowedCommandPrefixes`：命令前缀白名单。

默认安全：Shell 关闭、文件仅项目目录、外部 API 关闭、安全分支开启。

## 4. 测试基线

已存在：

- `src/security/sandbox.test.ts`
- `src/gateway/terminal.test.ts`
- `src/config/security-config.test.ts`

已覆盖（§10.4，2026-08-29 M7 复核）：

- 越界写系统目录 403：`sandbox.test.ts`。
- `rm -rf /`、`del /S /Q`、`powershell -enc`、`node -e` 硬编码拒绝：`command-whitelist.test.ts` + `terminal.test.ts`。
- `curl ... | sh` 拒绝：`command-whitelist.test.ts`。
- 白名单内命令允许：`command-whitelist.test.ts`。
- 搜索路径 / IP / API Key 脱敏：`query-sanitize.test.ts`。
- 读 `~/.ssh/id_rsa` 拒绝：`sandbox.test.ts`「越界读取」独立断言。
