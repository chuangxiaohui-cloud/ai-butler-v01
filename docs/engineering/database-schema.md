# 数据库 Schema 文档

> 说明：核心本地存储使用 `node:sqlite` 的 `DatabaseSync`；schema 变更必须遵守迁移纪律。

## 1. SQLite 文件

| 文件 | 模块 | 表 |
|------|------|----|
| `data/memory.db` | `src/memory/store.ts` | `l0_memory`、`l1_memory` |
| `data/experience.db` | `experience.ts` + `lifecycle.ts` | `experiences`、`skill_stats` |
| `data/user-context.db` | `user-context-store.ts` | `user_profile`、`user_facts`、`session_summaries` |
| `data/calendar.db` | `calendar-skill` | `calendar_events` |
| `data/quotes.db` | `quote-compare` | `vendor_quotes` |
| `data/messages.db` | `im-dispatch` | `message_outbox` |

## 2. 关键表

### l0_memory（冻结 schema v1）

```sql
l0_memory(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  query TEXT NOT NULL,
  answer TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence_hash TEXT NOT NULL,
  raw_jsonl TEXT NOT NULL,
  timestamp INTEGER NOT NULL
)
```

### experiences

```sql
experiences(
  id TEXT PRIMARY KEY,
  skill_name TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  thumbs_down_count INTEGER NOT NULL DEFAULT 0,
  consecutive_down INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.5,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  needs_review INTEGER NOT NULL DEFAULT 0
)
```

### skill_stats

```sql
skill_stats(
  name TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  thumbs_down_count INTEGER NOT NULL DEFAULT 0,
  consecutive_down INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.6,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  needs_review INTEGER NOT NULL DEFAULT 0
)
```

### user_profile / user_facts / session_summaries

```sql
user_profile(user_id, role, current_projects, reply_style, tone, updated_at)
user_facts(id, user_id, content, source, confidence, created_at, last_accessed_at, review_count, archived)
session_summaries(id, user_id, session_id, summary, topics, created_at)
```

`summary` 写 `Q: 原文\nA: 回答`；L0 `l0_memory.session_id` 对非默认用户使用
`v0.1-cli:<userId>`。

### Skill 本地库

```sql
calendar_events(id, user_id, title, time_expression, start_at, created_at)
vendor_quotes(id, vendor, part, unit_price, moq, lead_days, note)
message_outbox(id, recipient, content, status, created_at)
```

## 3. JSONL / JSON 数据

| 路径 | 内容 |
|------|------|
| `data/route-cases.jsonl` | 路由 case 与反馈 |
| `data/trajectory.jsonl` | append-only 轨迹 |
| `data/usage.jsonl` | Token 计量 |
| `data/search-metrics.jsonl` | 搜索耗时/成功/超时 |
| `data/audit-sandbox.jsonl` | 沙箱审计 |
| `data/search-quota.json`、`data/tavily-monthly.json` | 配额状态 |
| `data/provider-order.json`、`data/skills-config.json`、`data/usage-budget.json`、`data/security-config.json` | 运行时配置 |

## 4. MemoryCore sidecar 数据

- 数据目录：`~/.memory-tencentdb/memory-tdai`（可配置）。
- 存储：SQLite + Markdown / JSONL，`storeBackend: sqlite`。
- 项目侧清理：`memorycore-cleaner.ts` 直接过滤 `conversations/*.jsonl`，先备份再写回。

## 5. 迁移脚本清单

| 脚本 | 用途 |
|------|------|
| `scripts/migrate-to-memorycore.ts` | v0.1/v0.2a SQLite → MemoryCore 迁移 |
| `scripts/distill-worker.ts` | L0 → Experience L1 蒸馏 |
| `scripts/memorycore-cleaner.ts`（模块） | MemoryCore L0 清理 |

## 6. 纪律

- schema v1 冻结：只加列/加表，禁止改名/删列。
- 迁移脚本随版本附带，先备份再变更，回滚按需求 §11.2。
