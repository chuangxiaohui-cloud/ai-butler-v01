# 进度交接 2026-09-05（PM 角色 Xmind 思维导图 Skill E340）

> 当前分支：v0.2b｜本轮收口：E340（pm-xmind 预置 Skill）+ E341（gateway dev CORS 白名单）+ E342（内容型思维导图）+ E343（内容型大纲合成预算放宽）+ E344（内容型紧凑交付 + 大纲清洗）+ E345（.xmind 面板只读预览）+ E346（.xmind 面板可视化导图预览）+ E347（思维导图中间大窗口查看）+ E348（思维导图内嵌聊天回复）+ E349（思维导图查看器升级为可交互：滚动/缩放/全屏）。 + E350（左栏角色面板：角色 + 子 Agent/Skill 目录真实接入）+ E351（图片类 Skill VLM 推理预算修复）。
> 上一份交接见 `docs/2026-09-04-progress-handoff.md`。工作区仍挂着未提交批次：E335–E339（文件面板临时文件过滤/变更记录等）+ E340–E351，owner 此前「先不提交，继续推进其他」，待统一拍板批次。

## 今日完成

### PM 角色 Xmind 思维导图 Skill（E340）

- **背景**：owner「项目经理一般会操作 Xmind，加个技能」。方向 B 收口（生成 `.xmind` + 读回文本大纲，不驱动 Xmind GUI，无官方 CLI 且 UI 自动化脆）；`.xmind` = zip 包（content.json 存树），仓库已依赖 jszip，零新依赖。owner 拍板「好！那就搞xmind」。
- **代码**：
  - `src/skills/pm-xmind/format.ts`——纯核心：大纲↔树（WBS 编号 / 缩进 / `-` 列表，引导句剔除、编号跳级按最深挂）、jszip 组包/解包（兼容 Xmind content.json 数组或对象形态）、唯一 id。
  - `src/skills/pm-xmind/index.ts`——`createPmXmindSkill`：生成落盘过 `guardSkillOutputPath` + 审计、文件名 `pm-xmind-MMDD-HHmmss.xmind`；读附件或沙箱路径（`isPathAllowed`）回大纲；无结构给使用引导、不写盘。
  - 接线：`ACTION_TYPES` 增 `xmind` + 触发词（置于 analyze/office/create 之前，问句守卫让位 QA，避免正文“分析/对比”抢意图）；`routing-table` 增 R_XMIND（lens project_manager、strict actionType-only、中带 confirm）；`executors.ts` `pm_xmind` available；`confirm-gate.ts` 写类清单增 `pm_xmind`（label「处理 Xmind 思维导图（读写本地文件）」risk low、costKind local=¥0）；registry/lifecycle 24→25；pipeline 对 pm-xmind 直传原句（大纲/路径不被 Stage 1 清洗）并把 `.xmind` 纳入产物路径识别；`files.ts` 面板 kind 标「思维导图」。
- **验证**（全程零外部 LLM/API，¥0）：`npm run build` 绿；定向单测 pm-xmind 5/5 + router-v2-xmind 5/5 + registry 25/lifecycle 25+26/confirm-gate/router-v2 85/85 + pipeline 68/68 + routing-enum 集成 1/1；`npm run doc-lint` 0 FAIL 0 WARN。全量 `test:all`/bench 未跑（成本纪律）。
- **文档**：需求文档 §12.2 行 + 附录 A E340；计划 `docs/plans/2026-09-05-xmind-skill.md`；`docs/code-directory.md` Skill 目录 23→24；本交接。
- **已知边界**：读 `.xmind` 与生成共用同一 R_XMIND + 低风险 ¥0 confirm 卡（读取也会出一张卡）；Xmind 生成格式按标准 content.json 结构，跨版本 Xmind 打开核对待 owner；结构缺失只给引导（会先出卡再引导，不写盘）。

### 图片类 Skill VLM 推理预算修复（E351）

