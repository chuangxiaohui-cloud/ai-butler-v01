# 推进计划：github-reader README 正文进 LLM context（P0 数据层）

> 日期：2026-08-29 · 分支：v0.2b · 状态：已完成

## 目标

修复 github-reader 解读 deepseek-harness 时「README 正文丢失、LLM 只能对着空壳推断（confidence 0.55，三个核心字段全部「未获取」）」的数据层问题。

## 背景（已只读排查确认的问题原因）

链路：`src/search/pipeline.ts` direct skill dispatch → `src/skills/github-reader/index.ts` execute → L1 抓取 → X.6 契约 → LLM 合成。

1. **README 抓取是成功的**：`fetchRaw`（`index.ts:355`）用 API 的 `default_branch`（deepseek-harness 为 `master`）拿到非空 README，evidence 只会在 `text !== null && text.trim()` 时记录（`:375-381`），本次输出 `raw.githubusercontent.com/.../master/README.md` 为 `[hard]` 可证。
2. **丢失发生在「解析 → 契约组装」**：`execute`（`:756-757`）只把 README 压成 4 个字段（`positioning` + `architecture/usage/scenarios`，各 ≤600 字符，`:129`），随后 LLM 只看到 `JSON.stringify(contract)`（`:821-822`）——**README 全文从不进 LLM context**。
3. **章节正则太窄**（`:458-460`）：deepseek-harness README 标题为 `Developer preview / Run / Run from npm / ...`，usage 正则 `/quick\s*start|getting\s*started|快速开始|安装|使用|usage|开始使用|install/i` 匹配不到 `Run`，架构/场景正则同样全 miss → 三个字段都落成「未获取」，与输出逐字吻合。
4. **positioning 导航行漏网**（`:418-419`）：`linkTexts.join('').length * 2 > line.length` 对中文失效，`English | [中文](README.zh.md)` 被当正文，positioning = `English | 中文`，与输出「仅有 English | 中文 语言切换标记」逐字吻合。
5. **历史盲点**：前五轮（`2026-08-29-github-quality-confidence-timing.md`）聚焦 confidence/截断/计时/429，五轮曾以「promptTokens=1851，不需要压缩」误判注入正常——只看了 token 数量，没看 README 内容是否为空。

## 计划

1. `index.ts`：契约新增 `readme_excerpt`（README 原文有界截取，新常量 `README_EXCERPT_MAX_CHARS = 8000`），随契约 JSON 进 LLM 合成 prompt → 验证：github-reader 单测
2. `index.ts`：`extractPositioning` 补「剥掉链接/标签后残余过短即导航行」判定，过滤 `English | [中文](README.zh.md)` 这类语言切换行 → 验证：github-reader 单测
3. `index.ts`：usage 正则补 `\brun\b|\brunning\b|运行|启动|部署|deploy|how\s+to`，让 `## Run` / `## Run from npm` 命中 usage → 验证：github-reader 单测
4. `index.test.ts`：新增 3 条单测（excerpt 含 README 正文 / positioning 过滤语言切换行 / usage 命中 `## Run`）；回归既有 18 条
5. 文档：计划 + progress-handoff 链接 → 验证：doc-lint

**验收标准**

- `npm run build` 绿
- github-reader 单测（含新增 3 条）全绿，全量 `npm run test:all` 绿
- 不复跑 bench / 全量 e2e（成本纪律）
- 用户手动复测 deepseek-harness query 时，答案不再出现三个「未获取」空壳推断

## 执行过程

### 改动

- `src/skills/github-reader/index.ts`：
  - 新增 `README_EXCERPT_MAX_CHARS = 8000` 常量；`GithubContract` 新增 `readme_excerpt` 字段；`execute` 在 README 抓取成功后写入 `readmeText.slice(0, 8000)`，随契约 JSON 一并进 LLM 合成 prompt。
  - `extractPositioning` 新增「剥掉 markdown 链接/HTML/`|`·` 分隔符后残余 < 12 字符即导航行」判定，过滤 `English | [中文](README.zh.md)` 语言切换行。
  - usage 章节正则补 `\brun\b|\brunning\b|运行|启动|部署|deploy|how\s+to`，`## Run` / `## Run from npm` 可命中。
