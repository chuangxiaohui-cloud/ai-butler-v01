# 推进计划：安装软件驱动职业画像

> 日期：2026-09-12 · 分支：v0.2b · 状态：已完成

## 目标

落实 §3.2–§3.3 的最小闭环：发现 Windows 已安装软件，确定性生成职业身份建议并持久化；自动画像可随软件变化更新，用户手工画像不得被静默覆盖。

## 计划

1. 为软件清单归一化、职业身份推导与 Windows 注册表输出解析补单测
2. 扩展 `UserContextStore` 画像字段和迁移逻辑，补手工画像优先级测试
3. 增加只读扫描 CLI，更新目录文档、附录 A 与每日交接

**验收标准**

- 相同软件清单产生稳定、去重的职业身份建议
- 自动画像随扫描结果更新；显式保存的手工职业身份保持不变
- 旧数据库可无损补列，软件清单与建议可往返持久化
- `npm run build`、相关定向单测通过；不运行端到端或 bench

## 执行过程

### 改动

- `src/memory/software-profile.ts`：Windows 注册表只读发现、GB18030 解码、软件名归一化及两类职业身份确定性推导。
- `src/memory/user-context-store.ts`：画像表新增软件清单、建议身份、身份来源，含旧库迁移；自动画像可更新，手工画像优先。
- `scripts/profile-software.ts` / `package.json`：增加显式扫描与 dry-run 命令。
- 需求附录 A、目录文档、AGENTS 与每日交接同步登记 E365。

### 遇到的问题

- 首次本机 dry-run 暴露 `reg.exe` 输出不是 UTF-8，中文软件名出现乱码；改为按 Windows 中文代码页兼容的 GB18030 解码后复验正常。

## 结果

- 验证：`npm run build` 通过；`node --test dist/memory/user-context-store.test.js` 8/8；`node --import tsx --test tests/integration/user-context-store.test.ts` 1/1；`git diff --check` 无空白错误。
- 文档：`npm run doc-lint` 的 C1–C6/C8 通过，仍被存量 C7 阻断（第 19 行示例 `provisional@2026-08-13` 超期），本项未改参数状态。
- 本机只读冒烟：460 项软件，命中 Altium/Cadence/Keil/KiCad/LTspice/嘉立创EDA，建议「嵌入式电子产品开发工程师」，dry-run 未持久化。
- 测试：定向单测 8/8；未跑集成全量、E2E 或 bench（成本纪律）。
- 提交：未提交 · 推送：未推送。
- 遗留事项：启动时自动扫描未接入；当前必须由用户显式运行 CLI，避免未确认的启动期画像变更。