- **背景**：owner「粘贴一张图片，叫他分析图片内容」→ 回复 0.2 兜底文案。定位：**不是模型非多模态、不是 UI 丢图**（route-cases 实锤 `hasImage:true`、`attachmentTypes:["image/png"]`，路由正确命中 `R_IMAGE_GENERAL → image_analysis`）。根因：`DEEPSEEK_VISION_MODEL=deepseek-v4-flash-vision-exp` 是**推理型视觉模型**，思考走 `reasoning_content`、答案才落 `message.content`；image-analysis/color-recognition 的 VLM `maxTokens` 仅 200/100，思考耗光预算 → `content=""` → `createVisionClient` 报「VLM 返回空内容」→ skill 兜底 0.2。
- **代码**：§5 新增 [P-152] `vlmImageMaxTokens=2048`、[P-153] `vlmTimeoutMs=20000ms`（`src/config/params.ts` PARAMS+PARAM_IDS 同补）；`image-analysis/index.ts` 与 `color-recognition/index.ts` 的 `maxTokens` 改读 [P-152]；`src/search/llm.ts` `createVisionClient` 默认超时改读 [P-153]（env `VLM_TIMEOUT_MS` 仍可覆盖）；新增两 Skill 单测断言调用按 [P-152] 走。
- **验证**：真实复现（gateway 同款接线 + owner 截图，~2.3s 拿到与线上一致的真实错误 `VLM 返回空内容`）+ 直连探测（`max_tokens=1000` → reasoning 548 后 `content` 正常、`finish_reason=stop`、~8.8s）确认根因与修复方向；`npm run build` 绿；image-analysis 3/3 + color-recognition 3/3 新增单测绿；`npm run doc-lint` 0 FAIL 0 WARN（参数计数 151→153）；全程真实 VLM 定位探测 ¥0 级；全量 test:all/bench 与真实 UI 冒烟不自主跑（成本纪律）。计划 `docs/plans/2026-09-05-vlm-reasoning-budget.md`。
- **遗留**：video-learner 帧描述 VLM 预算（120/1200）同款隐患另立小轮；未提交（并入现有未提交批次）。

### 会话备注（端口澄清）
- 端口分工：`npm run gateway` = 后端 API 网关，监听 `127.0.0.1:8787`；`npm --prefix ui/prototype run dev` = UI 页面，Vite 监听 `127.0.0.1:5173`。浏览器只开 `http://127.0.0.1:5173`，UI 内部自动连 8787；上次交接文案把两者写含糊，已纠正，勿再混。
- **E341（本会话追加）**：owner 实测此前「打开 5173 提问报网关未连接、打开 8787 正常」——根因是 gateway 未配置 CORS 头，5173 跨端口访问 8787 被浏览器拦截，UI 兜底文案误导。已给 gateway 加 **dev 模式 CORS 白名单**（仅未设置 `GATEWAY_AUTH_TOKEN` 时生效；白名单 `http://127.0.0.1:5173` / `http://localhost:5173`，OPTIONS 预检 204；生产带 token 不回跨域头），代码 + 定向单测 33/33 + doc-lint 0/0，见 `docs/plans/2026-09-05-gateway-cors.md`。故「浏览器只开 5173、UI 自动连 8787」在 dev 模式下**现在才真正成立**；E340 冒烟正好用此路径复验。手动复验步骤与 E340 相同（两终端 + 5173 提问），另确认网络面板无 CORS 红条。
- **E342（本会话追加，owner 方向 A）**：实测「FreeRTOS 的软件架构思维导图？」回复差——被当普通知识问答且合成超时只回摘要。已实现**内容型思维导图**：识别「主题的软件架构/结构思维导图？/把 X 做成思维导图（无自带大纲）」→ 检索 → 合成只出层级大纲（`outlineOnly`，短输出规避 18s 一段式超时）→ 先交付大纲文字讲解 + 挂「生成 .xmind」低风险 ¥0 裁决卡（resume=pm_xmind + 完整大纲，批准自动落盘）；超时/失败不挂卡给「切更快档位 / 直接给大纲」引导。代码 + 定向单测 126/126 + pipeline 70/70 + routing-enum 1/1 + doc-lint 0/0，见 `docs/plans/2026-09-05-xmind-content.md`。

