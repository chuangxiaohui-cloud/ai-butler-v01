# 推进计划：S3 真实 MCP server 接入

> 日期：2026-08-25 · 分支：v0.2b · 状态：已完成

## 目标

v1.0 S3（E222）MCP 子 Agent 骨架（`src/mcp/`：client/dispatcher/registry/safety）已收口，但
无生产装配点，`available` 全为占位 false。本轮把「真实 MCP server 接入」落地：用本机真实
stdio MCP server（`windows-mcp serve`，Windows 桌面自动化，19 个工具）跑通
`StdioMcpClient → SubAgentDispatcher → 真实 server` 端到端，并装配进 CLI/gateway 问答链路，
为 P-10 验收条件「S3 真实 MCP server」补齐证据。

## 计划

1. 适配层：`SubAgentMeta` 增加真实工具名映射（`toolMap`/`defaultTool`）与 §10 真实工具白名单
   （`allowedTools`，缺省全拒）；`dispatcher`/`safety` 用映射后的真实工具名调用与校验。
2. 配置启用：`configs/mcp-agents.json`（.example）声明已安装 server 的命令与白名单，启动时
   构造 `StdioMcpClient` 并置 `available=true`；未配置保持占位。
3. 装配：CLI（`src/main.ts`）与 gateway（`src/gateway/server.ts`）构造 dispatcher，注入
   `SkillDeps.subAgent`；新增 `mcp-agent` skill（路由规则 operate+system），问答链路可直接
   dispatch。
4. 验证：单测（映射/白名单/调度/路由）+ 集成测试（真实 `windows-mcp serve` 端到端：
   initialize/tools/list/callTool 只读工具 `Process`）；`npm run build` + `npm run test:all` +
   `doc-lint` 0 FAIL 0 WARN。
5. 文档：需求文档登记 E-NN、`docs/code-directory.md`/`docs/directory-structure.md`、当日
   handoff、计划文档收口；提交（三段式）。

## 执行过程

### 改动

1. 适配层：`src/mcp/types.ts` 的 `SubAgentMeta` 增 `toolMap`/`defaultTool`/`allowedTools`
   （§10 真实工具名白名单，缺省全拒）/`defaultArgs`（只读默认），新增
   `resolveRealToolName()`（占位 agent 透传内部名、真实接入剥前缀/映射、白名单外返回 null）；
   `src/mcp/safety.ts` 真实工具名双闸（toolPrefix 前缀 + allowedTools 白名单）与危险参数拦截；
   `src/mcp/dispatcher.ts` 内部名校验 → `resolveRealToolName` 映射 → 真实名调用，无显式参数时
   合并 `defaultArgs`（Process 只读 `{mode:'list',limit:20}`）。
2. 协议修复：`src/mcp/client.ts` 的 `initialize` 补 MCP 规范必填 `clientInfo`（真实 server
   缺字段直接拒请求，真实接入实测发现）；`startTimeoutMs` 支持 per-agent 配置覆盖。
3. 配置启用：新增 `src/mcp/config.ts` 读 `configs/mcp-agents.json`（.example 提交、本地 json
   git 忽略），装配 `StdioMcpClient`；`src/mcp/registry.ts` 增 `windows` 占位
   （category system）+ `applyMcpAgentConfig()`。
4. 装配：`src/main.ts`/`src/gateway/server.ts` 注入 `SkillDeps.subAgent`；新增
   `src/skills/mcp-agent/` skill（显式工具语法 `windows.Process(mode=list,limit=5)`、危险参数
   默认拒绝、未装配诚实提示）；`src/agent/intent-feature.ts` 增 `operate`/`system`
   （`['operate']` 规则置于 `create` 前，防「打开/启动」被抢）；`routing-table.ts` 新增
   R023（operate+system → executor `mcp_agent`）；`executors.ts` 注册 `mcp_agent: available`。
5. 生命周期：`src/main.ts` 的 `.finally()` 主动 `closeMcpAgents()`（stdio pipe 会阻止事件循环
   退出，否则 CLI 挂起）。
6. 文档：需求文档附录 A 登记 E240；`src/skills/README.md`、`docs/code-directory.md`、
   `docs/directory-structure.md`、`AGENTS.md` 同步；新增/调整测试
   （`src/mcp/config.test.ts`、`src/mcp/types.test.ts`、`src/skills/mcp-agent/index.test.ts`、
   `tests/integration/mcp-real-server.test.ts`）。

### 遇到的问题

1. **MCP 规范 `initialize` 必填 `clientInfo`**：windows-mcp（pydantic 严格校验）缺该字段直接
   拒请求，补上后才握手通过——占位骨架阶段从未走真实协议，未暴露此问题。
2. **[P-57]=1s 对 Python 冷启动 stdio server 不够**：实测握手 2-4s，按 agent 配置
   `startTimeoutMs: 10000` 覆盖；P-57 注册值保持定稿（per-agent 覆盖不改变参数值）。
3. **stdio pipe 阻止事件循环退出**：CLI 流程结束后不 close 会挂起，`main.ts` 在 `.finally()`
   主动 `closeMcpAgents()` 解决。

## 结果

- **真实 server 端到端跑通**：本机 `windows-mcp serve`（v3.4.2，19 工具）经
  `StdioMcpClient → SubAgentDispatcher → 真实 server` 链路；
  CLI `npm run dev -- "列出当前进程"` 11.6s 返回真实进程列表。
- **白名单与安全双闸生效**：`allowedTools` 白名单外工具拒调用；`windows.Process(mode=kill)`
  skill 层默认拒绝；自然语言「列出进程」走只读默认 `{mode:list,limit:20}`；返回一律 untrusted。
- **测试全绿**：新增单测 13（resolveRealToolName 5 + config 5 + mcp-agent 4）+ 集成 3 条真实
  server（INT-MCP-001 白名单外拒/白名单内调用、002 skill 全链路、003 危险参数拒）；
  全量单测 813/814（1 skip）+ 集成 18/18；`npm run build` + `npm run test:all` 通过。
- **doc-lint 0 FAIL 0 WARN**；附录 A E240 登记（bench:na(new-param)），affects
  §4.1.2/§6.7/§10/§11.1/§13。
- **提交记录**：主变更 commit（见 handoff 登记）；S3 真实 MCP server 接入收口，
  P-10 验收条件「S3 真实 MCP server」离线可用证据补齐。
