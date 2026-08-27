# 推进计划：成熟度 L2 累积——市场 Skill 沉淀第 6 批（日历管理 / GitHub 项目解读，E259）

> 日期：2026-08-27 · 分支：v0.2b · 状态：已完成

## 目标

继续 Phase 1.2「每周沉淀 3-5 个市场 Skill」节奏，把 日历管理 与 GitHub 项目解读 固化为可执行
市场 Skill（复用 calendar-skill / github-reader 既有能力 + E251 `@input` 输入通道），用户累积
Skill 22→24，登记附录 A E259。

## 计划

1. **新增 `src/skills/market/calendar.ts`**：`parseCalendarQuery`（查询→list / 含时间→add /
   导出→export / 无匹配→归因提示）、`runCalendarCommand`（复用 `openCalendarDb`/`buildCalendarIcs`
   与 time-expression/ReminderStore：add 时同步登记提醒、export 落盘 .ics，dbPath/outDir 可注入）。
2. **新增 `src/skills/market/github-project.ts`**：`runGithubProjectCommand`——包装 E242
   `createGithubReaderSkill().execute()`（X.6 契约 + 降级链；complete/fetchImpl/timeoutMs 可注入，
   缺省尝试 `createSkillHeavyClient()`，未配置则结构化契约兜底）。
3. **单测扩展**：`calendar.test.ts` 新增 8 条 + `github-project.test.ts` 新增 4 条（mock fetch）。
4. **2 个薄 CLI**：`scripts/market-{calendar,github-project}.ts`（@input 通道）；package.json 增
   `market:calendar` / `market:github:project`。
5. **2 个 Skill manifest**：`configs/market-skills/{calendar,github-project}/manifest.json`
   （command + input:query + 中文触发词）；本地安装（--yes）。
6. **真实文件验证**：calendar（新增 + 查询全链）、github-project（真实仓库链接 → X.6 契约 +
   health_score + evidence）。
7. **文档**：附录 A 登记 E259；计划文档补结果；handoff 追加。

**验收标准**

- `npm run maturity:check` 用户累积 Skill 22→24。
- 2 个 Skill 安装成功且 `skill:market:run` 真实验证 ok:true。
- `npm run build` + 单测全绿 + 集成全绿 + `doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/skills/market/calendar.ts`（新）：日历管理解析 + 执行（list/add/export 三模式）。
- `src/skills/market/calendar.test.ts`（新）：8 条。
- `src/skills/market/github-project.ts`（新）：GitHub 项目解读包装（复用 createGithubReaderSkill）。
- `src/skills/market/github-project.test.ts`（新）：4 条（mock fetch）。
- `scripts/market-calendar.ts` / `scripts/market-github-project.ts`（新）。
- `package.json`：新增 `market:calendar` / `market:github:project`。
- `configs/market-skills/{calendar,github-project}/manifest.json`（新）：command + input:query +
  中文触发词。
- 附录 A 登记 E259。

### 遇到的问题

- **沙箱步骤超时（github-project）**：市场 runner 步骤上限为 [P-40] 60s，而本机
  `raw.githubusercontent.com` 网络不可达（15s 超时），github-reader 降级链 20 个 raw 请求
  全吃满默认 8s 超时，累计远超 60s。解法：市场通道默认不做 LLM 合成（结构化契约兜底，
  秒级），新增 `MARKET_GH_TIMEOUT_MS`（默认 6000ms）控制单请求超时，弱网下收紧到 4000ms
  使冒烟在 55.9s 内完成；README 字段如实登记「未获取（原因）」。
- **测试联网**：`createSkillHeavyClient()` 在测试环境会尝试建 LLM 客户端并联网（49s+）；
  测试统一显式注入 `complete: undefined` 走结构化契约路径，mock fetch 秒级完成。
- **PowerShell 转义**：多行替换时 `\n` 落入字面量，已逐行修复。

## 结果

- 验证：2 个 Skill 本地安装（--yes）+ `skill:market:run` 全链 ok:true——calendar（「明天上午10点
  安排项目评审会」→ add 项目评审会 startAt=2026-08-28T02:00:00Z + 同步提醒；「查询我的日程」→
  list 10 条）、github-project（真实 openworker 链接 → X.6 契约 + health_score 82（对齐 POC-C 冒烟
  口径）+ evidence api/raw 六条，README/pyproject 完整抓取，6s 完成）。
- 测试：单测 996/997（1 skip，新增 12 条）+ 集成 32/32；`npm run build` 通过；`doc-lint`
  0 FAIL 0 WARN（C8 49 key）；`maturity:check` 用户累积 Skill 22→24。
- 提交：本批单独提交（按用户指示「先开发，再累积提交」）。
- 遗留事项：github-project 深度 LLM 合成依赖主问答链路（E242 deps.complete）或
  `MARKET_GH_ENABLE_LLM=1`（注意沙箱 60s 预算）；梯子恢复后复验 README/pyproject
  完整抓取、健康分 82，弱网降级路径仍保留（非代码缺陷）。