- **E343（本会话追加，owner 方案 B）**：E342 真机冒烟「FreeRTOS 的软件架构思维导图？」仍超时——路由/检索/兜底均正确（trajectory `b08f02bf`：R_XMIND_CONTENT、66 条、带「生成超时/失败」引导），但合成三次精确撞 [P-116] 18s 链总预算强停（`synthesisMs≈18010ms`）。根因：UI 默认携带 `deepseek:medium`（v4-flash）走 18s 链，E342 outlineOnly 只短输出、没放宽预算（与 E283 github-reader 同类）。修复：`src/search/llm.ts` 新增 `createXmindOutlineClient()`（medium v4-flash 不变 + per-call [P-122] 90s，timeoutMs 同步放宽防单 provider 30s 先切链，未配置回落 heavy 链）；`src/search/pipeline.ts` `PipelineDeps` 增 `outlineLlm?` 注入槽，xmind_content（非 confirmResume）合成改走 `deps.outlineLlm ?? createXmindOutlineClient({preferredProvider})`，outlineOnly 复用同一 `contentOutline` 常量；E342 两条 pipeline 用例注入 outlineLlm 保持离线 Fake。build + pipeline 77/77 + llm-registry/llm-client 18/18 + doc-lint 0/0，见 `docs/plans/2026-09-05-xmind-outline-budget.md`。

- **E344（本会话追加，owner 方案 2）**：E343 真机已能完成大纲合成（88s、deepseek→minimax 兜底），但 owner 实测「把嵌入式产品开发的全流程做成思维导图：…」反馈“并不是一个思维导图，最多算是总结步骤”——正文整段贴 40+ 行大纲把 ⏸ 卡压没，且 pending resume 夹带重复中心主题 + 文末“（证据未覆盖…）”杂质，批准生成的 .xmind 会带垃圾节点。修复：`pm-xmind/format.ts` 新增 `sanitizeOutlineTree()`（去重复主题/文末注释叶子）与 `buildOutlinePreviewText()`（紧凑预览）；`pipeline.ts` E342 块正文只回紧凑预览 + ⏸ 卡、resume 存清洗后规范大纲；`s5_synthesize.ts` outlineOnly 禁文末说明并跳过 readinessGap 注入。build + pipeline/s5/pm-xmind 定向 105/105 + doc-lint 0/0，见 `docs/plans/2026-09-05-xmind-delivery-clean.md`。

- **E345（本会话追加，owner 方案 A）**：owner 问「思维导图能在面板上显示吗？」——右栏产物区双击 `.xmind` 此前报「不支持预览二进制文件」（读回能力只在 E340 对话路径里）。已打通面板 `.xmind` 只读预览：`src/gateway/files.ts` 抽公共 `resolvePreviewPath`/`statPreviewFile`（E337 文本预览复用同口径、行为不变）+ 新增 `readXmindFilePreview()`（zip 需整体解包，超 [P-151] 拒绝不截断；pm-xmind `parseXmindBuffer` → `treeToOutlineText` 回中心主题 + WBS 大纲）；`src/gateway/app.ts` 预览路由按 `.xmind` 扩展名分发（损坏/超大 415，文案区分「不是可读的 .xmind 文件 / 文件过大，不支持预览」）；`App.tsx` 预览卡 `.xmind` 前缀「思维导图 · 大纲 ·」。build + files/gateway 定向 38/38 + UI build + doc-lint 0/0，见 `docs/plans/2026-09-05-xmind-panel-preview.md`。

