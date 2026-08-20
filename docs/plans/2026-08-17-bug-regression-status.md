# 推进计划：35 条 Bug 状态字段与回归用例

> 日期：2026-08-17 · 分支：v0.2b · 状态：已完成

## 目标

给 `bench/devil-v25/魔鬼训练_系统级故障Bug清单.csv` 的 35 条 Bug 建立状态与回归用例
映射，并补强 C05 打包、C06 README 抓取的真实回归断言。

## 计划

1. 核对 35 条 Bug 与现有测试覆盖，按“路由 24 / JSON 7 / 安全 4”归类。
2. 新建 `bench/devil-v25/bug-regression-status.md`：逐条状态 + 回归用例 + 验证依据。
3. 增强 `src/skills/project-packager/index.test.ts`：验证 zip 内容排除 `.git/node_modules/build`。
4. 增强 `src/skills/github-reader/index.test.ts`：mock fetch 覆盖 README 成功与仓库兜底。
5. 跑 `npm run build` + `npm run test:all` + `doc-lint`，更新交接与计划结果。

**验收标准**

- 35 条 Bug 全部有状态、回归用例、验证依据。
- C05 测试断言压缩包内不含排除目录；C06 测试断言 README 抓取与兜底路径。
- 全量测试通过，`doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- 新建 `bench/devil-v25/bug-regression-status.md`：35 条 Bug 状态与回归用例映射。
- `src/agent/router-v2.test.ts`：新增 BUG-008/015/016/020/023 回归用例。
- `src/search/emergency-reply.test.ts`：新增 `rm -rf` 合规拒绝。
- `src/skills/github-reader/index.test.ts`：新增 README 成功与仓库兜底。
- `src/skills/project-packager/index.test.ts`：zip 内容排除断言。
- `src/search/pipeline.ts`：移除 `pack_project` 提前返回；本地打包 Skill 使用原始 query。
- `src/search/pipeline.test.ts`：新增“项目打包带路径真实执行”回归。

### 遇到的问题

- CLI 实测发现 `pack_project` 被 pipeline 提前短路，带路径也永远只回澄清。
- 二次修复发现 Stage 1 脱敏会剥掉 Windows 反斜杠路径，本地打包 Skill 改用原始 query。

## 结果

- 验证：`npm run build` 通过；单测 357/357 + 集成 17/17 全绿；doc-lint 0 FAIL 0 WARN。
- 真实验证：CLI `打包 M:\202608111\src\wiki` 成功产出 zip；C06 在当前网络下稳定返回仓库链接兜底。
- 提交：未提交。
- 遗留事项：C06 README 成功路径在真实网络可达环境再复测一次；A/B 套评测拆分继续下一步。
