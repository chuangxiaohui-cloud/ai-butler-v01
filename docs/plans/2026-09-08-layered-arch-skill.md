# 推进计划：layered-arch 分层架构/框架/模块图 Skill（E364，替代 Archify 架构类）

> 日期：2026-09-08 · 分支：v0.2b · 状态：已完成（E364，未提交，owner 已复测通过）
> 关联：owner「我们跑偏方向了，放弃 Archify 吧，我在 outputs/archify/ 放了一个 skill，用他来代替 Archify」——经 2026-09-06 交接「E364 方向收敛」讨论：参考图本质是「结构化 JSON（meta + layers[].nodes{name,detail} + 层间 connections + rules）+ 固定 viewer.html 模板」→ HTML，不是通用图引擎产物；Archify 自动路由/lint 反复修不到工程级分层，方向性错配。
> 范围裁决（owner 2026-09-08 选 A）：新 layered-arch 接管 系统架构/框架/分层/模块/组件/系统图；Archify 保留 流程/时序/数据流/生命周期。
> 产物来源：owner 亲手放在 `outputs/archify/` 的自制 skill（SKILL.md + assets/viewer.html + example-freertos.json），非外部项目 → 不写 `docs/borrowed-designs.md`（无借入）。

## 目标

新增产品预置 Skill `layered-arch`（lens system_architect）：用户要画系统架构图/框架图/分层图/模块图时，主模型按「分层图铁律 + 领域样板 few-shot」一次输出轻量分层 JSON（层 id/name/order + 节点 {id,name,detail,role} + 层间连线 {from,to,label} + rules），本地确定性硬校验（结构/相邻层连线，≤1 轮 LLM 修复），内联进自研 `assets/viewer.html` 产出**单文件整宽分层泳道 HTML**，落盘 `outputs/layered-arch/layered-*.{json,html}` 并回复路径；不走 Archify 图引擎（无自动布局/lint/救援/0.3/0.35 链条）。

## 方案要点

- 形态：预置 Skill（同 pm-xmind / archify），按触发词唤起；`confirm` 写类低风险 content_generation 闸（写本地产物前经人类裁决）。
- 渲染底座：本地 `assets/viewer.html`（owner 样板）→ `render.ts` 做模型文本 HTML 转义后，在 viewer 脚本执行前注入校验过的 JSON，产出可双击/面板直接看的自包含 HTML；同名 `.json` 保留供后续迭代。
- JSON 生成：`prompt.ts`——IRON_RULES（分层容器归属/自顶向下/节点 name+detail/核心层展开 5-8 子组件/领域术语禁串台/连线必须相邻层/1-2 条设计红线）+ 字段规范 + 完整目标样板 few-shot；非法 JSON 救场 1 次、本地校验 issues 修复 ≤1 轮。
- 路由：`intent-feature.ts` 增 `layered_arch_diagram`（LAYERED_ARCH_RE 置于 ARCHIFY_RE **之前**；只拦 架构/框架/分层/模块/组件/系统图，流程/时序/数据流/生命周期/拓扑/部署留给 archify）；问句守卫与带图附件解读守卫同 archify。`routing-table.ts` 增 `R_LAYERED_ARCH`（strict actionType、architect、confirm 写类同 R_ARCHIFY）。
- 接线：registry（27→28）、executors `layered_arch`、confirm-gate 写类清单 + profile（label「生成分层架构图（LLM 整理后写入本地产物）」risk low、costKind content_generation）、`createSkillCompleteClient` 增 layered-arch 走 medium v4-flash + [P-122] 90s per-call（同 E358 防 JSON 长生成超时）。

## 计划

1. assets：从 `outputs/archify/assets/` 复制 `viewer.html`、`example-freertos.json` 到 `src/skills/layered-arch/assets/`。
2. `validate.ts`：本地确定性硬校验（meta.title / 层 id 小写唯一 / 每层 1-8 节点 / order 整数不重复 / connections 必须相邻层且引用真实层 id / rules 字符串数组）。
3. `prompt.ts` + `render.ts` + `index.ts`：生成/修复/救场提示 + 单文件 HTML 交付 + `createLayeredArchSkill({outDir?,assetDir?,complete?,maxFixRounds?})`（产物目录经 guardSkillOutputPath；未接 LLM 诚实提示）。
4. 意图/路由/闸门/注册接线 + 清单文档（registry 计数、skills/README、code-directory、附录 A E364、当天交接）。
5. 测试与文档：validate 3 组 + index 4 条（主流程/救场/修复/未接 LLM）+ router-v2-layered-arch 5 条 + router-v2-archify 分流改写 + registry/lifecycle/confirm-gate/llm 计数回归。

**验收标准**

