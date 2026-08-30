# 第三方审计材料清单（audit package checklist）

> 用途：第三方开发商快速审阅的交付包「装箱单 + 审阅路线」。
> 关联：`docs/audit-navigation.md`（逻辑分层 → 真实路径映射，四张表）；本文档只回答「交什么、按什么顺序看、跑什么验证、审什么重点」。
> 生成日期：2026-08-30 · 分支 v0.2b · 修订 v2.5（v2：增 AI 生成代码特异性必查项、PARAM 对齐验证、冒烟通过标准、审计方资质自证、结论置信度声明；v2.1：补依赖注入真实性、幽灵 PARAM、故意触发降级用例；v2.2：增 §10 交付前收口·提交前检查清单；v2.3：单测抽样改分层抽样，『可用』判定锚定需求文档正确章节 §4.2/§6.1.3/§6.5/§6.6；v2.4：增 §3.1 架构可视化验证（CodeGraph 辅助 + 人工复核）；v2.5：§5 补 v1 全量验收报告登记与更新机制。

## 0. 使用说明

1. 审阅方先读 §1 入口三件套，再用 `docs/audit-navigation.md` 的「审核快速入口」逐项深入。
2. 审阅前先跑 §6 验证命令，确认基线（build / test:all / doc-lint 全绿）。
3. 交付包应基于一次提交后的 commit/tag，不包含未提交工作区（当前工作区 E275-E284 未提交，见 §8）。
4. 本包含 AI 生成代码特异性审查（§7 必查）——本项目由 Codex + DeepSeek 辅助开发，普通 Web 审计套路会漏判 AI 代码特征，审阅方必须逐项完成。

### 0.1 审计方资质自证（签约前，需全部确认）

- [ ] 提供过往 AI Agent / LLM 应用审计案例（脱敏）
- [ ] 已阅读本项目 v2.5 需求文档（`一人公司AI-Agent需求文档_v2.5.md`）与架构文档（§3）
- [ ] 理解 PARAM 注册表机制（§5 + `src/config/params.ts` + `docs/design/param-registry.md`）
- [ ] 具备 Prompt Injection / SSRF / 命令注入等 AI 安全测试能力（对应 `docs/design/security-model.md` 与需求 §10）

## 1. 入口三件套

| 材料 | 路径 | 用途 |
|------|------|------|
| 项目总览 | `README.md` | 项目定位、常用命令、快速上手 |
| 仓库约定 | `AGENTS.md` | AI Agent 工作约定 + 文档宪法入口 + 目录地图 |
| 第三方审核导航 | `docs/audit-navigation.md` | 逻辑分层 → 真实代码/文档/测试/快速入口四张映射表 |

## 2. 需求与宪法

| 材料 | 路径 | 用途 |
|------|------|------|
| 需求文档 v2.5 | `一人公司AI-Agent需求文档_v2.5.md` | §0 文档宪法、§5 PARAM 注册表（132 项，26 provisional）、§6 管道、附录 A E-NN 变更台账、附录 D 采购台账 |
| 推进计划记录 | `docs/plans/README.md` + `docs/plans/` | 每次改动的「计划 → 执行 → 结果」三段式溯源 |
| 每日交接 | 最新 `docs/YYYY-MM-DD-progress-handoff.md` | 已收口 / 未完成事项、成本与验证状态 |

## 3. 架构与设计

| 组 | 路径 | 审阅要点 |
|----|------|---------|
| 架构层 | `docs/architecture/system-architecture.md`、`module-dataflow.md`、`module-dependencies.md`、`deployment.md`、`interface-contract.md` | 先读 `interface-contract.md`：`answer(query) -> { answer, confidence, evidence[], gate_triggered }` 稳定契约必须与 pipeline / gateway / UI 共用 |
| ADR | `docs/adrs/0001-architecture-foundation.md` | 架构决策依据 |
| 设计层 | `docs/design/search-pipeline.md`、`intent-routing.md`、`memory-system.md`、`security-model.md`、`skill-registry.md`、`param-registry.md`、`ui-interaction.md` | 与需求 §6 / §8 / §10 对应章节对照看 |

### 3.1 架构可视化验证（辅助手段，必做）

