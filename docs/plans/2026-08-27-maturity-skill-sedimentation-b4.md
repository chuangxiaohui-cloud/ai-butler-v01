# 推进计划：成熟度 L2 累积——市场 Skill 沉淀第 4 批（docx 日报/周报模板 / 汇报 PPT / 图片压缩，E257）

> 日期：2026-08-27 · 分支：v0.2b · 状态：已完成

## 目标

继续 Phase 1.2「每周沉淀 3-5 个市场 Skill」节奏，把 日报/周报模板（docx 排版）、汇报 PPT 生成、
图片压缩 固化为可执行市场 Skill（复用 E254-E256 `file-readers.ts` 文件工具底座 + E251 `@input`
输入通道），用户累积 Skill 17→20，登记附录 A E257。

## 计划

1. **扩展 `src/skills/market/file-readers.ts`**：`writeDocx`（office_docx_write.py，纯文本逐段排版）、
   `createPptx`（office_pptx_create.py，标题+slides JSON 规格，临时规格文件用后即删）、
   `compressImage`（compress_image.py，Pillow 压缩到目标 KB）；统一走 `defaultRunPython`。
2. **单测扩展**：`file-readers.test.ts` 新增 6 条（writeDocx 2 + createPptx 2 + compressImage 2）。
3. **3 个薄 CLI**：`scripts/market-{docx-write,pptx-create,image-compress}.ts`（@input 通道）；
   docx-write 双模（.txt 路径→排版；否则 日报/周报 模板，日期+四章节）；pptx-create 首个逗号子句
   做标题、其余子句做条目（三页骨架：概述/进展/计划）；image-compress 首个纯数字参数为 max_kb
   （缺省 200）；package.json 增 `market:*` 脚本。
4. **3 个 Skill manifest**：`configs/market-skills/{docx-write,pptx-create,image-compress}/manifest.json`
   （command + input:query + 中文触发词）；本地安装（--yes）。
5. **环境补齐**：补装 python-pptx（office_pptx_create.py 既有依赖）。
6. **真实文件验证**：docx-write（日报模板五段结构 + txt→docx）、pptx-create（真实 query → 4 页
   pptx，python-pptx 复核）、image-compress（真实 PNG → ≤目标 KB）。
7. **文档**：附录 A 登记 E257；计划文档补结果；handoff 追加。

**验收标准**

- `npm run maturity:check` 用户累积 Skill 17→20。
- 3 个 Skill 安装成功且 `skill:market:run` 真实验证 ok:true。
- `npm run build` + 单测全绿 + 集成全绿 + `doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/skills/market/file-readers.ts`：新增 `writeDocx` / `createPptx` / `compressImage`
  （office_docx_write / office_pptx_create / compress_image，[P-112]）。
- `src/skills/market/file-readers.test.ts`：新增 6 条（含临时规格文件清理断言）。
- `scripts/market-docx-write.ts` / `scripts/market-pptx-create.ts` / `scripts/market-image-compress.ts`（新）。
- `package.json`：新增 `market:docx:write` / `market:pptx:create` / `market:image:compress`。
- `configs/market-skills/{docx-write,pptx-create,image-compress}/manifest.json`（新）：command +
  input:query + 中文触发词。
- 附录 A 登记 E257。

### 遇到的问题

- **python-pptx 缺失**：`office_pptx_create.py` 依赖未装 → 补装 python-pptx（清华源，同 openpyxl/
  xlrd 先例）。
- **PPT 标题抓取过宽**：整段 query 做标题会带上后续条目 → 改为首个逗号子句做标题（去触发词与
  「关于/的」等虚词），其余子句做条目，输出 `项目周报-汇报.pptx` 级干净文件名。
- **docx 模板标题拼接**：初版把「日报」后缀重复拼接到标题 → 简化为 cleaned 或默认「日报/周报」。

## 结果

- 验证：3 个 Skill 本地安装（--yes）+ `skill:market:run` 全链 ok:true——docx-write（日报模板
  docx：标题+今日进展/遇到的问题/明日计划/备注 五段 + txt→docx 双模）、pptx-create（「项目周报」
  query → 4 页 pptx，python-pptx 复核标题+三页骨架）、image-compress（真实 PNG 971×420 →
  48358B ≤ 50KB 目标）。
- 测试：单测 976/977（1 skip，新增 6 条）+ 集成 32/32；`npm run build` 通过；`doc-lint`
  0 FAIL 0 WARN（C8 49 key）；`maturity:check` 用户累积 Skill 17→20。
- 提交：未提交（等待确认后按单一主题提交）· 推送：待执行（Gitee / GitHub）
- 遗留事项：继续 Phase 1 每周沉淀节奏（下一批候选：日历/提醒管理、GitHub 项目解读细分——后者需
  先按 `docs/plans/2026-08-26-github-project-analysis.md` 完成 skill 本体升级）；通过率/复用率
  观察继续按累积路径节奏记录。
