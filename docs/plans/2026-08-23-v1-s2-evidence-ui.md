# 推进计划：v1.0 S2 证据链 UI + 深度报告恢复

> 日期：2026-08-23 · 分支：v0.2b · 状态：进行中

## 目标

v1.0 切片第二片（S2）：补上 §9.2 证据链交互（证据可点击验证），并收口 S1 遗留的「深度报告取消/恢复」——取消后再次触发同一问题自动恢复上次已生成分节（状态持久化，§4.3.2 生命周期「取消/恢复」）。

## 计划

1. **深度报告恢复（后端，可测）**：新增 `src/search/deep-report-store.ts`（JSONL 落盘 `data/deep-report-jobs.jsonl`，原子写；job 记录 headings/sections/status/stage/useLlm/证据数）；`generateDeepReport` 支持 `resume`（跳过已生成分节，恢复不重新请求大纲）与 `onSection` 回调（每节生成后落盘）。
2. **pipeline 接线**：deep_report 路径先查同 query 的 cancelled job → 命中自动恢复（进度事件 `report-resumed`）→ 生成中逐节落盘 → 完成 markDone / 取消 markCancelled。
3. **证据链 UI 增强（前端 build 验证）**：`ui/prototype/src/App.tsx` evidence-chip 加点击行为——`search` → 切浏览器面板并导航到来源 URL；`file` → 切文件面板并高亮路径；`terminal` → 切终端面板；`test` → 展开/收起测试详情；配套样式。
4. **登记**：需求文档 E221（§4.3.2 恢复 + §9.2 交互落地）；`docs/code-directory.md`、`docs/directory-structure.md`、handoff。
5. **验收**：doc-lint 0 FAIL 0 WARN + build（主项目 + UI 原型）+ 全量单测/集成全绿。

**验收标准**

- 取消深度报告后，同 query 再次触发：自动恢复上次分节进度，不重复生成已生成分节（LLM 调用数可断言）。
- job 状态落盘可审计：cancelled/done 可在 `data/deep-report-jobs.jsonl` 追溯。
- 证据 chip 可点击：search/file/terminal/test 四类型各有对应 UI 效果；`npm --prefix ui/prototype run build` 通过。
- doc-lint 0 FAIL 0 WARN；单测 + 集成全绿。

## 执行过程

### 改动

- `src/search/deep-report-store.ts`（新增）
- `src/search/deep-report.ts`：`resume` + `onSection`
- `src/search/pipeline.ts`：恢复接线
- `ui/prototype/src/App.tsx`：证据链交互
- 测试：store 5 条 + 恢复 2 条 + pipeline 恢复分发 1 条
- 文档：本计划 + 需求文档 E221 + 目录文档 + handoff

### 遇到的问题

- PowerShell 双引号 `${...}` 插值会破坏模板串，新文件先经 Python 脚本写入再修复（无 BOM UTF-8）。
- `findResumable` 只认 cancelled 状态：恢复完成后旧 job 若不收编会被重复命中 → `start(resume)` 时把旧 job 收编为 done（审计历史保留，不再参与恢复）。
- `usedLlm` 原语义「大纲非空」在恢复场景失真（恢复不重发大纲）→ 改为「实际由 LLM 生成的分节」判定。
- 取消响应原来要等预算耗尽（挂起 LLM 下最长 13s）→ S2 改进为 abort 事件同步 reject，取消立即生效（原有 10s 取消测试降为毫秒级）。

## 结果

- 验证：`npm exec tsx scripts/doc-lint.ts` 0 FAIL 0 WARN（C8 36 key、附录 517/950）；主项目 `npm run build` + UI 原型 `npm --prefix ui/prototype run build` 通过；`npm run test:all` 全绿。
- 测试：单测 699/700（1 skip）+ 集成 15/15；新增 9 条（deep-report-store 5 + deep-report 恢复/回调 3 + pipeline 恢复分发 1）。
- 提交：`（待填）`（E221）+ `（待填）`（handoff 登记）
- 遗留事项：S1 遗留「深度报告恢复」收口完成；剩余切片 S3 MCP 子 Agent、S4 安全模型补齐等按 `docs/plans/2026-08-23-v1-slicing.md` 排期继续；[P-13] 维持 provisional。
