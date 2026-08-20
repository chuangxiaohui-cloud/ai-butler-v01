# 接口契约文档

> 权威需求：§6.3 / §8.4 / §13；实现：`src/search/pipeline.ts`、`src/memory/store.ts`、
> `src/search/providers/types.ts`、`src/skills/registry.ts`

## 1. 问答契约

```ts
answer(query) -> {
  answer: string;
  confidence: number;
  evidence: Evidence[];
  gate_triggered: 'none' | 'emergency' | 'low_confidence' | 'safety';
}
```

| 字段 | 类型 | 含义 |
|------|------|------|
| `answer` | string | 秘书回答正文 |
| `confidence` | number | 0-1 综合置信度，Stage 6 钳制 |
| `evidence` | Evidence[] | 可追溯证据列表 |
| `gate_triggered` | enum | 门控类型：普通 / 紧急 / 低置信 / 安全 |

UI 扩展元数据：`mode`（engineering / knowledge / life）与可选 `submode`
（product_planning / review_critique）由路由层附加，不影响四字段契约。

`Evidence`：

```ts
{
  title: string;
  url: string;
  domain: string;
  score: number;
  type: '[hard]' | '[soft]';
}
```

## 2. MemoryStore

```ts
interface MemoryStore {
  put(record: MemoryRecord): Promise<string>;
  recall(sessionId: string, limit?: number): Promise<MemoryRecord[]>;
  forget(sessionId: string): Promise<void>;
}
```

- 实现：`SqliteDirectStore`（默认）与 `MemoryCoreStore`（sidecar），同接口同 schema。
- schema v1 冻结：只加列/加表，禁止改名/删列。

## 3. SearchProvider

```ts
interface SearchProvider {
  id: 'bocha' | 'anysearch' | 'tavily' | 'browser';
  search(query: string, opts?: SearchOptions): Promise<SearchProviderResult>;
}
```

## 4. Skill

```ts
interface ExecutableSkill {
  name: string;
  version: string;
  triggers: string[];
  execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput>;
}
```

Skill 不得依赖具体 LLM client 或 gateway，能力通过 `SkillDeps` 注入。

## 5. Gateway REST API

| 方法 | 路径 | 请求要点 | 成功响应要点 |
|------|------|---------|-------------|
| POST | `/api/ask` | `query`、可选 `userId/modelId/attachments` | 四字段契约 + mode/submode |
| GET | `/api/health` | 无 | `{ ok, service, contract }` |
| GET | `/api/model-providers` | 无 | 模型目录 |
| GET | `/api/files` | 无 | 沙箱白名单内文件列表 |
| GET | `/api/events` | SSE | progress / artifact / files_changed |
| GET | `/api/providers` | 无 | provider 状态与顺序 |
| POST | `/api/providers/default` | `providerId` | 新顺序 |
| POST | `/api/providers/test` | `providerId` | 连通性结果 |
| GET | `/api/skills` | 无 | Skill 元数据 + enabled |
| POST | `/api/skills/sync` | `disabled[]` | 同步结果 |
| GET/POST | `/api/usage/*` | 无 / budget | 用量统计与预算 |
| GET | `/api/memory` | 无 | L1/L2 合并视图 |
| POST | `/api/memory/forget` | `id/type` | 删除结果 |
| GET/POST | `/api/security` | 无 / config | 安全配置 |
| POST | `/api/terminal/exec` | `command` | stdout/stderr/exitCode |
| GET/POST | `/api/routing/*` | cases / mark / export | 路由校准数据 |

错误格式统一为 `{ error: string }`；网关不向客户端泄露内部错误细节。
