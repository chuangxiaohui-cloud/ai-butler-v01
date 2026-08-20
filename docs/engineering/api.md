# API 接口文档

> 实现：`src/gateway/app.ts`；正式 OpenAPI 文件待生成，本文档先作为人工维护的接口契约。

## 1. 通用约定

- 默认监听 `127.0.0.1:8787`。
- 请求体：`application/json`，附件上限由 `express.json({ limit: '25mb' })` 控制。
- 错误格式：`{ "error": string }`，网关不泄露内部堆栈。
- 成功响应：各端点见下表。

## 2. 核心问答端点

```yaml
openapi: 3.0.3
info:
  title: AI-Butler Gateway
  version: 0.1.0
paths:
  /api/ask:
    post:
      summary: 单一问答入口，返回四字段契约
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [query]
              properties:
                query: { type: string }
                userId: { type: string }
                modelId: { type: string, example: "deepseek:heavy" }
                attachments:
                  type: array
                  items:
                    type: object
                    properties:
                      name: { type: string }
                      type: { type: string }
                      dataUrl: { type: string }
      responses:
        "200":
          description: 四字段契约 + mode/submode
          content:
            application/json:
              schema:
                type: object
                properties:
                  query: { type: string }
                  answer: { type: string }
                  confidence: { type: number }
                  evidence:
                    type: array
                    items:
                      type: object
                      properties:
                        title: { type: string }
                        url: { type: string }
                        domain: { type: string }
                        score: { type: number }
                        type: { type: string, enum: ["[hard]", "[soft]"] }
                  gate_triggered:
                    type: string
                    enum: [none, emergency, low_confidence, safety]
                  mode: { type: string, enum: [engineering, knowledge, life] }
                  submode: { type: string }
        "400":
          description: query 为空或附件格式不正确
        "500":
          description: 内部错误，统一脱敏消息
```

## 3. 端点清单

| 方法 | 路径 | 请求 | 响应要点 |
|------|------|------|---------|
| POST | `/api/ask` | `query`、可选 `userId/modelId/attachments` | 四字段契约 + mode/submode |
| GET | `/api/health` | 无 | `{ ok, service, contract }` |
| GET | `/api/model-providers` | 无 | 模型目录 |
| GET | `/api/files` | 无 | 沙箱白名单内文件列表 |
| GET | `/api/events` | SSE | progress / artifact / files_changed |
| GET | `/api/providers` | 无 | provider 状态与顺序 |
| POST | `/api/providers/default` | `providerId` | `{ ok, order }` |
| POST | `/api/providers/test` | `providerId` | `{ ok, model?, latencyMs?, error? }` |
| GET | `/api/skills` | 无 | `{ total, enabled, skills }` |
| POST | `/api/skills/sync` | `disabled[]` | `{ ok, disabled }` |
| GET | `/api/usage/stats` | 无 | `{ stats, budget }` |
| POST | `/api/usage/budget` | `budgetYuan/degradeAtPercent` | `{ ok, budget }` |
| GET | `/api/memory` | 无 | `{ total, items }` |
| POST | `/api/memory/forget` | `id/type` | `{ ok, error? }` |
| GET | `/api/security` | 无 | `SecurityConfig` |
| POST | `/api/security/persist` | `SecurityConfig` 部分字段 | `{ ok, security }` |
| POST | `/api/terminal/exec` | `command` | `{ command, stdout, stderr, exitCode, durationMs }`；未开 Shell 或不在白名单 → 403 |
| GET | `/api/routing/cases` | 无 | `{ total, audit, records }` |
| POST | `/api/routing/batch-mark` | `updates[]` | `{ updated, failed }` |
| POST | `/api/routing/export` | `format: json/csv` | 文件下载 |

## 4. SSE 事件

| 事件 | 数据 | 触发 |
|------|------|------|
| `progress` | `{ stage, at }` | pipeline 六阶段回调 |
| `artifact` | `{ skill, state, path?, at }` | Skill generating/done/failed |
| `files_changed` | `{ at }` | /api/ask 完成后 |
| `connected` | `{ at }` | 订阅建立 |