- [ ] 用 CodeGraph（或同类工具）生成模块依赖图（仓库已启用 `.codegraph/`，可用 `codegraph explore`）
- [ ] 与 `docs/architecture/module-dependencies.md` 逐项比对（并交叉 `system-architecture.md` / `module-dataflow.md`）
- [ ] 标注差异项：隐式跨层调用 / 未文档化的依赖 / 循环依赖
- [ ] 输出：差异清单 + 截图证据
- 注：CodeGraph 仅作辅助验证手段，**不可替代人工架构审查**——工具生成的图可能遗漏运行时依赖（如动态 import、DI 容器注入），差异项须人工复核后再定论

## 4. 工程与运维

| 材料 | 路径 |
|------|------|
| API 接口 | `docs/engineering/api.md`（正式 OpenAPI 待生成） |
| 数据库 Schema | `docs/engineering/database-schema.md` |
| 环境配置 | `docs/engineering/environment-config.md`（配 `.env.example`，不含密钥） |
| 测试策略 | `docs/engineering/testing-strategy.md` |
| 代码导航 | `docs/code-directory.md`、`docs/directory-structure.md` |

## 5. 验收证据

| 组 | 路径 | 说明 |
|----|------|------|
| 回归基准 | `bench/`（devil-v25 基线、`B-20260828-02` / `B-20260829-01` / `B-20260829-02` 报告） | 122 条魔鬼训练 + 速度探针 |
| 架构复核 | `docs/reports/architecture-review-2026-08-29.md` | 当日复核结论 |
| v1 全量验收 | `docs/reports/v1-acceptance-report-2026-08-26.md`（E246） | P-10 验收**未通过**（条件③ 成熟度 L2+ 未达成），[P-10] 维持 provisional@2026-08-24；审计时如实引用，不得改写结论 |
| E245 交付件（按需） | `docs/reports/security-audit-v1.md`、`privacy-data-processing-v1.md`、`architecture-design-final-v1.md`、`maturity-assessment-v1.md`、`user-manual-v1.md` | 安全 / 隐私 / 架构 / 成熟度 / 用户手册 |
| 运行数据（不入包） | `data/usage.jsonl`、`data/trajectory.jsonl`、`data/audit-command.jsonl` | 只提供 schema 或脱敏样例，含密钥/个人数据不入包 |

> 注（验收报告更新机制）：验收报告是一次验收运行的证据包（计划文档 + 附录 A E-NN + 提交号绑定）；重跑由复验门触发（如 P-10 条件③ 达标后按 E197 复验门），重跑产出**新日期新报告**并更新登记（附录 A 新 E-NN、`docs/documentation-map.md` 四·17 指向、当日 handoff），**不原地改日期覆盖旧结论**——旧结论是历史证据。

### 5.1 PARAM 注册表一致性验证（必做）

自动化已覆盖引用与双射（直接跑，不重复人工）：
- [ ] `npm run doc-lint` C8：PARAM 登记即生效——§5 登记的 key 在 `src` 零引用即 FAIL
- [ ] `tests/integration/params-registry.test.ts`：key↔P-NN 双射、编号唯一、格式合法

人工补验（自动化不覆盖的「值级对齐」与「状态管理」）：
- [ ] 随机抽 10 个 PARAM（provisional / 定稿 各 5 个）
- [ ] 验证代码实际默认值/阈值与 §5 注册表声明一致（对照 `src/config/params.ts` 的 `PARAMS`）
- [ ] 验证 provisional 参数有明确定稿条件或到期时间（§5 状态列；来源/Owner 以附录 A 关联 E-NN 为准）
- [ ] 无悬空 PARAM：注册表有但代码零引用（由 doc-lint C8 自动覆盖，直接跑即可，无需人工）
- [ ] 无幽灵 PARAM：代码硬编码的阈值/常量在注册表未登记（grep 抽查 + 与 §5 对账）
- [ ] 输出：不一致项清单 + 修复建议（此项是该仓库技术债高发区：AI 开发常「改代码忘改 PARAM」或反之）

## 6. 运行验证（本地复现）

