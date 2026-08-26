# AGENTS.md

本文件是 AI Agent 在本仓库工作时的入口约定；人类开发入口见 `README.md`。与本文件冲突时，以 `一人公司AI-Agent需求文档_v2.5.md` 的 §0 文档宪法为准。

## 项目定位

一人公司 AI-Agent（AI-Butler）是面向嵌入式电子工程师的桌面助手，目标是五角色合一（秘书 / 老板 / 产品经理 / 项目经理 / 系统架构师）与三种工作模式（知识问答 / 项目协作 / 生活助手）。

- 技术栈：Tauri/Electron + Node.js/TypeScript + React，无 Docker。
- 当前主线：`v0.2b`（记忆蒸馏与治理已收口，后续迭代继续在 `v0.2b` 上进行）。
- 权威需求：`一人公司AI-Agent需求文档_v2.5.md`（tag `v2.5` 为 lint 基准）。
- 稳定契约：`answer(query) -> { answer, confidence, evidence[], gate_triggered }`。CLI、gateway、UI 必须共用同一 `pipeline`，禁止另起一套问答链路。

## 开工前先读

1. 先按推导链读全貌：`一人公司AI-Agent需求文档_v2.5.md` → `docs/adrs/README.md` + `docs/adrs/0001-architecture-foundation.md` → `docs/documentation-map.md` → `docs/code-directory.md` → `docs/directory-structure.md` → 本文件；第三方审核导航见 `docs/audit-navigation.md`。
2. 最新一份 `docs/YYYY-MM-DD-progress-handoff.md`，了解已收口与未完成事项。
3. `docs/plans/README.md` 与 `docs/plans/_template.md`，所有推进遵守“计划 → 执行 → 结果”三段式。
4. `docs/borrowed-designs.md`，外部设计只参考、不借底座；借入后必须在此登记并补测试。
5. 需求文档对应章节：开发从 §0 → §4.4 → §6 → §13 → §10；数值一律查 §5 的 `[P-NN]`，不背裸数值。
6. 仓库已启用 CodeGraph（`.codegraph/`）：定位代码优先用 `codegraph explore "<符号或问题>"` 或 `codegraph node <符号/文件>`；没有索引或输出不足时再用 `rg`。

## 常用命令

```bash
npm run dev -- "问题"              # CLI 问答，stdout 为结构化 JSON
npm run build                      # TypeScript 构建到 dist/
npm run test:all                   # 单测 + 集成；先 npm run build，因为单测运行 dist/
npm run gateway                    # TurnLoop gateway，默认 http://127.0.0.1:8787
npm run desktop                    # Electron 桌面壳
npm run desktop:smoke              # 桌面壳冒烟

npm run bench:devil-v25            # 当前主要回归基准（122 条魔鬼训练）
npm run baseline:devil-v25         # 导出新基线 CSV + 摘要
npm run compare:devil-v25          # 新老基线对比
npm run datasheet -- "<商品页URL>" <型号>   # 下载并校验官方 datasheet
npm run search:smoke              # 10 条基准 query 双引擎冒烟（WP4 验收）
npm run classify:smoke            # Stage 2 意图分类冒烟（[P-04] 复验）
npm run tavily:smoke              # Tavily 触发冒烟 + 月度配额监控（E195）

npm run route:cases                # 查看路由 case
npm run route:feedback             # 提交 accept/reject 反馈
npm run route:calibrate            # 基于样本生成校准提案
npm run browser:status             # 浏览器会话状态
npm run browser:launch -- qq       # 启动/复用 QQ 浏览器调试端口
npm run browser:fetch -- "<URL>" <等待ms>

npm exec tsx scripts/doc-lint.ts   # 需求文档全量验收（唯一验收口径）
```

`doc-lint` 默认验收 `一人公司AI-Agent需求文档_v2.5.md`，要求 `0 FAIL 0 WARN`。`--migration` 仅用于迁移期，正常开发不要依赖宽限。

## 文档宪法与变更纪律

- §0 是文档宪法，八项检查由 `scripts/doc-lint.ts` 执法：数值扫描、废弃格式、行数预算、引用解析、bench 联动、共变、provisional 超期、PARAM 代码引用。
- 所有量化参数登记在 §5 的 `[P-NN]` 注册表，代码侧同步维护 `src/config/params.ts` 的 `PARAMS` 与 `PARAM_IDS`。文档正文禁止裸数值；代码注释引用 `P-NN`。
- 改动需求文档必须在提交前跑全量 `doc-lint`；凡涉及 §5/§6 的变更，必须同时改文档、跑基准并登记附录 A 的 `E-NN` 与 `bench:B-<yyyymmdd>-NN`。
- 新术语 / 废弃术语必须完成“旧处 tombstone → 附录 E 定义 → 附录 A 登记”三件套。
- 行为或参数变更先写 `docs/plans/YYYY-MM-DD-<主题>.md`，完成后补结果，并在当天 `progress-handoff.md` 加链接。
- 从外部项目借入任何设计，必须写入 `docs/borrowed-designs.md`，并落地为 Skill / 接口 / 测试后才算完成。
- 架构决策记入 `docs/adrs/`；文档状态维护 `docs/documentation-map.md`；目录或接口变化同步更新 `docs/code-directory.md` 与 `docs/directory-structure.md`，新增模块时同步本文件目录地图。

