# 推进计划：Archify 引入为产品预置 Skill（五类系统图交付，E352）

> 日期：2026-09-06 · 分支：v0.2b · 状态：已完成（E352，未提交，待 owner 拍板批次 + 手动验收）
> 关联：owner「两个都做，你先做计划」；解读结论：Archify 官方即 agent Skill 分发形态（typed JSON IR → 确定性 renderer → 自包含 HTML/SVG），应作为 Skill 落地而非写死进问答管道。本文件只覆盖 Archify；CodeGraph 另见 `docs/plans/2026-09-06-codegraph-enable.md`。
> 承接：与本仓库 pm-xmind 走同一条「路由 → confirm 卡 → 批准后 executor 落盘产物 → 回复预览」链路（参考 `docs/plans/2026-09-05-xmind-skill.md`）。
> 借入登记：Archify（tt-a1i/archify，MIT）→ 需同步写入 `docs/borrowed-designs.md` 后才算完成（仓库纪律）。
> 范围裁决（owner 2026-09-06）：五类图（Architecture / Workflow / Sequence / Data Flow / Lifecycle）一起做，不做单图型起步。
> owner「你把 Archify 一起做好我再测试」→ 与 CodeGraph（E353）同批完工，不逐轮交付。待确认三项按默认拍板：
> ① vendor 走 git 跟踪（官方 `archify.zip` v2.16.0 解到 `src/skills/archify/vendor/archify/`，剔 5 个预渲染示例 HTML，~2.2MB，可复现）；② 触发词与角色照默认（actionType `archify_diagram`，lens architect）；③ 成本口径 content_generation（confirm 预估成本同 [P-149]/[P-150]）。

## 目标

新增产品预置 Skill `archify`（lens system_architect，架构师角色）：用户描述系统/代码库（或要求架构评审对比）时，AI-Butler 用一次主模型调用把需求整理为 Archify typed JSON IR（含图型判定），本地 renderer（vendor 的 `bin/archify.mjs`）validate + deliver 出交互式 HTML 系统图（支持五类图 + 深浅主题），落盘产物区并回复链接/摘要。全程本地渲染、无外部服务；与 XMind（大纲→.xmind）互补、不冲突。

## 方案要点（owner 已确认：作为 Skill，五类图一次全上）

- 形态：预置 Skill（同 pm-xmind），非写进搜索/答案管道；按触发词按需唤起。
- 渲染底座：vendor 官方发行包（含 `bin/archify.mjs`、五类 JSON IR schema、预设、SKILL.md 契约）进仓库，运行时以子进程调用 `node bin/archify.mjs validate/deliver`；产物 HTML 进 `outputs/archify/`（guardSkillOutputPath + 审计）。
- JSON IR 来源：pipeline 主模型按五类 schema 一次生成（含图型 type 判定），随后确定性校验+渲染；失败给修复收据摘要，不猜测重试。
- 图型选择：query 含「流程/时序/数据流/生命周期/状态机/架构」等关键词时按显式意图映射五类图型；无关键词由模型按内容判定；产物文件名与回复里标注图型。

## 待 owner 确认（执行前）

1. vendor 方式：把 Archify 官方稳定版 zip（选定非 dev tag，保留 LICENSE/README）解到 `src/skills/archify-skill/vendor/archify/` 并 git 跟踪（默认，可复现随仓库走）；若体积过大（>30MB）改放 gitignore + 本地安装脚本。是否同意默认？
2. 触发词与角色：默认 actionType `archify_diagram`、触发词（系统架构图/架构图/系统图/组件图/流程图/时序图/数据流图/生命周期图/架构对比/architecture diagram），与 xmind（思维导图/脑图/WBS）做边界词拆分。路由归 lens `system_architect`。是否同意？
3. 生成成本口径：确认闸标注「低风险 + 一次主模型调用（估 ¥0.0x 级）」，按预算账本记账。是否接受（非 ¥0，与 xmind 不同）？

## 计划

1. 借入登记与 vendoring：`docs/borrowed-designs.md` 登记 Archify（设计借用 + 外部 renderer 依赖 + MIT 许可）；下载选定稳定 tag 到 vendor 目录（带 LICENSE/README）；`node bin/archify.mjs doctor` 验证本机 Node 22.22.1 可用；确认五类 schema/示例文件齐全。
2. 纯渲染核心 `src/skills/archify-skill/render.ts`：封装 renderer 子进程调用（validate→deliver→HTML 落盘 `outputs/archify/`）、schema/预设定位、失败解析为可读修复收据；`index.ts` 暴露 `createArchifySkill({ outDir?, vendorDir?, llm? })`——输入正文/query → LLM 产 typed JSON IR（五类图 schema 之一）→ 本地校验渲染 → 产物入产物区。
3. 意图/路由：`intent-feature.ts` 增 `archify_diagram` + 触发词与图型关键词映射（置于 xmind 同层做边界拆分：导图/脑图→xmind，架构/组件/流程图/时序/数据流/生命周期→archify）；`routing-table.ts` 增 R_ARCHIFY（lens system_architect、executor archify、base+boost 落 confirm 带）；`executors.ts` 登记 available。
4. 确认闸与预算：`confirm-gate.ts` CONFIRM_WRITE_EXECUTORS + EXECUTOR_PROFILE（label「生成系统架构图（写入本地产物）」risk low、costKind 按一次主模型调用记账）；预算账本按实际调用追加支出事件。
5. 注册与清单：registry EXECUTABLE_SKILLS 增 archify（计数 25→26，以 registry 断言为准）；`src/skills/README.md` 原生 Skill 表加行；目录地图/`docs/code-directory.md` 同步。
6. 测试与文档：renderer 用官方 examples 五类图各至少一条 fixture 做 validate/deliver 确定性单测（mock LLM 产出）；路由/confirm 单测；附录 A 登记 E352；本计划补「结果」；结果与当天交接。

