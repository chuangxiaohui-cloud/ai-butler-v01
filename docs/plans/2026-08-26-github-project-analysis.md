# 推进计划：GitHub 项目解读 Skill 升级（X.6 结构化解读 + LLM 合成）

> 日期：2026-08-26 · 分支：v0.2b · 状态：计划中

## 目标

把 `github-reader` Skill 从「仅抓 README 前 1200 字符」升级为 v2.5 要求的完整 GitHub 项目解读：
L1 结构化数据（GitHub API 元数据 + raw README/manifest + Release/提交/贡献者）→ X.6 契约 →
LLM 按《专业审阅协议 §一》顺序合成，带「README 级判断」诚实标注与可点来源（evidence[]）。

## 背景与差距

- 需求锚点：§3.2 知识咨询（L307）、§4.4 MVP 切片预置 Skill（L466）、§6.1.2 意图表
  `github_analysis`「优先走 GitHub API，搜索做补充」（L706/L719）、§12.2 初始预置 Skill
  （L1462）、§12.5.1 重模型深度报告（L1543）。
- 现状：路由/执行器/模型分档已就绪（`routing-table.ts` L278 → `github_analysis`、
  `executors.ts` `github_reader: available`、`model-router.ts` `github_analysis=heavy`），
  缺口只在 Skill 本体——`src/skills/github-reader/index.ts` 仅抓 README（raw/HEAD，1200
  字符），无 API 元数据、manifest、健康分、evidence、LLM 合成，且是 LegacySkillDef（拿不到
  `deps.complete`）。
- 可借鉴：POC-C 原型 `M:\20260804\poc-c\server\pocc_server.py` 的 `run_deep_github_analyze`
  （b11，28/28 测试通过，真实冒烟 andrewyng/openworker 健康分 82）——契约与降级链已验证；
  按 AGENTS.md 借入规则登记 `docs/borrowed-designs.md` 后移植（只借鉴契约与降级策略，
  代码用 TypeScript 按本仓约定重写，不引入 Python/新依赖）。

## 计划

1. 重写 `src/skills/github-reader/index.ts` 为 ExecutableSkill（`createGithubReaderSkill()`）：
   - 仓库识别：`github.com/{owner}/{repo}` URL 正则 + `owner/repo` 文本匹配；
   - L1 抓取（fetch + AbortSignal 超时，逐级降级不抛错）：
     - GitHub API：`/repos/{o}/{r}`（Star/Fork/Open Issues/License/语言/默认分支/最近推送/描述/topics）、
       `/contributors?per_page=100`、`/commits?per_page=100&since=近6月`、`/releases?per_page=30`；
     - raw：README（README.md/README_CN.md/readme.md/README.rst/README.txt）+ manifest
       （package.json/pyproject.toml/requirements.txt/go.mod/Cargo.toml）；
     - 降级链：API → raw → 仓库主页 releases.atom/HTML → 显式「未获取（原因）」；
   - `health_score` 0–100 加权（Star/近6月提交/贡献者/Issue 积压/Release 活跃/最近推送）
     + `health_basis` 构成依据；
   - `evidence[]`（type: api|raw|web，url，accessed_at）；
   - LLM 合成（`deps.complete`）：system 注入《专业审阅协议 §一》节选 + X.6 契约 JSON +
     evidence，按「一句话结论 → 定位 → 架构与栈 → 使用 → 活跃度与许可证 → 风险 → 对比 →
     对当前项目的建议 → 仍需确认」输出；无 LLM 时返回结构化契约对象 + 诚实提示；
   - 返回 `SkillOutput { result: { answer, contract, evidence, confidence }, confidence }`。
2. 注册与接线：`src/skills/registry.ts` 从 LegacySkillDef 移入 EXECUTABLE_SKILLS
   （`createGithubReaderSkill()`）；`executors.ts` 保持 `github_reader: available`；
   `model-router.ts` 的 heavy 分档无需改。
3. 测试：重写 `src/skills/github-reader/index.test.ts`（mock fetch）覆盖：API 全成功 /
   部分失败 / 全失败降级 raw+网页 / README 缺失 / manifest 解析 / health_score 边界 /
   无 `deps.complete` 兜底 / URL 提取边界（`.git`、带参、中文后置）；`registry.test.ts`
   若有 github-reader 断言同步更新。
