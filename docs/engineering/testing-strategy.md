# 测试策略文档

## 1. 分层

| 层 | 位置 | 运行 | 覆盖 |
|----|------|------|------|
| 单测 | `src/**/*.test.ts` | `npm test`（dist 产物） | 模块级行为、参数、接口 |
| 集成 | `tests/integration/**/*.test.ts` | `npm run test:integration` | 跨模块契约 |
| 全量 | 单测 + 集成 | `npm run test:all` | 发布前门禁 |
| 构建 | `dist/` | `npm run build` | 类型与 ESM 导入 |
| 基准 | `bench/*` | `npm run bench:devil-v25` 等 | 回归质量 |
| 桌面冒烟 | `desktop` | `npm run desktop:smoke` | 拉起 gateway + UI |
| UI 检查 | `ui/prototype` | Vite build + Playwright | 布局、溢出、交互 |

## 2. 当前基线

- 单测：348/348（2026-08-17 收口）。
- 集成：17/17。
- 魔鬼训练：122 条，`bench/devil-v25/`。
- v0.2a 回归：31 条。
- v0.1 基准：10 条。

## 3. 发布门禁

```bash
npm run build
npm run test:all
npm exec tsx scripts/doc-lint.ts
```

涉及行为或参数变更时，先补测试，再跑全量；结果记录到 `docs/plans/`。

## 4. 安全 TDD

已存在：

- `src/security/sandbox.test.ts`
- `src/gateway/terminal.test.ts`
- `src/config/security-config.test.ts`

按需求 §10.4 补齐：越界路径、系统文件读取、危险命令硬编码拒绝、下载并执行、白名单内允许、搜索脱敏。

## 5. Bench 流程

```text
bench:devil-v25
  → worksheet:devil-v25（人工/自动评分）
  → score-sheet:devil-v25
  → baseline:devil-v25（导出新基线 CSV + 摘要）
  → compare:devil-v25（新老对比）
```

评测集拆分（E129）：

```bash
npm run split:devil-ab        # A 套 108 条单发 + B 套 14 条记忆/上下文
npm run bench:devil-v25 -- --set=a
npm run bench:devil-v25 -- --set=b
npm run bench:devil-b         # B 套多轮会话评测（14 场景，人工评分）
```

基准证据进 `bench/`（git 跟踪）；机器轨迹进 `data/`（不提交）。

## 6. 回归纪律

- 修复必须带回归测试，防止同一类问题复发。
- 路由/搜索/记忆/Skill 跨模块变更必须补集成测试。
- 版本收口时把测试报告与性能数据汇入交付期文档。
