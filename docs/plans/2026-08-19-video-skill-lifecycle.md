# 推进计划：视频 Skill 自动接入生命周期（E149）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

`video-learner` 生成 Skill JSON 后，同步写入 ExperienceManager，
让后续同类问题能通过经验检索自动触发，不再只是落盘文件。

## 计划

1. `SkillDeps` 增加可选 `experienceManager`。
2. pipeline 执行 Skill 时注入项目级 `experienceManager`。
3. `video-learner` 生成 Skill 后调用 `add`。
4. 补单测与交接记录。

## 执行过程

### 改动

- `src/skills/deps.ts`、`src/search/pipeline.ts`、`src/skills/video-learner/index.ts`、测试。
- `src/skills/video-learner/index.test.ts` 新增断言：生成 Skill 后经验库写入成功。

## 结果

- `SkillDeps` 新增可选 `experienceManager`，pipeline 执行 Skill 时注入项目级实例。
- `video-learner` 生成 Skill JSON 后调用 `experienceManager.add`，回答中追加“已接入经验库”。
- 编译与全量测试通过：`npm run build` 成功，单测 440/440 + 集成 17/17。
- 需求文档附录 A 已登记 E148/E149；本文档收尾后 `doc-lint` 重新验收。
