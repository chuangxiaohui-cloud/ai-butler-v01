# 推进计划：Skill 级“生成中”状态（E120）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

把“生成中”细化到 Skill 级：pipeline 执行 Skill 前发布 `generating`、完成后发布
`done/failed`（可带产物路径），gateway 经 SSE 广播 `artifact` 事件，UI 文件列表
实时显示对应 Skill 的生成中条目，完成后消失。

## 计划

1. `PipelineOptions` 增加 `onArtifact` 回调（generating/done/failed + path）。
2. pipeline 直接 Skill 路径：执行前发 generating，成功后解析产物路径发 done，
   失败发 failed。
3. gateway `/api/ask` 把 artifact 事件发布到 SSE。
4. UI EventSource 监听 `artifact`，文件列表顶部显示生成中 Skill 行。
5. 补测试、登记需求文档附录 A（E120），更新交接，提交推送。

**验收标准**

- Skill 执行时先收到 `generating`，结束后收到 `done/failed`。
- 带文件路径的输出能提取 path（zip/kicad_sch/net/pdf/html/md/txt）。
- UI 文件列表在 Skill 执行期间显示“生成中”行。

## 执行过程

### 改动

- `src/search/pipeline.ts`：`onArtifact` + `extractArtifactPath`。
- `src/gateway/app.ts`：发布 `artifact` SSE 事件。
- `ui/prototype/src/App.tsx` + `styles.css`：生成中行。
- 测试：pipeline onArtifact、gateway artifact 事件、FakeLLM 日程分支。

## 结果

- 验证：主项目与 UI `npm run build` 通过；`npm run test:all` 单测 339/339 +
  集成 17/17 全绿；doc-lint 0 FAIL / 0 WARN。
- 提交：E120 已提交并推送 Gitee/GitHub。
- 遗留：桌面端封装。
