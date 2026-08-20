# 环境变量与配置清单

> 模板：`.env.example`；`.env` 不提交。运行时配置持久化在 `data/`。

## 1. 搜索

| 变量 | 用途 |
|------|------|
| `BOCHA_API_KEY` | Bocha 搜索密钥 |
| `ANYSEARCH_API_KEY` | AnySearch 搜索密钥 |
| `BOCHA_DAILY_LIMIT` | Bocha 日配额覆盖（默认仅观察） |

## 2. LLM

| 变量 | 用途 |
|------|------|
| `LLM_PRIMARY_BASE_URL` / `LLM_PRIMARY_API_KEY` | legacy 主 LLM |
| `LLM_FALLBACK_BASE_URL` / `LLM_FALLBACK_API_KEY` | legacy fallback |
| `LLM_LIGHT_MODEL` | Stage 2 轻模型 |
| `LLM_CLASSIFY_TIMEOUT_MS` | 分类超时 |
| `VLM_BASE_URL` / `VLM_API_KEY` / `VLM_MODEL` / `VLM_TIMEOUT_MS` | 视觉模型 |

## 3. Provider Registry

| 变量 | 用途 |
|------|------|
| `LLM_PROVIDER_ORDER` | 默认便宜优先顺序 |
| `DEEPSEEK_*` | DeepSeek base/key/light/medium/heavy/vision |
| `MINIMAX_*` | MiniMax 对应配置 |
| `ZHIPU_*` | 智谱对应配置 |
| `LLM_MEDIUM_TIMEOUT_MS` | 中档模型超时 |

## 4. Gateway / UI / 桌面

| 变量 | 用途 |
|------|------|
| `GATEWAY_HOST` / `GATEWAY_PORT` | gateway 监听 |
| `VITE_GATEWAY_URL` | UI 开发环境 gateway 地址 |

## 5. 本地数据

| 变量 | 用途 |
|------|------|
| `DATA_DIR` | 默认数据目录 |
| `CALENDAR_DB_PATH` / `QUOTES_DB_PATH` / `MESSAGES_DB_PATH` | Skill 本地库路径 |
| `MEMORY_CORE_ENDPOINT` / `TDAI_GATEWAY_API_KEY` / `TDAI_SERVICE_ID` | MemoryCore 连接 |

## 6. 浏览器与沙箱

| 变量 | 用途 |
|------|------|
| `BROWSER_EXECUTABLE` | 浏览器可执行文件 |
| `SANDBOX_ALLOWED_DIRS` | 额外沙箱白名单目录，分号分隔 |

## 7. Git 联动

| 变量 | 用途 |
|------|------|
| `GITHUB_USER` / `GITHUB_TOKEN` | GitHub 推送 |
| `GITEE_USER` / `GITEE_TOKEN` | Gitee 推送 |

## 8. 安全说明

- API Key 只从环境读取，不落盘、不提交、不进轨迹日志。
- 搜索前 Stage 1 脱敏路径/IP/密钥格式。
- 新增环境变量必须同步 `.env.example` 与本清单。
