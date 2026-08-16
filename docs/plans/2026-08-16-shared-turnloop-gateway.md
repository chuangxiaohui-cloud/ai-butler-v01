# 推进计划：单一共享 TurnLoop Gateway（E106）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成
> 来源：OpenSquilla 借鉴审阅（E103）第 3 项落地。

## 目标

把「一人公司 AI-Agent」的 CLI 主链路变成唯一 TurnLoop，UI 三栏通过 gateway
调同一个 `answer(query)` 契约；模型选择经 registry 下发到后端请求，CLI / UI /
未来聊天频道行为一致。

## 计划

1. 共享模型目录：`src/config/model-catalog.ts` 供 UI 静态导出与 gateway 动态接口复用。
2. 新增 `src/search/model-id.ts`：解析 UI 模型 id（`<provider>:<role>`）。
3. `PipelineOptions` 增加 `modelSelection`，Stage 5 按用户选择覆盖档位与 provider。
4. 新增 `src/gateway/app.ts`：Express 应用，`POST /api/ask` / `GET /api/health` /
   `GET /api/model-providers`；错误不向客户端泄露原始细节。
5. 新增 `src/gateway/server.ts`：复用 CLI 同款依赖，默认监听 `127.0.0.1:8787`。
6. UI `send()` 改走 `/api/ask`，失败回落本地演示草稿；模型切换器发送 modelId。
7. 补测试、登记需求文档（§13 / 附录 A E106）、更新 borrowed-designs 与
   progress-handoff，跑 build/test/doc-lint，提交推送，启动 gateway 供联调。

**验收标准**

- `/api/ask` 返回 `answer(query)` 四字段契约；空 query 返回 400 且无原始错误。
- UI 输入经 gateway 调用同一 pipeline，证据链与后端证据映射。
- 模型选择（如 `zhipu:heavy`）能覆盖 Stage 5 档位/provider。
- 主项目与 UI 构建、全量测试、doc-lint 全绿。

## 执行过程

### 改动

- 新增 `src/config/model-catalog.ts`：`buildModelCatalog()` 只导出聊天三档
  （light/medium/heavy），`scripts/export-model-catalog.ts` 改为调用它。
- 新增 `src/search/model-id.ts`：`parseModelId`。
- `src/search/pipeline.ts`：`PipelineOptions.modelSelection` 覆盖档位/provider；
  `s5_synthesize.ts` 新增 `preferredProvider`。
- 新增 `src/gateway/app.ts` + `src/gateway/server.ts` + `npm run gateway`；
  `.env.example` 补 `GATEWAY_HOST/GATEWAY_PORT/VITE_GATEWAY_URL`。
- UI `App.tsx`：`send()` 优先 POST `/api/ask`，失败回落 `ReplyDraft`；图片仍走
  本地演示草稿（文件管道待 gateway 附件接口）。
- 新增 `src/gateway/app.test.ts`（4 条）与 `model-id` 单测。

### 遇到的问题

- 无搜索 provider 时合成走兜底，gateway 测试拿不到 LLM 答案：测试补 FakeProvider
  后走到真实合成路径。
- UI 目录改为只含聊天三档（6 项），避免把视觉档当聊天模型切换。

## 结果

- 验证：主项目 `npm run build` 通过；`npm run test:all` 单测 316/316 + 集成 17/17
  全绿；UI `npm run build` 通过；`npm run model:export` 产出 6 项；doc-lint
  0 FAIL / 0 WARN。
- 提交：E106 已提交并推送 Gitee/GitHub。
- 联调：gateway 已启动于 `http://127.0.0.1:8787`，UI 可在 `http://127.0.0.1:5173/`
  直接提问。
- 遗留：`/api/ask` 附件（图片/文件）接口、三栏 → 主镜片映射、streaming 为下一步。
