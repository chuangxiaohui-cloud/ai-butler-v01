# 推进计划：GitHub 解读 CLI 路由与输出修复（P1-P3）

> 日期：2026-08-29 · 分支：v0.2b · 状态：已完成

## 目标

修复 `npm run dev -- "<GitHub 链接> 这项目是做什么用的？"` 的三处问题：市场 Skill 触发词截走 `github_analysis`、market github-project 输出嵌套 JSON、README fenced code block 污染 usage。

## 计划

1. `src/search/pipeline.ts`：市场 Skill 自然语言路由排除 `github_analysis`（与 `deep_report` 同策略）→ 验证：新增 pipeline 单测
2. `scripts/market-github-project.ts` + `src/skills/market/nl-router.ts`：市场通道输出收敛为可读 answer，render 剥离 npm 横幅 → 验证：nl-router 单测
3. `src/skills/github-reader/index.ts`：`sectionContent` 跳过 fenced code block 行 → 验证：github-reader 单测
4. 计划与交接文档同步 → 验证：doc-lint

**验收标准**

- `npm run build` 绿
- pipeline 单测：`github_analysis` 不被市场 Skill 截走，市场 runner 不被调用
- nl-router 单测：github-project stdout 收敛为可读文本且无 npm 横幅
- github-reader 单测：usage 不含 ` ``` `/` `bash`
- `npm run doc-lint` 0 FAIL 0 WARN

## 执行过程

### 改动

- `src/search/pipeline.ts`：市场 Skill 拦截条件追加 `routeSelected.intent !== 'github_analysis'`。
- `src/search/pipeline.test.ts`：新增 github_analysis 不被市场 Skill 截走测试（mock fetch + LLM 合成）。
- `scripts/market-github-project.ts`：成功时输出 `result.answer` 可读文本，失败保留 JSON。
- `src/skills/market/nl-router.ts`：`renderMarketSkillAnswer` 剥离 npm 横幅行。
- `src/skills/market/nl-router.test.ts`：新增横幅剥离 + 输出收敛测试。
- `src/skills/github-reader/index.ts`：`sectionContent` 跳过 ```/~~~ fence 行。
- `src/skills/github-reader/index.test.ts`：新增 fenced code block 不进 usage 测试。
- `docs/2026-08-29-progress-handoff.md`：追加本项小节。

### 遇到的问题

- 无。

## 结果

- 验证：`npm run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN（C8 64 key）。
- 测试：pipeline 50/50（新增 github_analysis 不被市场 Skill 截走 1 条）；nl-router 9/9（新增横幅剥离 1 条）；github-reader 16/16（新增 fenced code block 1 条）。
- 提交：未提交（用户约束：不主动 git commit）
- 遗留事项：无