4. 文档与登记：
   - `src/skills/README.md`：github-reader 从「占位（v0.2a）」改为「已实现（v0.2b）」；
   - `docs/borrowed-designs.md`：登记 POC-C `run_deep_github_analyze`（X.6 契约 + 降级链），
     注明只借鉴契约与降级策略、代码为 TS 重写；
   - 附录 A 登记 E-NN：补实现既有需求，无 §5/§6 参数变更 → bench:na(new-param)；
   - 完成后补本计划「执行过程/结果」，并在当天 progress-handoff 加链接。
5. 验证：
   - `npm run build` + `npm run test:all`（全量单测 + 集成全绿）；
   - 真实冒烟：`npm run dev -- "https://github.com/andrewyng/openworker 这项目是做什么用的？"`
     （健康分 + X.6 契约 + evidence）；
   - `npm exec tsx scripts/doc-lint.ts`：0 FAIL 0 WARN。

**验收标准**

- 贴 GitHub 仓库链接 +「这项目是做什么用的 / 值不值得用」→ 回答含 X.6 契约字段、evidence、
  审阅协议顺序与「README 级判断」标注；
- GitHub API 全失败时仍出 README/网页级解读，缺字段显式「未获取（原因）」；
- 新增单测 ≥10 条；全量单测 + 集成全绿；doc-lint 0 FAIL 0 WARN；
- 真实冒烟至少一个仓库返回健康分与结构化解读（openworker / zephyr）。

## 执行过程

### 改动

- `src/skills/github-reader/index.ts`：重写为 ExecutableSkill `createGithubReaderSkill()`——X.6 契约
  （repo/depth/positioning/architecture/tech_stack/usage/scenarios/health_score+health_basis/risks/meta/evidence[]）
  + L1 降级链（GitHub API → raw README/manifest → releases.atom/主页 → 显式「未获取（原因）」）
  + health_score 加权 + LLM 按《专业审阅协议 §一》合成（无 LLM/失败落结构化契约兜底）。
- `src/skills/github-reader/index.test.ts`：重写为 15 条 mock fetch 单测（契约结构/健康分 82 对齐
  POC-C/API 全失败降级/部分失败/README 缺失/manifest 五类解析/健康分边界/URL 提取边界/404 与超时/
  无 LLM 兜底/LLM 失败兜底/无链接引导）。
- `src/skills/registry.ts`：github-reader 从 LegacySkillDef 移入 EXECUTABLE_SKILLS（拿到 `deps.complete`）；
  `src/skills/README.md`：github-reader 占位 → 已实现。
- `src/agent/intent-feature.ts` + `src/agent/router-v2.test.ts`：GitHub 链接 + 项目问句（做什么/值不值）
  原判 qa/web_search，补 E242 规则改判 analyze → github_analysis（对齐 §6.1.2「API 优先」），
  非 github 链接仍走 web_search。
- 文档：`docs/borrowed-designs.md`（POC-C 借入登记）、`docs/2026-08-26-pocc-github-analyze-migration.md`、
  `docs/2026-08-26-github-analysis-requirements.md`、需求文档附录 A E242 登记。

### 遇到的问题

- 顶层 `answer` 契约的 `evidence` 是搜索域字段，skill 路径对所有 skill 统一为空数组；github-reader
  的 evidence 落在 `result.contract.evidence` 与回答正文「来源」行（可点 URL），未改管道避免扩 scope，
  与既有 skill 行为保持一致。
- 路由改判：原「GitHub 链接 + 用途问答」走 qa/web_search，与 §6.1.2 API 优先不符，补 E242
  intent-feature 规则（`github.com` 链接 + 项目问句 → analyze），并加回归断言非 github 链接不受影响。
- 附录 A 初稿测试计数 839/840 为写早（E242 路由测试后补），提交前修正为 840/841（1 skip）。

## 结果

- `npm run build`：通过（tsc 0 错误）。
- `npm run test:all`：单测 840/841（1 skip）+ 集成 22/22。
- 真实冒烟 `npm run dev -- "https://github.com/andrewyng/openworker 这项目是做什么用的？"`：
  健康分 82（与 POC-C openworker 冒烟口径一致）+「README 级判断」标注 + X.6 结构化解读 +
  证据可点（回答正文来源），无 `deps.complete` 时按 mock 降级逻辑返回结构化契约。
- `npm exec tsx scripts/doc-lint.ts`：0 FAIL 0 WARN。
- 提交：见 git log（提交号登记于 handoff）；推送：未推送（待 `push:hosts` 双端同步）。
- 遗留：L2 联网补充（Issues/社区口碑）与 X.7 记忆/工程栏联动留 Phase 2；真实冒烟依赖外网。
