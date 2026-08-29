# 推进计划：合成流式输出（P0 onToken）+ GitHub 解读限长（P1 max_tokens 4096）
> 日期：2026-08-29 · 分支：v0.2b · 状态：已完成 · 用户拍板「P0 + P1 一起上」
## 背景
用户复测 github-reader（GitHub 解读）链路：LLM 合成成功（13 章节报告、confidence 声明、evidence 透传、无截断），但 `synthesisMs=131s`、`totalMs=141s`。用户给出 P0-P3 优化方向，拍板先做：
- **P0 流式输出（streaming）**：让 CLI「立刻开始打字」，体感延迟从 2 分钟降到几秒；总耗时不变。
- **P1 控制输出长度**：`max_tokens 8192→4096` + prompt 限 2000 字，从源头压生成量——这才是 131s 的真药。
## 计划
1. `llm-client.ts`：`CompleteOptions.onToken`；设了它走 `stream: true`，SSE 逐块回调（抑制 `<think>` 推理块，与 `stripThinkBlock` 同一语义），仍返回全量文本；`finish_reason=length` 截断检测与 usage 记账（`stream_options.include_usage`）保留 → 验证：llm-client 单测
2. `s5_synthesize.ts` / `pipeline.ts`：`onToken` 透传；pipeline 对 skill 运行包一层带 token 的 LLM 客户端（`withStreamingToken`）→ 验证：s5 / pipeline 单测
3. `main.ts`：CLI 把合成增量写 `process.stderr`，stdout 仍输出最终 JSON（`answer(query)` 契约不变）→ 验证：build
4. `github-reader`：`SYNTH_MAX_TOKENS_RETRY 8192→4096`（与首轮同预算重试），system prompt 加「报告控制在 2000 字以内，重点突出定位、技术栈、风险三项」→ 验证：github-reader 单测
5. 文档：计划 + progress-handoff → 验证：doc-lint
## 执行
改动文件：
- `src/search/llm-client.ts`：`CompleteOptions.onToken`、`body.stream/stream_options`、`consumeStream()`（SSE 解析 + think 抑制 + 截断 + 记账）、`makeVisibleDeltaEmitter()`。
- `src/search/stages/s5_synthesize.ts`：`SynthesizeOptions.onToken`，首轮与重试 `complete` 均透传。
- `src/search/pipeline.ts`：`PipelineOptions.onToken`；s5 调用透传；`withStreamingToken()` 注入 skill 运行（skill 长文生成同样可渐进展示）。
- `src/main.ts`：`onToken: (delta) => process.stderr.write(delta)`。
- `src/skills/github-reader/index.ts`：`SYNTH_MAX_TOKENS_RETRY 8192→4096`；system prompt 追加 2000 字篇幅约束。
- 测试：`llm-client.test.ts` 新增流式 3 例（think 抑制增量/截断抛错/请求体带 stream 参数）、`s5_synthesize.test.ts` 新增 onToken 透传 1 例、`github-reader/index.test.ts` 截断重试断言 8192→4096。
## 结果
- `npm run build` 绿；相关单测 123/123 绿（llm-client / s5 / github-reader / pipeline / llm-registry / llm）；全量单测 1110 通过、1 跳过、0 失败；doc-lint 0 FAIL 0 WARN。
- **说明 1（streaming 不改总耗时）**：流式只改善体感，131s 的真正削减靠 P1。deepseek-v4 系列先出 `<think>` 推理块，增量已在客户端抑制，用户不会看到推理过程。
- **说明 2（usage 记账）**：流式请求带 `stream_options.include_usage`，末块 usage 照常进 `data/usage.jsonl`；若某 provider 拒绝该字段会作为 provider 错误走 fallback 链（DeepSeek 官方支持，主链不受影响）。
- **说明 3（P1 取舍）**：`8192→4096` 后重试与首轮同预算；配合 2000 字约束，正常报告应远低于 4096；若模型不守约束导致仍截断，落到结构化 Markdown 兜底（已有可读模板），不再给第二次长文机会——这是「强制精简」的预期代价。
- **说明 4（契约不变）**：CLI stdout 仍是最终 JSON，增量走 stderr；gateway/UI 未改动，后续如需 UI 打字机效果可在 artifact-bus 增加 token 事件。
- **提交**：未提交（工作区含 E275-E281 大量未提交改动，提交前需 doc-lint + test:all 全绿）。