```bash
npm run build          # TypeScript 构建到 dist/
npm run test:all       # 单测 + 集成（先 build，因为单测运行 dist/）
npm run doc-lint       # 需求文档全量验收，0 FAIL 0 WARN
npm run gateway        # TurnLoop gateway，默认 http://127.0.0.1:8787
npm run desktop:smoke  # 桌面壳冒烟
npm run search:smoke   # 10 条基准 query 双引擎冒烟（WP4 验收）
npm run classify:smoke # 意图分类冒烟
npm run tavily:smoke   # Tavily 触发冒烟 + 配额监控
npm run bench:devil-v25  # 122 条回归基准（耗时长，按需）
```

- 环境准备：从 `.env.example` 复制并填写 `.env`；`.env`、`data/`、`dist/` 均不提交、不入包。

### 6.1 真实场景冒烟通过标准（每条须满足全部，避免「没崩就算过」）

- [ ] 无报错退出（exit 0，无未处理异常）
- [ ] 响应时间在对应场景 §5 预算内（如 CLI 主链路合成 `[P-116]` 18000ms、Skill 长文 `[P-122]` 90000ms）
- [ ] 输出内容经人工判定「可用」——不仅是格式正确，还要定位/结论/风险等核心信息准确（可对照 `docs/reports/architecture-review-2026-08-29.md` 的判定口径）
  - 注：「可用」判定锚定需求文档——answer 四字段契约（`answer/confidence/evidence/gate_triggered`，§4.2 知识问答 / §6 唯一接口契约）+ §6.5 规则① fact_consistency（证据与结论一致性）+ §6.6 规则② 置信度门控（confidence 与内容匹配）+ §6.1.3 规则③ 关键词兜底（降级可见）；审计方须在报告附录列出每条冒烟用例的「可用/不可用」判定依据（≤50 字/条），不得以自己的主观标准代替需求文档标准
- [ ] Token 消耗在合理范围（对照 `data/usage.jsonl` 既有基线 ±30%，异常骤增需解释）
- [ ] 降级/兜底路径触发时有明确用户提示（`gate_triggered` 非静默失败，见 `answer` 契约与轨迹事件）
- [ ] 至少 1 条用例故意触发降级/兜底路径，验证降级体验（提示明确、不挂死、可回退）

## 7. AI 生成代码特异性审查（必查，普通 Web 审计会漏判）

| 检查项 | 风险 | 方法 |
|--------|------|------|
| 错误处理审查 | AI 惯用到处 try-catch + fallback，错误被静默吞掉、调试极难 | 确认无静默吞错；fallback 路径必须有日志/指标暴露（对照 `data/trajectory.jsonl` 的 stage error 记录与 `synthesisError` 透传） |
| 测试有效性抽查 | AI 测试常「断言代码做了代码做的事」，未验证业务意图 | 按模块分层抽样 20 条单测（fetch / synthesis / memory / security / cli 各 ≥3 条），优先最近 3 次变更（E275-E284）涉及的测试文件，验证含边界值/异常路径/业务语义断言（非同义反复） |
| mock 过度 / 集成盲区 | AI 单测喜欢 mock 掉全部边界，链路在真实环境下才崩 | 按同一分层抽样确认关键链路有集成覆盖（`tests/integration/` 32 条对应哪些链路） |
| 依赖注入真实性 | AI 常用装饰性 DI：mock 注入点从未被真实链路消费 | 抽查 SkillDeps / provider 注入点：单测证明注入点确实被使用（非仅「接口存在」） |
| 抽象合理性（YAGNI） | AI 爱创建仅被调用一次的 interface/factory，增加理解成本 | 确认无「单次使用」的接口/工厂；与 `AGENTS.md`「Simplicity First」纪律对账 |
| 注释一致性 | AI 改代码常忘更新注释，注释成为误导 | 关键模块注释与当前实现一致（非历史残留）；注释是否解释「为什么」而非复述代码（仓库纪律） |

## 8. 已知缺口（诚实声明，审阅前先告知）

