# TrajectoryLog（统一轨迹日志）

对齐 DeepSeek Harness 的 append-only 事件流设计：一次问答从路由到最终答案的
关键步骤都追加进同一条 JSONL，供调试、回放和评估复用。

## 落盘

默认写入 `data/trajectory.jsonl`（已被 `.gitignore` 排除），每行一条事件：

```json
{"id":"...","timestamp":1720000000000,"type":"route","sessionId":"...","route":{"decisionType":"direct","primaryLens":"secretary","intent":"web_search","confidence":0.9,"matchedRules":["R008"]}}
```

## 事件类型

| type | 内容 |
|------|------|
| `route` | 路由决策、主镜片、意图、置信度、命中规则 |
| `skill` | 直接执行或上下文注入的技能名、版本、输出片段 |
| `search` | 实际搜索 query、结果数、AI Answer 数、降级与耗时 |
| `synthesize` | 合成来源（llm/fallback）、证据条数 |
| `answer` | 最终答案片段、置信度、门控、总耗时 |

## 为什么用它

之前的路由 case、search metrics、记忆分别落不同文件，问题定位时要来回拼。
轨迹日志把模型“看到了什么、系统怎么判、最终答了什么”放到同一时间轴上：

- 调试：按 `sessionId` 过滤即可复现一次完整决策链路。
- 评估：可以把同一 query 的多次轨迹按 route/search/synthesize 对比。
- 回放：事件顺序即执行顺序，后续可基于它做分叉和再处理。
