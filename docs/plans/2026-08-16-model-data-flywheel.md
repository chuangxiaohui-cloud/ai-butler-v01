# 推进计划：模型路由数据飞轮 + UI 目录接入（E105）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成
> 来源：OpenSquilla 借鉴审阅（E103）第 2/3 项落地。

## 目标

把模型路由决策（档位 / provider / model / fallback）沉淀为可回放、可校准的数据：
每次 Stage 5 合成成功后写入 trajectory 的 `model_route` 事件，并回写到
route-case；同时把 Provider Registry 解析结果导出给 UI，模型切换器优先读
registry 目录，缺文件时回落静态列表。

## 计划

1. 客户端可观测：`OpenAiCompatibleClient` 暴露 model/baseUrl；`FallbackLLMClient`
   记录 lastUsedProvider 与 fallback 事件并支持 `describe()`。
2. trajectory 新增 `model_route` 事件类型。
3. route-case-store 新增 `ModelRouteRecord` 与 `attachModelRoute`，audit 统计
   `withModelRoute`。
4. pipeline 捕获 Stage 5 模型路由回调，写 trajectory 并回写 route-case。
5. 新增 `scripts/export-model-catalog.ts` + `npm run model:export`，把当前 .env
   可用 provider 导出到 `ui/prototype/public/model-providers.json`。
6. UI `App.tsx` 启动时读取模型目录，缺失时回落静态列表。
7. 补测试、登记需求文档（§13 / 附录 A E105）、更新 borrowed-designs 与
   progress-handoff，跑 build/test/doc-lint/bench，提交推送。

**验收标准**

- Fallback 链可查询最后使用的 provider/model 与 fallback 序列。
- trajectory 出现 `model_route` 事件；route-case 记录含 `modelRoute`。
- `npm run model:export` 产出 `model-providers.json`；UI 构建通过并优先读它。
- `npm run build`、`npm run test:all`、doc-lint 全绿。

## 执行过程

### 改动

- `src/search/llm-client.ts`：暴露 `model` / `baseUrl` getter。
- `src/search/llm-registry.ts`：`FallbackLLMClient` 记录 `lastUsedProviderId` /
  `fallbackEvents`，新增 `describe()`；chain 显式携带 model。
- `src/trajectory/trajectory-log.ts`：新增 `model_route` 事件与
  `TrajectoryModelRoute`。
- `src/agent/route-case-store.ts`：新增 `ModelRouteRecord`、`modelRoute` 字段、
  `attachModelRoute`；`route-case-audit.ts` 新增 `withModelRoute` 统计。
- `src/search/stages/s5_synthesize.ts`：`onModelRoute` 回调在合成成功后触发。
- `src/search/pipeline.ts`：捕获模型路由信息，写 trajectory + 回写 route-case。
- 新增 `scripts/export-model-catalog.ts` 与 `npm run model:export`；UI 读取
  `ui/prototype/public/model-providers.json`，缺失回落静态列表。
- 新增单测：route-case attachModelRoute、trajectory model_route、s5 路由回调、
  fallback describe。

### 遇到的问题

- Fallback 链需要知道每段的 model：chain 条目显式携带 model，不再依赖
  `instanceof` 反查私有字段。
- UI 缺 `vite-env.d.ts` 导致 `import.meta.env` 类型报错：补上 Vite 客户端类型。

## 结果

- 验证：主项目 `npm run build` 通过；`npm run test:all` 单测 310/310 + 集成 17/17
  全绿；`ui/prototype npm run build` 通过；`npm run model:export` 产出 8 项模型目录；
  `npm run bench:provider-router` 通过（bench:B-20260816-04）；doc-lint 0 FAIL / 0 WARN。
- 提交：E105 已提交并推送 Gitee/GitHub。
- 遗留：UI 模型切换真正“下发”到后端请求需等 gateway 落地；届时模型选择经
  registry 生效并继续进数据飞轮。