- **E346（本会话追加，owner「如何在面板显示思维导图」）**：E345 复验通过后，把 `.xmind` 预览从文本大纲升级为可视化树状导图——`files.ts` 预览成功结果增 `tree?: MindNode`（xmind 直接把 pm-xmind 解析树带回，无二次解析）；新增 `ui/prototype/src/MindMapPreview.tsx` 纯 React + SVG 横向树布局（根在左、分支向右、一级分支 8 色、贝塞尔连线、标题截断 + tooltip、>320 节点自动退大纲）；`App.tsx` 预览卡带树时渲染组件（缺省导图，工具栏可切「大纲」）；`styles.css` 补 `.mindmap-*` 样式。build + files/gateway 定向 38/38 + UI build + doc-lint 0/0，见 `docs/plans/2026-09-05-xmind-panel-map.md`。

- **E347（本会话追加，owner「想在中间面板看到思维导图」）**：E346 复验后右栏太小看不到全图，已加「在中间打开 ↗」——右栏预览卡工具栏新按钮，点击后在屏幕中央弹大窗口看整张导图：默认「适应窗口」自动把全图缩到一屏（SVG viewBox 等比缩放不糊），可 100% / ±缩放，放大后可双向滚动；保留「导图 / 大纲」切换；Esc 或 ✕ 关闭。代码：`MindMapPreview.tsx` 导出布局/常量并加 `onOpenLarge`；新增 `MindMapLarge.tsx`（ResizeObserver 量容器 + fit 缩放）；`App.tsx` `mapLarge` state + 弹层；`styles.css` 补样式。UI build 绿 + 后端回归 38/38 + doc-lint 0/0，见 `docs/plans/2026-09-05-xmind-map-large.md`。

- **E348（本会话追加，owner「要以问题回复方式显示，不是弹一张图片」）**：聊天回复内嵌思维导图——`files.ts` 预览端点放开沙箱根内绝对路径（回执里的 `M:\…\outputs\pm-xmind\*.xmind` 可直接读回，根外仍拒绝）；`MindMapPreview.tsx` 改自适应缩小（固定 320px 滚动区 + ResizeObserver + viewBox 等比缩放，整图一屏可见）；新增 `XmindBubble.tsx` 消息内嵌卡片；`App.tsx` `extractXmindPaths()` 从回复文本找 `.xmind` 路径并渲染（最多 3 个），卡片可切「大纲」、可「在中间打开」放大。UI build 绿 + 后端回归 38/38 + doc-lint 0/0，见 `docs/plans/2026-09-05-xmind-reply-inline.md`。

- **E349（本会话追加，owner「还是要一张图，不能全屏缩放」）**：E347/E348 交付后 owner 反馈——把图搬到中间/内嵌后仍是一张静态图，回复栏里不能放大、不能全屏/缩放。已把思维导图收敛为**可交互查看器**：抽公共布局纯函数 `mindMapLayout.ts`（layoutTree/countNodes/8 色分支/320 节点上限）供查看器与预览共用；新增 `MindMapViewer.tsx`——导图/大纲切换、ResizeObserver 量容器、缩放（适应/100%/±/Ctrl+滚轮，0.08–5）、视口双轴滚动、原生全屏（:fullscreen 视口 flex 撑满并随容器重测自动适应）；聊天回复内嵌 `XmindBubble` 与右栏 .xmind 预览统一渲染同一组件，E347 弹层入口移除；styles.css 增 `.mmv-*`、清同批次 E346/E347 遗留的 `.mindmap-*`/`.map-large-*` 死块。零新依赖。UI build 绿 + doc-lint 0/0，见 `docs/plans/2026-09-05-xmind-viewer-interactive.md`。

