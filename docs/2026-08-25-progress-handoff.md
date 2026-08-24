# 进度交接 2026-08-25（v0.2b 续作）

> 当前分支：`v0.2b`｜E240（S3 真实 MCP server 接入）已提交。
> 上一份交接见 `docs/2026-08-24-progress-handoff.md`。

## 今日已收口

1. **S3 真实 MCP server 接入（E240）**：E222 骨架（无生产装配点、available 全占位）推进真实
   接入，用本机真实 stdio MCP server（`windows-mcp serve`，v3.4.2，19 工具，含
   Process/PowerShell/FileSystem 等高危项）跑通 `StdioMcpClient → SubAgentDispatcher →
   真实 server` 端到端并装配进 CLI/gateway 问答链路——
   - **适配层**：`SubAgentMeta` 增 `toolMap`/`defaultTool`/`allowedTools`（§10 真实工具名
     白名单，缺省全拒）/`defaultArgs`（只读默认）与 `resolveRealToolName()`（占位透传内部名、
     真实接入剥前缀/映射、白名单外 null）；`dispatcher`/`safety` 按真实工具名校验与调用。
   - **协议修复**：`StdioMcpClient.initialize` 补 MCP 规范必填 `clientInfo`（windows-mcp 用
     pydantic 严格校验，缺字段直接拒请求——真实接入实测发现）；`startTimeoutMs` per-agent
     配置覆盖（[P-57]=1s 对 Python 冷启动 server 不够，实测握手 2-4s，P-57 值保持定稿）。
   - **配置启用**：新增 `src/mcp/config.ts`，读 `configs/mcp-agents.json`（.example 提交、
     本地 json git 忽略）；`registry` 增 `windows` 占位 + `applyMcpAgentConfig()`。
   - **装配**：`src/main.ts`/`src/gateway/server.ts` 注入 `SkillDeps.subAgent`；新增 `mcp-agent`
     skill（R023 operate+system 路由、intent-feature 增 operate/system、executor 注册）；
     CLI 流程结束主动 close 子进程（stdio pipe 会阻止事件循环退出）。
   - **§10 双闸**：工具名白名单 + 危险参数默认拒绝（`windows.Process(mode=kill)` skill 层
     拦截）、自然语言「列出进程」走只读默认 `{mode:list,limit:20}`、返回一律 untrusted。
   - **证据**：新增单测 13（resolveRealToolName 5 + config 5 + mcp-agent 4 含既有调整）+ 集成
     3 条真实 server（INT-MCP-001 白名单外拒/白名单内调用、002 skill 全链路、003 危险参数拒）；
     全量单测 813/814（1 skip）+ 集成 18/18；CLI 端到端 `npm run dev -- "列出当前进程"`
     11.6s 返回真实进程列表；doc-lint 0 FAIL 0 WARN。附录 A E240 登记（bench:na(new-param)，
     affects §4.1.2/§6.7/§10/§11.1/§13）。计划文档
     `docs/plans/2026-08-25-s3-real-mcp-server.md` 已收口。

## 明日继续（按优先级）

1. **S5 平台适配器 / S6 真实推送 / S7 可执行 handler**：真实协议接入按 E240 同款流程推进
   （先计划文档 → 执行 → 结果），S3-S7 全收口后按 P-10 验收条件集跑 v1.0 全量验收。
2. **Tavily 9 月复核（备忘）**：9 月重置后跑 `npm run tavily:smoke`，确认远端 `/usage` 归零、
   本地计数重建，核对 [P-64] 计费口径（news/advanced 多倍计费）；E237 残留兜底
   （ET20+ET14、SM02、SM31）届时一并复核。
3. **交付期文档**：v1.0 全量验收 [P-10] 需安全审计/隐私说明/用户手册（documentation-map
   第四组），可在真实协议接入并行推进。
4. **附录 A 行数预算**：当前 536/950 余量充足；后续按需 retention 压缩。

## 总进度快照（2026-08-25，双口径）

**① 里程碑推进口径 ≈ 92%**（§4.4 里程碑表）
- 阶段0/v0.1/v0.2a/v0.2b 四里程碑已验收收口（E206 为 v0.2b 验收）；v1.0 切片 S1-S8 全部落地
  （E220-E227），其中 S3 真实 MCP server 本轮收口（E240）。
- 剩余 ≈8%：S5 平台适配器、S6 真实推送、S7 可执行 handler 真实协议接入 + v1.0 全量验收
  [P-10]（E234）+ 交付期文档（安全审计/隐私说明/用户手册等，documentation-map 第四组）。

**② 能力成熟度口径 ≈ 35-40%**（§12.4）
- 当前 L1→L2 过渡：预置 Skill 全集可用（L1 达标）；L2 判据（用户累积 Skill 50+、验收通过率
  80%+、复用率 60%+）需真实使用累积，未达成。
- 成熟度按客观指标自评估，不以开发进度堆砌（v1.0 全量验收 ≈ L2+）。

**口径依据**：§4.4 里程碑表（阶段0/v0.1/v0.2a/v0.2b/v1.0）、§12.4 成熟度等级、
E206/E220-E227/E234/E235/E240。