## 代码与测试约定

- TypeScript 使用 ESM + NodeNext，源码内相对导入必须带 `.js` 后缀。
- 单测与源码同目录，命名 `*.test.ts`，使用 `node:test` + `node:assert/strict`；集成测试放 `tests/integration/**/*.test.ts`。
- 改动涉及行为时，先补或更新测试，再跑 `npm run build` + `npm run test:all`；结果在计划文档里记录“单测 x/x + 集成 x/x”。
- 新增 Skill 需要同时维护 `src/skills/registry.ts`、生命周期元数据、`src/skills/README.md` 以及对应测试。
- 保持既有依赖边界：核心依赖只有 `better-sqlite3`、`express`、`playwright-core` 等；新框架或新外部依赖必须先说明理由，不直接引入。
- 代码注释与提交信息使用中文，标识符使用英文；注释只解释“为什么”，不重复代码本身。

## 目录地图

> 详细职责、接口契约与数据流见 `docs/directory-structure.md`。

| 路径 | 说明 |
|------|------|
| `src/search/` | Stage 1-6 搜索问答管道、搜索 provider、融合、兜底链 |
| `src/agent/` | 三层意图路由、路由表、校准、模式映射、多模态预处理 |
| `src/skills/` | Skill 注册、生命周期与预置 Skill |
| `src/maturity/` | 成熟度观测（L0-L3 判定、五维指标、`maturity:check`，v1.0 P-10 条件③，E247） |
| `src/memory/` | MemoryStore、ExperienceManager、用户上下文、蒸馏 |
| `src/repo/` | 代码托管联动（仓库白名单/预检门禁/commit+push/审计 + repo:push/repo:whitelist/repo:audit 真实 CLI，v1.0 S6，§11.4） |
| `src/slash/` | 斜杠命令层（/compact、/context，E193 手动入口） |
| `src/im/` | 远程对话通道（授权开关/会话隔离/输出适配/复用 pipeline + OneBot 11 真实适配器，v1.0 S5，§4.5，E224+E241） |
| `src/gateway/` | 单一共享 TurnLoop Express gateway 与 API、限速/并发闸门（P16） |
| `src/mcp/` | MCP 子 Agent 注册/stdio 客户端/调度器/工具白名单与真实 server 配置装配（S3） |
| `src/browser/` | 浏览器会话、CDP 持久化、页面抓取 |
| `src/config/` | PARAM、Provider Registry、模型目录、安全/用量/Skill 配置 |
| `src/trajectory/` | append-only 轨迹日志（落盘 `data/trajectory.jsonl`） |
| `src/log/` | JSONL 追加/轮转/缓存读（P15，trajectory/usage/metrics 共用） |
| `scripts/` | 基准、评分、验收、路由校准、浏览器、PDF/OCR 等工具脚本 |
| `bench/` | 基准数据与报告（git 跟踪） |
| `docs/` | 文档资产总账、每日交接、推进计划、ADR、架构/设计/工程文档 |
| `configs/` | MemoryCore sidecar 等本地运行配置 |
| `ui/prototype/` | 独立 Vite + React 三栏 UI 原型 |
| `desktop/` | Electron 壳与 Tauri 壳（`desktop/src-tauri/`） |
| `data/` | 运行时 SQLite、JSONL、缓存（git 忽略，不提交） |

## 数据、安全与 Git

- 从 `.env.example` 复制并填写 `.env`；`.env`、`data/`、`dist/`、`desktop/release/`、`desktop/resources/`、`desktop/src-tauri/target/` 均不提交。
- `bench/` 是验收证据，git 跟踪；机器轨迹与搜索指标进 `data/`，不提交。
- 浏览器 CDP 端口、登录态、OCR 缓存等运行时状态都在 `data/`，不要提交，也不要在代码里写死。
- 当前默认分支 `v0.2b`，版本锚点 tag 有 `v0.1` / `v0.2a` / `v0.2b` / `v2.4` / `v2.5`。
- 提交前先跑 `doc-lint` 与 `npm run test:all`；提交信息保持单一主题、中文、可回滚。
- 双端同步使用 `npm run push:hosts -- --dry-run` 预览，确认后加 `--yes`；脚本会强制先跑测试和构建，token 只从环境读取。
- 根目录下的 `AI-Butler/`、`agent-skills/`、`deepseek-harness/`、`OpenHands/`、`openocta/`、`opensquilla/`、`openworker/`、`TencentDB-Agent-Memory/`、`v3/`、`crm/`、`benchmarks/`、`Tavily+AnySearch+Bocha/` 是独立项目或参考材料，不是本仓库源码：只读、不修改、不直接依赖其内部 API。