| 缺口 | 说明 | 现状 |
|------|------|------|
| 无独立 E2E 套件 | 桌面冒烟 `npm run desktop:smoke` 代替 | 已知 |
| OpenAPI 待生成 | 当前用 `docs/engineering/api.md` | 交付期项 |
| memory-core 外部依赖 | 仓库内仅有客户端 `src/memory/memorycore-store.ts` + 配置 | 外部只读项目 |
| UI 组件未拆分 | `ui/prototype/src/` 未按 layouts/panels/modes 拆 | 已知 |
| 已收口（2026-08-30） | E275-E289 已提交 + 交付快照 tag 0.2b-audit-2026-08-30（收口后打）；交付包基于该 tag，不含未提交工作区 | ✅ |
| 成本观察 | 08-29 单日 DeepSeek 账户 17.65 元归因（主因 Codex 调试会话） | 见 `docs/2026-08-30-progress-handoff.md` |

## 9. 审计报告输出要求（结论置信度声明）

- [ ] 每项审计结论标注置信度：
  - HIGH：有自动化测试 / 静态分析 / 渗透测试证据支撑
  - MEDIUM：有人工代码审查 + 抽样验证支撑
  - LOW：仅基于文档 / 口头确认 / 有限观察
- [ ] 报告中 LOW 置信度项单独列出并注明「需进一步验证」
- [ ] 禁止为「交差」把不确定项写成确定结论（本项目回答链路本身就有 confidence 机制，审计结论口径应与之同构）

## 10. 交付前收口（提交前检查清单，必做）

> 交付/审计前，工作区 E275-E284 必须先收口：全量验证绿 → 按 E 编号分批提交 → 回填提交号 → 打 tag。

### 10.1 工作区盘点
- [ ] `git status --short` 与预期改动清单逐一核对（E275-E284 涉及文件）
- [ ] 非交付文件不入库：`undefined`、`*.xls`、`*.docx`、`*.pdf`、`scoring-results.csv`、`tavily-benchmark.ts` 等临时物（不 `git add`）
- [ ] 根目录独立参考项目不入库：`AI-Butler/`、`deepseek-harness/`、`OpenHands/`、`openocta/`、`opensquilla/`、`openworker/`、`TencentDB-Agent-Memory/`、`v3/`、`crm/`、`benchmarks/`、`agent-skills/`、`Tavily+AnySearch+Bocha/`、`AI-Agent-v2.5*` 及历史需求版本（v1.9-v2.3）
- [ ] `.env` / `data/` / `dist/` / `desktop/release/` 仍被 git 忽略（未被误 add）

### 10.2 全量验证（全绿才可提交）
- [ ] `npm run build` 绿
- [ ] `npm run test:all` 绿（单测 + 集成 32/32，需先 build）
- [ ] `npm run doc-lint` 0 FAIL 0 WARN（含 C8 PARAM 引用、C3 §5 行数预算）
- [ ] 附录 A 各 E-NN 的 bench 联动登记完整（E277-E284 涉及 §5/§6 的项：`bench:na(new-param)` 或 `B-20260829-01/02` 已在案）
- [ ] 各计划文档「结果」节补全（目标单测 x/x + 集成 x/x）

### 10.3 提交纪律
- [ ] 按 E 编号分批提交，每批单一主题、中文、可回滚（参照历史格式「E283：…」）
- [ ] 未请求不 `git push`；提交信息不混入无关改动
- [ ] 提交后把提交号回填到各计划文档与附录 A

### 10.4 交付/审计前置
- [ ] 收口后打 tag（如 v0.2b 快照），审计方以 tag 签收
- [ ] 复核 `.env.example`（脱敏）、`bench/` 证据、报告归档齐备
- [ ] §0.1 审计方资质自证签署件就绪
- [ ] 按 §11 排除清单打包 ZIP

## 11. 打包建议

- 交付包 = 提交后打 tag 的仓库快照（前置：§10 提交前收口已闭环）+ 本清单 + `bench/` 证据 + `.env.example`（脱敏）+ 运行说明（§6 命令）+ 审计方资质自证（§0.1 签署件）。
- 明确排除：`.env`、`data/`、`dist/`、`desktop/release/`、`desktop/resources/`、`desktop/src-tauri/target/`；以及根目录独立参考项目（`AI-Butler/`、`deepseek-harness/`、`OpenHands/` 等，只读不交付）。
- 审计验收单：§0.1 资质自证 + §5.1 PARAM 对齐 + §6.1 冒烟通过 + §7 必查项逐条打勾 + §9 置信度声明，缺一项即验收不通过。