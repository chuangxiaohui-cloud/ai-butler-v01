# 2026-09-08 交接

## E364：layered-arch 分层架构/框架/模块图 Skill 落地（owner 拍板「放弃 Archify 架构类」后按 A 开工）
- 计划：docs/plans/2026-09-08-layered-arch-skill.md
- 背景：owner「我们跑偏方向了，放弃 Archify 吧，我在 outputs/archify/ 放了一个 skill，用他来代替 Archify」——2026-09-06 已确认参考图非 Archify 产物，而是「结构化 JSON + 固定 viewer.html」→ 整宽分层泳道 HTML；Archify 自动布局反复修不到工程级分层（E357-E363 均只逼近、仍偶发 0.35/0.3 收据）。owner 选 A：新 Skill 接管架构/框架/分层/模块/组件/系统图，Archify 保留流程/时序/数据流/生命周期。
- 产物（全部新增/接线，未提交）：
  - `src/skills/layered-arch/`：`assets/{viewer.html,example-freertos.json}`（owner 样板复制）、`validate.ts`（本地硬校验：层 id/order/相邻层连线/rules，替代 renderer lint）、`prompt.ts`（铁律 + 字段规范 + 领域样板 few-shot + 修复/救场）、`render.ts`（HTML 转义后内联 JSON → 单文件 HTML）、`index.ts`（生成→校验 ≤1 轮修复→落盘 `outputs/layered-arch/layered-*.{json,html}`；未接 LLM 诚实提示）。
  - 接线：registry 27→28（`layered-arch`）、executors `layered_arch`、routing-table `R_LAYERED_ARCH`、intent-feature `layered_arch_diagram`（LAYERED_ARCH_RE 置于 ARCHIFY_RE 前；问句/带图附件守卫）、confirm-gate 写类低风险 content_generation、llm.ts `layered-arch` 走 medium v4-flash + [P-122] 90s。
  - 测试：registry/lifecycle 计数改 28、confirm-gate +layered_arch、llm +layered、router-v2-archify 首例改流程图 + 新增「架构类归 layered」、新增 `src/agent/router-v2-layered-arch.test.ts`（5 条）。
- 验证：`npm run build` 绿；定向 24/24 + 123/123 两批全绿；`npm run doc-lint` 0 FAIL 0 WARN；零外部 LLM（¥0）。
- 待 owner 复测：重启 gateway 后 5173 问「画一个嵌入式 FreeRTOS 系统框架图 / 画个订单系统的系统架构图」→ 应命中 layered-arch ⏸ 低风险 content_generation 卡 → 批准后产物区出现 `outputs/layered-arch/layered-*.html`（浏览器/面板直接看整宽分层泳道图）；再问「画个流程图/时序图/状态机图」确认仍走 archify（分流正确）。
- 遗留：`outputs/archify/assets/` 与 `outputs/archify/FreeRTOS系统框架图.*` 参考产物待复测通过后清理；Archify Skill 本体与 R_ARCHIFY 保留（流程/时序/数据流/生命周期继续使用）；提交时机归 owner。
- 复测修复（同 E364 未提交）：产物 HTML 打开误报「未自动读取到 JSON 数据」——内联脚本原来 `loadText(对象)`、模板内部 `JSON.parse` 抛错。已改为 `__LAYERED_INLINE__` 守卫 + 直接 `render(对象)`，重建 `outputs/layered-arch/layered-0908-221449.html`；layered-arch 定向 7/7 绿。

## 待办 / 观察
- Archify 提示与 README 后续可补「架构类已由 layered-arch 接管」措辞（本轮已在 src/skills/README.md layered-arch 行说明，archify 行未改——保持执行器语义不破坏既有路由测试）。
- E364 之后真机 LLM 冒烟质量若仍不佳，优先方向是补「领域黄金样板」（嵌入式 5 层 / 订单 5 层）few-shot，而不是给 Archify 继续打补丁。

## 未决问题（2026-09-08 晚暂停，次日续）
- 现象：owner 复验 layered HTML（双击可看图）后反馈「5173 右侧文件栏不能预览架构图了」。已排查起点：gateway `src/gateway/files.ts` 的 `readHtmlArtifactRaw`/列表逻辑正常（outputs 根在 SCAN_ROOTS，.html → HTML 预览）；UI 侧入口在 `ui/prototype/src/App.tsx` `previewFile`（约 614 行，HTML 走 `/api/files/raw` 整文件 iframe，src 约 1235 行 `<iframe className="file-preview-frame">`）。尚未定位到根因（可能在 raw 响应头/iframe 渲染/文件面板列表筛选，或需重启 gateway 加载 outputs/layered-arch）。次日续查：先在浏览器 F12 看点击文件时 raw 请求与 iframe 报错，再决定改 UI 还是 gateway。
- 注意：owner 未跑新 gateway（旧进程可能仍在跑 8787）；明天先确认 gateway 重启后是否复现。

## 续办结果（2026-09-12）
- 已收口。重启 gateway/Vite 后复现确认 raw 响应与 iframe 入口均正常；根因是 layered viewer 在内联数据注入前已启动外部 JSON 自加载，sandbox iframe 中触发 CORS，且旧订单图把对象传入 `loadText()` 导致 JSON.parse 失败。
- 已改为 viewer 脚本执行前注入 `window.__LAYERED_INLINE__`，`tryNext()` 优先同步渲染并跳过外部加载；并用新 renderer 重建 `layered-0908-221449.html` / `layered-0908-232110.html`。
- 验证：layered-arch 定向 7/7，`npm run build` 绿；Playwright 在 5173 双击原失败的订单图，右侧 iframe 完整显示五层架构。未跑 E2E/bench，未提交。
- owner 确认预览通过后，已清理 `outputs/archify/assets/`、`outputs/archify/FreeRTOS系统框架图.{html,json}` 与本轮临时预览产物；`outputs/archify/SKILL.md`、Archify Skill 本体及其他图产物保留。