- **E350（本会话追加，owner 选定 A）**：§4.1.2 左栏角色面板落地——新增只读 `GET /api/agents`（预置子 Agent 注册表 7 个 + configs/mcp-agents.json 接入状态合并，返回类别/可用态，占位不冒充可用）；`RolePanel` 左栏（`.role-v2`）接真实目录：当前模式/子模式标签 + 按模式列角色（工程=老板/产品经理/项目经理/系统架构师、知识=老专家、生活=贴身女秘书，submode 命中高亮）、子 Agent 按 EDA/结构/编码/仿真/构建/系统控制分组带 可用/未接入、Skill 显示启用/总数 + 前 10 已启用 + 管理入口，gateway 未连兜底文案；l0 导航 Users 开关 + `.shell-v2.role-open` 四列网格收起展开。代码 + 定向单测（app 35/35）+ UI build 绿 + doc-lint 0/0，见 `docs/plans/2026-09-05-role-panel.md`。

## 今日手动验收记录（owner 操作）

- E340 真实 UI 冒烟：**待 owner 验收**（下次继续的第一件事，步骤见下）。
- E341 复验：**owner 已通过 2026-09-05**（5173 提问正常回复）。
- E342/E343：**E343 已真机生效 2026-09-05**——大纲合成 88s 完成（deepseek→minimax 兜底）；但交付形态暴露 E344（长文把卡压没 + resume 杂质），**E344 修复后待 owner 复验**（步骤见下建议 4）。
- E345 面板 `.xmind` 双击预览：**待 owner 复验**（步骤见下建议 6）。
- E335–E350 统一提交：**待 owner 拍板**（当前不自动 commit）。
- E350 左栏角色面板：**owner 基本通过 2026-09-05**；复验中发现输入框长内容不可滚动/看不到底部——已追加小修（见下），待复验步骤见建议 11/12。
- E349 可交互查看器：**待 owner 复验**（步骤见下建议 10）。

## 下次继续建议顺序

1. **owner 手动复验 E340**（两个终端）：
   - 终端一：`npm run gateway`（后端 8787，保持运行）
   - 终端二：`npm --prefix ui/prototype run dev`，浏览器打开 `http://127.0.0.1:5173`
   - 聊天输入（第一行中心主题 + WBS/缩进/`-` 列表）如：
     ```
     帮我把下面做成思维导图：
     硬件项目计划
     1. 系统设计
     1.1 需求分析
     1.2 总体方案
     2. 硬件设计
     ```
   - 预期：出低风险 ¥0 confirm 卡 → 点批准 → 回复带大纲预览；右栏出现 `outputs/pm-xmind/pm-xmind-MMDD-HHmmss.xmind`；用 Xmind 打开核对结构。
   - 读回：拖 `.xmind` 附件进对话，或输「读取 outputs/pm-xmind/xxx.xmind 的大纲」→ 批准后回文本大纲。
