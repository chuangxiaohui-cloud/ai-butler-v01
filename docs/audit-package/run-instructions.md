# 交付包运行验证说明

> 环境准备：复制 `.env.example` 为 `.env` 并填入真实 key（`.env` 不入包）；`npm install`（根目录）与 `npm --prefix desktop install`（桌面壳）。

## 基线验证（交付前全绿）

```bash
npm run build          # TypeScript 构建到 dist/
npm run test:all       # 单测 + 集成（先 build，因为单测运行 dist/）
npm run doc-lint       # 需求文档全量验收，0 FAIL 0 WARN
```

## 冒烟验证

```bash
npm run gateway        # TurnLoop gateway，默认 http://127.0.0.1:8787
npm run desktop:smoke  # 桌面壳冒烟
npm run search:smoke   # 10 条基准 query 双引擎冒烟（WP4 验收）
npm run classify:smoke # 意图分类冒烟
npm run tavily:smoke   # Tavily 触发冒烟 + 配额监控（需 TAVILY_API_KEY；月度配额 1000 耗尽时 9/1 重置后复跑）
npm run bench:devil-v25  # 122 条回归基准（耗时长，按需）
```

## 冒烟通过标准（§6.1 摘要）

- 无报错退出（exit 0，无未处理异常）
- 响应时间在对应场景 §5 预算内
- 输出「可用」判定锚定需求文档：answer 四字段契约（answer/confidence/evidence/gate_triggered）+ §6.5 fact_consistency + §6.6 置信度门控 + §6.1.3 关键词兜底
- Token 消耗对照 `data/usage.jsonl` 基线 ±30%
- 降级/兜底路径有明确用户提示；至少 1 条用例故意触发降级

## 已知缺口（诚实声明，详见 `docs/audit-package-checklist.md` §8）

- 无独立 E2E 套件（desktop:smoke 代替）；OpenAPI 待生成
- memory-core 为外部依赖；UI 组件未拆分