# 推进计划：GitHub 解读质量修复（confidence/evidence/截断/计时）

> 日期：2026-08-29 · 分支：v0.2b · 状态：已完成（含真实复测后三轮补强）

## 目标

上一轮 P1-P3 让 github-reader 走主链路并输出结构化 Markdown，但复测暴露 4 个新问题：confidence 0.495 与权威报告语气不匹配、61.5s 稳定慢、答案被截断、顶层 evidence 为空。本轮按用户优先级修复 P0-P3。

## 计划

1. pipeline direct skill 分支：采用 skill 自身 confidence，透传 `result.evidence` 为顶层 `Evidence[]`，confidence ≤ 0.6 时答案开头注入醒目声明 → 验证：pipeline 单测
2. github-reader：LLM 调用开启 `rejectOnTruncate`，截断时按 3200 tokens 重试一次，仍失败落 `buildPlainAnswer` 兜底 → 验证：github-reader 单测
3. github-reader：按核心维度完整度计算 confidence（每缺一个「未获取」扣 0.1），低置信/字段缺失时 prompt 禁用断言式措辞 → 验证：github-reader 单测
4. github-reader：`performance.now()` 埋点 `totalMs/fetchMs/synthesisMs`，pipeline 写入 trajectory skill 事件 → 验证：build + 单测
5. 文档：计划 + progress-handoff → 验证：doc-lint

**验收标准**

- build 绿
- pipeline / github-reader / github-project 相关单测绿
- doc-lint 0 FAIL 0 WARN
- 不跑 bench / 全量 e2e（成本纪律）

## 执行过程

### 改动

- `src/search/pipeline.ts`：direct skill 分支改用 `output.confidence`；新增 `normalizeSkillEvidence` / `buildLowConfidenceWarning` / `readSkillTiming`；低置信警告注入答案开头；evidence 透传；轨迹记录计时。
- `src/skills/github-reader/index.ts`：LLM `complete` 加 `rejectOnTruncate`，截断重试 3200；`computeConfidence` 按字段完整度；`REVIEW_PROTOCOL_SYSTEM` 增加低置信限定词约束；result 增加 `timing`。
- `src/trajectory/trajectory-log.ts`：`TrajectorySkill` 增 `durationMs/fetchMs/synthesisMs`。
- 测试：pipeline +2（evidence 透传/低置信警告）、github-reader +2（截断重试/连续截断兜底）并补 timing/confidence 断言；market github-project 复跑绿。

### 遇到的问题

- pipeline 成功路径首测 confidence 0.75：mock `package.json` 空依赖导致 manifest 未入 evidence，改非空依赖后恢复 0.85。

## 结果

- 验证：`npm run build` 绿；pipeline 52/52、github-reader 18/18、github-project 4/4；doc-lint 0 FAIL 0 WARN。
- 测试：目标单测文件全绿；集成与全量 `test:all` 未跑（按成本纪律不代跑）。
- 提交：未提交（用户要求先不提交）。
- 遗留事项：真实 `npm run dev` e2e 复测待用户手动跑，确认耗时拆分与截断不再出现；若 `synthesisMs` 占大头再评估模板渲染替代 LLM。

## 二轮：真实复测后的 P0/P1 补强

### 轨迹实证

用户复测 `npm run dev -- "https://github.com/openclaw/openclaw 这项目是做什么用的？"`：`elapsed_ms=184.7s`，答案退回 L1 键值对，输出 JSON 无计时字段。查 `data/trajectory.jsonl` 第 3824 行：`durationMs=177.7s`、`fetchMs=59.6s`、`synthesisMs=0` —— 格式退化不是 confidence 分支切换，而是 LLM 合成失败落到 `buildPlainAnswer` 兜底。

### 根因

- `synthesisMs=0` 是埋点缺陷：`synthesisMs` 只在 LLM 成功后赋值，失败时长与错误都被吞掉。
- 上一轮加的「截断重试」是 184s 的放大器：github-reader 走 `createSkillHeavyClient`（P-122 单次 90s），首调 `finish_reason=length` 后重试会再吃一个 90s 预算，实测 177.7 - 59.6 ≈ 118s 与「首调截断 + 90s 重试超时」吻合。

### 二轮改动

- `AnswerResult` 新增可选 `timing: { totalMs, fetchMs, synthesisMs, synthesisError }`，direct skill 分支透传到 CLI/gateway 输出 JSON。
- github-reader：`synthesisMs` 在成功与失败路径都记录；失败原因写入 `timing.synthesisError`。
- github-reader：截断策略改为单次 `maxTokens: 3200` + `rejectOnTruncate: true`，截断/失败直接落结构化兜底，不再二次烧 P-122 的 90s 预算。
- github-reader：GitHub API 元数据四请求（repo/contributors/commits/releases）与五类 manifest 探测改为并行，抓取耗时从「求和」降为「最大项」。
- pipeline 低置信声明补充测试：声明是叠加层，原始报告内容必须保留。

