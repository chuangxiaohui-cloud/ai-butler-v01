# 模块依赖关系图

> 权威需求：§13；架构决策：ADR-0001

## 1. 依赖方向

```text
desktop / ui / cli
        │
        ▼
     gateway
        │
        ▼
     pipeline ──► agent（路由）
        │          │
        ├──────────┼──► skills（registry / lifecycle / deps）
        │          │
        ├──────────┼──► memory（store / experience / user-context）
        │          │
        ├──────────┼──► config（params / model-catalog / security）
        │          │
        └──────────┴──► search providers / llm / browser（适配层）
```

## 2. 关键依赖关系

| 依赖方 | 被依赖方 | 用途 | 约束 |
|--------|---------|------|------|
| `gateway` | `pipeline` | 统一问答入口 | 禁止绕过 pipeline |
| `pipeline` | `agent/router-v2` | 意图路由 | 只依赖路由结果，不反向改规则表 |
| `pipeline` | `skills/registry` | Skill 匹配与执行 | 只通过 `ExecutableSkill` + `SkillDeps` |
| `pipeline` | `memory/store` | L0 读写 | 只依赖 `MemoryStore` 接口 |
| `pipeline` | `search/providers` | 搜索 | 只依赖 `SearchProvider` |
| `pipeline` | `config/params` | 参数 | 禁止在业务代码里写裸参数 |
| `skills` | `search/llm` | LLM 能力 | 通过 `SkillDeps` 注入，不直接构造 client |
| `agent` | `config/params` | 路由阈值 | 参数只读 |

## 3. 禁止项

- UI 禁止直接调用搜索 provider 或构造自己的问答链路。
- `skills/*` 禁止反向依赖 `pipeline` 或 `gateway`。
- `memory/*store` 禁止依赖具体 Skill 实现。
- `search/providers` 禁止依赖融合层细节。
- 任何模块禁止形成 import 环；新增跨模块引用时先更新本图。

## 4. 循环依赖检查

- TypeScript 编译（`npm run build`）作为第一道环检查。
- 集成测试 `tests/integration/routing-enum-consistency.test.ts` 等覆盖跨模块枚举一致性。
- 新增 import 出现双向引用时，抽公共类型或依赖注入接口，不在本图外“快速接线”。
