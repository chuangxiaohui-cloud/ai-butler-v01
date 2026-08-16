# 推进计划：技能库设置接真实数据（E112）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

把设置面板“技能库”从 mock 升级为真实数据：列出 19 项 Skill 与触发词，支持
启用/禁用并持久化到 `data/skills-config.json`；pipeline 执行时跳过被禁用的技能。

## 计划

1. 新增 `src/config/skills-config.ts`：读写禁用 Skill 列表。
2. registry 新增 `isSkillEnabled()` / `listSkillMetadata()`；
   pipeline 直接 Skill 执行与 `findBest` 注入都跳过禁用项。
3. gateway 新增 `GET /api/skills`、`POST /api/skills/sync`。
4. UI 技能库显示真实列表与触发词，支持启用/禁用、按类别筛选。
5. 补测试、登记需求文档（§13 / 附录 A E112），更新交接，提交推送。

**验收标准**

- `/api/skills` 返回 19 项真实 Skill 与 enabled 状态。
- sync 写入禁用列表后，pipeline 不再执行被禁用 Skill。
- UI 卡片切换开关后状态持久化并刷新。

## 执行过程

### 改动

- 新增 `src/config/skills-config.ts` 与 `skills-config.test.ts`。
- `src/skills/registry.ts`：`isSkillEnabled()` / `listSkillMetadata()`。
- `src/skills/lifecycle.ts` + `src/search/pipeline.ts`：跳过禁用 Skill。
- `src/gateway/app.ts`：`/api/skills` 两接口。
- `ui/prototype/src/App.tsx` + `styles.css`：技能库真实卡片 + 开关 + 类别筛选。
- `src/gateway/app.test.ts`：skills 目录与非法禁用名单测试。

## 结果

- 验证：主项目与 UI `npm run build` 通过；`npm run test:all` 单测 325/325 +
  集成 17/17 全绿；doc-lint 0 FAIL / 0 WARN。
- 提交：E112 已提交并推送 Gitee/GitHub。
- 遗留：记忆管理 / Token 计量真实 API、artifact 事件流、终端真实执行通道。