### 二轮结果

- 验证：`npm run build` 绿；pipeline 52/52、github-reader 17/17、github-project 4/4；doc-lint 0 FAIL 0 WARN。
- 实测归因：`fetchMs=59.6s` 已是独立瓶颈，下一步可并行化 GitHub API / manifest 探测或加缓存；LLM 失败不再重试后，最坏耗时应收敛到 `fetch + 90s` 内，且错误会显式出现在 `timing.synthesisError`。

## 三轮：真实复测 429 归因 + Markdown 模板兜底

### 轨迹实证

用户再次复测同一 query：`elapsed_ms=115.2s`，输出 JSON 已带 `timing`：`totalMs=106.7s`、`fetchMs=46.5s`、`synthesisMs=60.2s`、`synthesisError="LLM HTTP 429: {"error":{"code":"1113","message":"余额不足或无可用资源包,请充值。"}}"`。答案仍是 L1 键值对结构。

### 根因

- 格式退化确认与 confidence 分支无关：LLM 合成调用失败（heavy provider 429「余额不足/无可用资源包」）后落到 `buildPlainAnswer` 兜底，所以每次输出都是结构化键值对。
- `fetchMs≈46.5s` 仍偏高，主要嫌疑是 README/manifest 分支候选串行 404 试探与 raw 网络延迟。

### 三轮改动

- github-reader：`BRANCH_CANDIDATES` 改为 `['HEAD', 'main', 'master']`，HEAD 直连默认分支，减少串行 404 试探。
- github-reader：兜底从 `buildPlainAnswer` 升级为 `buildMarkdownAnswer`，固定输出 `# <repo> 项目解读` + `## 定位/架构/技术栈/使用/适用场景/健康分/风险/来源` 模板，即使无 LLM 或额度不足，答案也是可读 Markdown 报告而不是键值对。
- 测试同步更新：断言兜底输出包含 Markdown 章节结构与「L1 结构化解读」。

### 三轮结果

- 验证：`npm run build` 绿；pipeline 52/52、github-reader 17/17、github-project 4/4；doc-lint 0 FAIL 0 WARN。
- 结论：计时与失败归因已闭环，`synthesisError=429` 是余额/资源包问题而非代码 bug；用户恢复 heavy provider 额度后复测即可看到 `synthesisError` 为空且 answer 恢复 Markdown/LLM 报告。
- 残余：`fetchMs≈46.5s` 仍偏高，后续可加 GitHub raw/API 结果缓存或进一步确认网络链路；在额度恢复前不要重复烧真实 e2e。

## 五轮：maxTokens 4096/8192 + 截断单次重试

### 轨迹实证

用户复测 deepseek-harness：`synthesisError="LLM 输出达到 max_tokens 上限被截断"`，`fetchMs=3.3s`、`synthesisMs=47.1s`。usage.jsonl 对应记录 `provider=deepseek, model=deepseek-v4-pro, promptTokens=1851, completionTokens=3199`——DeepSeek 已成功生成 3199 tokens，撞到 github-reader 硬编码的 3200 上限；prompt 仅 1851 tokens，不是 prompt 过长。

### 根因

github-reader 硬编码 `maxTokens: 3200` + `rejectOnTruncate: true`；v4-pro 长报告超过 3200 tokens 时抛 `LLMLengthTruncatedError`，且 FallbackLLMClient 对截断直接上抛（E274），github-reader 随即落模板兜底，47s 的有效生成被丢弃。

### 五轮改动

- github-reader：首轮 `maxTokens` 3200 → 4096；捕获 `LLMLengthTruncatedError` 后单次升到 8192 重试，仍截断/失败才落结构化兜底，不无限重试。
- 测试：原「单次调用落兜底」改为「连续截断时 4096→8192 重试后落兜底」，新增「首次截断后 8192 重试成功直接返回 LLM 报告」。
- P2 结论：`promptTokens=1851`，README/契约注入长度正常，不需要额外压缩。

### 五轮结果

- 验证：`npm run build` 绿；github-reader 18/18；doc-lint 0 FAIL 0 WARN。
- 残余：v4-pro 长报告生成仍需几十秒，`synthesisMs` 不会降到 10-15s；验收以 `synthesisError` 消失 + answer 为 LLM 报告为准。