2. 验收通过后：owner 明确再执行统一提交 E335–E348（禁止自动 commit）。
3. Azure 注册仍延后（owner：「先暂停，一时半会都搞不了」）。
4. **owner 手动复验 E344**（两终端同上）：① 先在右侧裁决「取消」旧卡 `0daa7460`（其 resume 为旧杂质版）；② `Ctrl+C` 重启 gateway 载入 E344；③ 5173 问「把嵌入式产品开发的全流程做成思维导图：…」——预期只回紧凑预览（中心主题 + 7 个一级分支含子项数 + 节点数）+ 「⏸ 生成 .xmind」低风险 ¥0 卡（卡直接可见，不再被长文压没）→ 点批准 → 右栏产物区出现 `outputs/pm-xmind/pm-xmind-*.xmind`，用 Xmind 打开核对：无重复中心主题、无“证据未覆盖”垃圾节点；④ 顺验「把这段大纲做成思维导图：1. 系统设计\n1.1 …」仍走直接生成（E340）、咨询句「Xmind 怎么用」仍走知识问答；⑤ 内容型（E342 问法如「FreeRTOS 的软件架构思维导图？」）也应出紧凑预览 + 卡。
5. 未做/挂起项同 09-04 交接尾部；PM 角色后续如需更丰富的 Xmind 模板/主题/子图支持再立小轮。
6. **owner 手动复验 E345**（两终端同上，建议 4 之后）：重启 gateway 载入 E345（Ctrl+C 后 `npm run gateway`），右栏双击 `outputs/pm-xmind/pm-xmind-*.xmind`（或先复验 E344 批准生成的产物）——预览卡应显示中心主题 + `1 / 1.1 / 2` 编号大纲并标「思维导图 · 大纲 ·」；顺验损坏 `.xmind`（记事本改名伪 zip 放入 projects）双击报「不是可读的 .xmind 文件」、文本预览（.txt/.md/.kicad_sch）不受影响。
7. **owner 手动复验 E346**（两终端同上）：重启 gateway 载入 E346 后，右栏双击 `.xmind`——预览卡应直接显示可视化导图：中心主题在左（蓝底白字），一级分支按不同颜色向右展开、有曲线连线，可横向拖动看完整；顶部工具栏可点「大纲」切回文本、「导图」切回图形；超 320 节点的大文件会自动退大纲并提示（不卡界面）。
8. **owner 手动复验 E347**（两终端同上）：重启 gateway + 刷新 5173 页面后，双击 `.xmind` 出预览 → 点预览卡里的「在中间打开 ↗」——屏幕中央应弹出大窗口，整张导图默认自动缩到一屏可见（不用再上下左右拖找全貌）；想放大看细节点 ＋，放大后窗口内可拖动；点 − / 100% / 适应可回缩；顶部可切「大纲」；Esc 或右上 ✕ 关闭回原界面。
9. **owner 手动复验 E348**（两终端同上）：重启 gateway + 刷新 5173 后，重新走一次「把这段大纲做成思维导图：… → 批准」——批准后的执行回执气泡内应直接出现思维导图卡片（自适应缩到消息里整图可见），点「大纲」可切文字、点「在中间打开」可放大；顺验在聊天里问「读取 outputs/pm-xmind/xxx.xmind 的大纲」的回复也会内嵌卡片；旧消息不回溯，只对新回复生效。
10. **owner 手动复验 E349**（两终端同上，取代 8/9 里的「在中间打开」描述）：重启 gateway + 刷新 5173 后，重新走「把这段大纲做成思维导图：… → 批准」或右栏双击 .xmind——回复气泡/预览卡内直接是可交互导图：默认整图一屏可见；点「+」放大后视口可上下左右滚动，点「− / 100% / 适应」可回缩；Ctrl+滚轮可缩放；点「全屏」进浏览器全屏、视口撑满可继续缩放滚动，Esc/✕ 退出。
11. **owner 手动复验 E350**（两终端同上）：刷新 5173 后左栏应直接出现「角色面板」——当前模式「工程开发」，角色列老板/产品经理/项目经理/系统架构师；「子 Agent」按类别列出 KiCad/Altium/FreeCAD/Keil/Cursor/LTspice/Windows（真实接入状态随 configs/mcp-agents.json，未配置即「未接入」）；「Skill」显示启用/总数与已启用名单；点 l0 导航 Users 图标可收起/展开；切到知识/生活模式角色随之变化；关掉 gateway 刷新则显示「未连接 gateway」提示而非假数据。
12. **owner 复验 E350 追加小修（输入框自动增高 + 滚动）**：刷新 5173 后在输入框逐行回车或粘贴长内容——输入框随内容自动长高，最多约 7 行（≈148px）；继续输入超过 7 行后右侧出现纵向滚动条可滚到底部（不再需要靠鼠标滚轮“越框看字”）；发送后自动回到最小高度；消息区/左栏布局不回退。
13. **owner 手动复验 E351**（两终端同上）：`Ctrl+C` 重启 gateway 载入 E351 后，5173 里粘贴一张截图并问「分析图片内容？」——预期不再回「⚠️ 置信度仅 0.200…系统在处理您的请求时遇到了一点小问题」兜底，而是 ~10s 内正常返回图片描述；顺验「提取这张图的主色/色号」也能出颜色结果；若回兜底，看 gateway 终端错误（应为非「VLM 返回空内容」的其他真实错误，便于继续定位）。