- `npm run build` 绿；定向单测全绿（registry 28 / lifecycle 28 / confirm-gate +layered_arch / layered validate+index / router 分流）；`npm run doc-lint` 0 FAIL 0 WARN；不自主跑 test:all/bench（成本纪律）。
- 手动验收（owner）：重启 gateway 后 5173 问「画一个嵌入式 FreeRTOS 系统框架图 / 画个订单系统的系统架构图」→ ⏸ 低风险 content_generation 卡 → 批准后产物区出现 `outputs/layered-arch/layered-*.html`，回复带分层摘要与路径；浏览器/面板打开为整宽分层泳道图；「画个流程图/时序图/状态机图」仍走 archify（分流正确）。

## 执行过程

### 改动

- `src/skills/layered-arch/assets/`：复制 owner 样板 viewer.html + example-freertos.json。
- `src/skills/layered-arch/{validate,prompt,render,index}.ts` + `index.test.ts` + `validate.test.ts`：如上方案。
- 接线：`src/skills/registry.ts`（28 项，createLayeredArchSkill 插在 codegraph 与 archify 之间）、`src/agent/executors.ts`、`src/agent/routing-table.ts`（R_LAYERED_ARCH）、`src/agent/intent-feature.ts`（ACTION_TYPES + LAYERED_ARCH_RE + 守卫 + 提示词字段串）、`src/escalation/confirm-gate.ts`、`src/search/llm.ts`（layered-arch → medium v4-flash + 90s）。
- 测试：registry.test 27→28 + 名单 + `layered-arch`；lifecycle.test 27→28/28→29；confirm-gate.test +layered_arch 三处；llm.test +layered；router-v2-archify.test 首例改流程图 + 新增「架构类归 layered」断言；新增 router-v2-layered-arch.test.ts。
- 清单/文档：`src/skills/README.md` 原生 Skill 表加行、`docs/code-directory.md`（27→28 个 Skill 目录）、附录 A E364、本计划补结果、`docs/2026-09-08-progress-handoff.md` 交接。

### 遇到的问题

- 无外部依赖/无 vendor 体积问题：viewer.html 本地渲染，产物默认 `process.cwd()/outputs/layered-arch`。
- viewer 用 innerHTML 直插 name/detail/label/rules → `render.ts` 先对模型文本做 HTML 实体转义再内联，防模型 JSON 夹脚本。
- asset 定位同时支持 src（tsx dev）与 dist（构建产物回落工作区 src 路径），同 archify defaultVendorDir 双候选套路。
- 手动复测发现产物 HTML 打开显示「未自动读取到 JSON 数据」：内联脚本原来调 `loadText(对象)`，而模板 `loadText` 内部 `JSON.parse(text)` 把对象转成 `"[object Object]"` 抛错，图没渲染、模板兜底链随后误报。修复：`viewer.html` tryNext 开头加 `window.__LAYERED_INLINE__` 守卫，`render.ts` 内联脚本改为置标志 + 直接 `render(对象)`（不经二次 JSON.parse）；index.test 加 2 条断言（含 `__LAYERED_INLINE__` 与 `try { render(`）。已用新逻辑重建既有产物 `outputs/layered-arch/layered-0908-221449.html`。

## 结果

- 定向两批全绿：layered-arch 7/7（含渲染修复后新增断言）+ router/registry/confirm-gate 24/24 + lifecycle/archify/router-v2 123/123；`npm run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN；零外部 LLM（¥0，测试全 Fake）。
- owner 已于 2026-09-12 复测确认 5173 右侧栏可预览 layered HTML。
- 复测通过后已清理 `outputs/archify/assets/` 与 `outputs/archify/FreeRTOS系统框架图.{html,json}` 参考产物；Archify Skill 本体及流程/时序/数据流/生命周期路由保留。E364 未提交，提交时机归 owner。

### 2026-09-12 文件栏预览收口

- 根因：内联数据脚本原来追加在 viewer 自加载脚本之后，`tryNext()` 先请求 `data.json`/目录索引；在 UI 的 sandbox iframe 中 origin 为 null，因此触发 CORS，旧产物还把对象传给 `loadText()` 导致二次 JSON.parse 失败。
- 修复：`render.ts` 把安全化后的数据在 viewer 脚本前写入 `window.__LAYERED_INLINE__`；viewer 的 `tryNext()` 优先同步 `render()` 该对象并返回，不再进入外部 JSON 加载链。回归断言同时校验注入顺序。
- 验证：layered-arch 定向 7/7，`npm run build` 绿；重启 gateway/Vite 后，Playwright 双击原先失败的 `layered-0908-232110.html`，右侧 iframe 完整显示五层订单系统图，无该产物 CORS/alert 错误。已用新 renderer 重建两份 09-08 HTML 产物；零外部 LLM（¥0）。