- `src/skills/github-reader/index.test.ts`：新增 3 条单测（`readme_excerpt` 携带 README 原文 / positioning 过滤语言切换行 / usage 命中 `## Run from npm`），新增 `readmeRoutes` mock 辅助。

### 遇到的问题

- PowerShell 环境下 `apply_patch`（`.bat` 壳）经 cmd 传参会丢换行；直接调 `codex.exe --codex-run-as-apply-patch` 可行，但双引号 here-string 会把 `` `t ``/`` `b `` 等反引号序列转义成控制字符污染补丁与文档（计划文档初版被写坏，已重写）。处理办法：单引号 here-string + CRLF 对齐 + 新文档用 `WriteAllText` 直写。
- 目标文件为 CRLF 行尾，补丁上下文需转成 CRLF 才能匹配。

## 结果

- 验证：`npm run build` 绿；github-reader 单测 21/21（含新增 3 条）；pipeline + github-project 56/56；`npm run test:all` 退出码 0（集成 32/32）；`npm run doc-lint` 0 FAIL 0 WARN。
- 测试：单测目标文件全绿 + 集成 32/32。
- 提交：未提交（工作区含 E275-E281 大量未提交改动，提交前需 doc-lint + test:all 全绿）。
- 遗留事项：
  - `readme_excerpt` 上限 8000 字符为经验值，若大仓库 README 关键信息在 8000 字符之后，可再评估提高或按章节加权截取。
  - monorepo manifest 只抓根 `package.json` 且合并 devDependencies，导致 tech_stack 偏构建工具链——不在本次范围，列为后续项。
  - 真实 `npm run dev` 复测待用户手动跑：期望答案不再出现三个「未获取」空壳推断、usage 能读到 `npx @deepseek-ai/dsh web`。
## 七轮补强（协议重构：输出预算 + 数据边界）

### 背景

用户复测通过（confidence 0.65、usage 读到 `npx @deepseek-ai/dsh web`、定位/风险准确），但 `synthesisMs=49.96s` 仍长，且答案出现三处不在抓取数据里的内容（`SAFETY.md`、`--no-open`、SSH host URL，本地快照无 SAFETY.md、README 未提及），属于数据不足时的外推编造。用户拍板：最后一轮一次修到位。

### 改动

- `src/skills/github-reader/index.ts`：
  - `REVIEW_PROTOCOL_SYSTEM` 重构：13 维编号列表改为「内部检查清单」；新增硬性「输出要求」（总字数 ≤ 1200 字、固定紧凑输出顺序、每节 1-3 句、禁止逐项编号展开）与硬性「数据边界」（只依据本次抓取的 README/manifest/GitHub API/evidence 发言，未出现在数据中的文件名/CLI 参数/功能一律不得提及，只能写「未获取（未抓取）」）。
  - per-call system 附加文本由「报告控制在 2000 字以内」改为引用协议输出要求（≤ 1200 字）。
  - 修正 `SYNTH_MAX_TOKENS` 注释与实际一致（首轮/重试均 4096）。
- `src/skills/github-reader/index.test.ts`：协议断言同步新措辞，新增「总字数 ≤ 1200 字」「未出现在这些数据中的文件名」两条断言。

### 结果

- 验证：`npm run build` 绿；github-reader 21/21；pipeline + github-project + nl-router 65/65；`npm run test:all` 退出码 0（集成 32/32）；doc-lint 0 FAIL 0 WARN。
- 说明：evidence 的 `[url](url)` 样式为桌面应用渲染 artifact（`console.log` 输出的是裸 URL），非代码 bug，本轮未动。
- 提交：未提交（工作区含 E275-E281 及多轮 github-reader 未提交改动）。
- 遗留：真实 e2e 复测待用户手动跑——期望 `synthesisMs` 明显下降、答案不再出现 SAFETY.md/--no-open 类编造；若 README 原文确有 SAFETY.md（08-14→08-29 master 变动），则该句合法，可忽略。