# 推进计划：人类裁决批准/否决面板（§2.3 记录侧回填，E323）

> 日期：2026-09-03 · 分支：v0.2b · 状态：已完成
> 承接：`docs/2026-09-03-progress-handoff.md`「后续候选 E309-后：confirm 阻断式 + 批准/否决面板」；owner 拍板先做**非破坏记录侧**（decision-log 已有 pending → UI 面板 + 裁决回填），不做 confirm 真阻断语义（待后续轮，需真实 confirm 阻断与成本提示时再做）。
> 前置：E309 已落地 `src/escalation/decision-log.ts`（append-only `data/decision-log.jsonl`），`option_clarify|must_clarify` 记 `human_arbitration/pending` 并同步发「待你裁决」通知（E315）；缺口是「人类答复批准/否决未回填」。

## 目标

§4.1 UI 阶段第一刀：桌面端右栏新增「裁决」页，列出 decision-log 中仍 pending 的待裁决项；owner 在面板上点「批准/否决」（可选填备注）→ 回填为裁决记录。**遵守 append-only 纪律**：不改写原 pending 行，而是追加一条 `decision=approve/reject` 且带 `refId` 指向原行的裁决事件；UI「open 队列」由聚合推导（pending 且未被裁决事件引用）。

## 计划

1. `src/escalation/decision-log.ts`：`DecisionLogEntry` 增可选 `refId`（裁决事件指向被裁决的 pending 行，不改写原行）；新增 `openDecisions()`（pending 且无 `refId` 引用 → 待裁决队列，保持 append 顺序）与 `adjudicate(id, decision, input)`（追加裁决事件：复制 question/options/confidence/conversationId + `refId` + 可选 note；返回 `{ok,entry}` 或 `{ok:false, reason:'not_found'|'already_decided'}`）。
2. `src/gateway/app.ts`：`GatewayOptions` 增 `decisionLog?` 注入（测试隔离，缺省共享真实 `data/decision-log.jsonl`）；新增 `GET /api/decisions`（只读，返回 open 待裁决队列）与 `POST /api/decisions/:id`（写端点挂 `requireGatewayAuth`，body `{decision:'approve'|'reject', note?}`，400 非法/404 未找到/409 已裁决）。
3. `ui/prototype/src/App.tsx`：右栏 Tab 增「裁决」（Gavel 图标）；新增裁决面板——可见时拉取 + 30s 轮询 + 手动刷新，每张卡片渲染 question/options/触发源/时间/置信度 + 备注输入 + 批准/否决按钮，POST 成功后刷新队列并在工具栏给一次性提示；空态与网关不可达提示。`styles.css` 增最小卡片样式。
4. 测试：`decision-log.test.ts`（openDecisions 聚合 / adjudicate 追加成功 + not_found + already_decided + 不改写原行）；`gateway app.test.ts`（GET 返回 open 队列 / POST 批准后 open 减少且追加含 refId / 400/404/409）。
5. 文档：计划完成后登记需求文档附录 A E323 + 更新 `docs/directory-structure.md` gateway 端点表与 `docs/code-directory.md` UI 行、当天 `progress-handoff.md` 链接。

**验收标准**

- `npm run build` 绿；decision-log + gateway 定向单测全绿；`npm --prefix ui/prototype run build`（vite + tsc）绿。
- 追加的裁决事件含 `refId`、原 pending 行未被改写（append-only 断言）；同一 pending 二次裁决返回 already_decided。
- `GET /api/decisions` 只读无鉴权、`POST /api/decisions/:id` 挂 `requireGatewayAuth`（无 token dev 放行，与既有写端点一致）。
- `npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（零成本）。不跑全量 `test:all` / 不跑 bench / 不做 e2e（成本纪律）。

## 执行过程

### 改动

- `src/escalation/decision-log.ts`：`DecisionLogEntry` 增可选 `refId`；新增 `AdjudicateInput`/`AdjudicationDecision`/`AdjudicateResult`、`openDecisions()`（pending 且未被 `refId` 引用 → 队列）、`adjudicate(id, decision, input)`（追加裁决事件：复制 question/options/confidence，`refId` 指向原行，不改写原 pending 行；not_found/already_decided 区分）。
- `src/escalation/decision-log.test.ts`：新增 1 条 E323 用例（队列聚合顺序 / adjudicate 含 refId 自描述 / 原行仍 pending / 二次裁决 already_decided / 不存在与 escalate 行 not_found / 会话与备注显式覆盖 / 队列清空）。
- `src/gateway/app.ts`：`GatewayOptions` 增 `decisionLog?`；`GET /api/decisions`（只读，返回 `{open}`）+ `POST /api/decisions/:id`（`requireGatewayAuth`，400/404/409，返回 `{ok,entry}`）。
- `src/gateway/app.test.ts`：新增 1 条 E323 gateway 用例（注入临时 decision-log：GET 排除 escalate 与已裁决 / POST 批准后队列收缩且事件含 refId+note / 400 非法 decision / 404 不存在 / 409 二次提交 / escalate 不可裁决）。
- `ui/prototype/src/App.tsx`：右栏 Tab 增「裁决」（Gavel）；新增 `DecisionPanel`（30s 轮询 + 刷新，卡片 question/options/触发源/会话/置信/时间 + 备注输入 + 批准/否决 → POST 后刷新）；常量 `DECISION_TRIGGER_LABELS`/`DecisionPanelEntry`。
- `ui/prototype/src/styles.css`：增裁决卡片最小样式（`decision-card/head/options/meta/bar/note/btn approve/reject`）。
- 文档：`docs/directory-structure.md` gateway 端点表 + `docs/code-directory.md`（escalation 行补 E323、UI 行补「裁决」页）+ 需求文档附录 A E323 登记。

### 遇到的问题

- `req.params.id` 类型为 `string | string[]`（express 类型），build 报 TS2345 → 收窄为 `typeof rawId === 'string' ? rawId : ''`。
- Windows 下 `apply_patch` 包装为 .bat，参数多行补丁经管道/批处理会丢失换行 → 直接调用底层 `codex.exe --codex-run-as-apply-patch` 传单参数成功。

## 结果

- 验证：`npm run build` 绿；decision-log 3/3 + gateway 26/26 定向单测全绿；`npm --prefix ui/prototype run build`（tsc + vite）绿；`npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）。
- 能力：右栏「裁决」页列出 pending 待裁决项，owner 点批准/否决（可填备注）→ 记录侧回填（append 裁决事件，原 pending 行不改写）；confirm 真阻断语义未做（按拍板留后续轮）。
- 遗留：owner 手动验收已通过（2026-09-03，浏览器 gateway + 预置测试数据走「裁决」页，批准/否决回填正常，见 `docs/2026-09-03-progress-handoff.md` 追加轮 4）；confirm 阻断式 + 成本提示待后续轮。
- 提交：未提交（延续工作区待统一确认批次）。
- 提交：未提交（延续工作区待统一确认批次）。