**验收标准**

- `npm run build` 绿；定向单测（五类图 render 确定性 + 路由 + 图型关键词映射 + confirm + registry/lifecycle 计数 25→26 断言）全绿；`npm run doc-lint` 0 FAIL 0 WARN；不自主跑 test:all/bench（成本纪律）。
- 手动验收（owner）：聊天「画一个 <架构/流程/时序/数据流/生命周期> 图：<描述>」→ 出 confirm 卡（低风险、标注预估成本）→ 批准后产物区出现可打开的 HTML 图且回复带摘要与图型标注；五类图各冒烟一次；浏览器打开 HTML 可缩放/主题切换。
- 借入登记在 `docs/borrowed-designs.md` 完成（三件套：登记 + Skill 落地 + 测试）。

## 执行过程

### 改动

- vendor：下载官方 Skill 包 `archify.zip`（v2.16.0 稳定 tag，~1.3MB zip），解到 `src/skills/archify/vendor/archify/`（含 `bin/archify.mjs`、schemas、examples、SKILL.md、LICENSE）；删 5 个预渲染示例 HTML（可经 `scripts/render-examples.mjs` 再生成，doctor/validate 不受影响）；`node bin/archify.mjs doctor` 本机 Node 22.22.1 全绿；五类官方示例 showcase 校验各 9/9 检查通过。
- `src/skills/archify/render.ts`：validate/deliver 子进程封装（runner DI、`ARCHIFY_UPDATE_CHECK_DISABLED=1`、TEMP/TMP 指 `data/.archify-tmp` 规避沙箱 realpath 限制）、JSON 收据解析、诊断摘要与计数；vendor 定位同时支持 src（tsx dev）与 dist（构建产物回落工作区 src 路径）。
- `src/skills/archify/prompt.ts`：按选定图型动态组装「schema + common + 官方示例（仅示范字段形态）」的生成提示词；修复提示词携带诊断与上一版候选；`parseModelJson` 剥 think/围栏/夹带文字。
- `src/skills/archify/index.ts`：`createArchifySkill`——`detectDiagramType`（流程/时序/数据流/生命周期/默认架构）→ 主模型一次生成 typed JSON IR → 落盘 `outputs/archify/archify-<type>-MMDD-HHMMSS.json` → validate（失败 ≤2 轮按 supportedFixes 修复、不改善即如实报告）→ deliver 渲染自包含交互 HTML 同目录；回复带产物路径 + 校验汇总 + 规格 SHA-256；产物 JSON 保留供迭代。
- 接线：registry（26→27）、executors（`archify` available）、intent `archify_diagram`（名词/动宾触发词 + 问句/带图附件守卫）、R_ARCHIFY（lens architect、strict、base 0.55+boost 0.15 落 confirm）、confirm-gate 写类清单 + profile（label「生成系统架构图（LLM 整理后写入本地产物）」risk low、costKind content_generation）。
- 清单/文档：`src/skills/README.md`、`docs/code-directory.md`（25→27 个 Skill 目录，含 E353 漏计修正）、借用登记 2.12、附录 A E352、当天交接。

### 遇到的问题

- GitHub 仓库体积 ~115MB，直接 zipball 太大 → 改取 v2.16.0 Release 的官方 Skill 包 `archify.zip`（1.3MB）。
- Codex 沙箱内 `realpath C:\Users\zhxh` EPERM（vendor 内部用系统临时目录渲染校验件）→ 子进程把 TEMP/TMP 指到仓库 `data/.archify-tmp`，沙箱内单测与生产一致可跑。
- vendor 静态文件不随 tsc 进 dist → `defaultVendorDir()` 探测「本目录 → 工作区 src 路径」双候选。
- E353 交接文档把 Skill 目录数写成 25（漏计 codegraph）→ 本项统一修正为 27（含 archify）。

## 结果

- 定向单测 38/38 绿（archify render 3 + prompt 3 + index 5 + router-v2-archify 5 正反例 + 受影响 registry/lifecycle/confirm-gate/xmind/executors 回归）；全量单测 1416/1417（1 skip 既有）；`npm run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN；全程零真实 LLM/API（测试全 Fake，vendor 校验仅本机确定性渲染，¥0）。
- 手动验收（owner）：5173 问「画一个订单系统的系统架构图/发布流程图/缓存时序图/埋点数据流图/状态机图：<描述>」→ 出低风险 confirm 卡（预估成本 ≤ ¥0.0x）→ 批准后产物区出现 `outputs/archify/archify-*.html` 且回复带路径/校验摘要；浏览器打开可缩放/搜索/深浅主题切换；改 JSON 可重渲染。待真机 LLM 冒烟确认实际生成质量（架构图需 grid 排布遵守提示词；修复轮不收敛时按诊断如实报告并建议简化）。
- 遗留：真机 e2e 由 owner 在 UI 上执行（LLM 调用走真实 provider，成本记账自动进 usage）；`visual-check`（Chrome 桌面证据）属可选，不在自动链路内。
