# 推进计划：市场 Skill 触发词自然问法扩展（E305）

> 日期：2026-09-01 · 分支：v0.2b · 状态：完成（E305）
> 关联：`docs/reports/v1-acceptance-delta-2026-09-01.md`（复用率根因观察）/ owner 指令 2026-09-01「1」（扩充高频市场 Skill 触发词）

## 目标

复用率（§12.4，目标 60%，当前 18.6%）根因观察确认：市场路由上线（E243，08-26）后，唯一明确触发缺口 = 「日报 模板 / 周报 模板」带空格自然问法不命中「日报模板」触发词（`cleanQuery` 只折叠多空格、不删单空格）。本次给 `docx-write` 补自然问法触发词，并补防误触单测（E301 有「搜周报」误触发先例）。

## 计划

1. `configs/market-skills/docx-write/manifest.json` 触发词补：`日报 模板` / `周报 模板` / `生成 日报` / `生成 周报` / `写日报` / `写周报`（均 ≥3 字，直连路由下仍生效）。
2. 重装 `docx-write` 更新运行时副本 `data/market-skills/docx-write/manifest.json`（append-only 安装记录，最新状态生效）。
3. 测试：nl-router 命中/防误触 + pipeline 市场触发直连。
4. 文档：附录 A E305、handoff、本计划。

**验收标准**

- `npm run build` 绿；nl-router + pipeline 相关单测全绿；`npm run doc-lint` 0 FAIL 0 WARN。
- 「日报 模板」「帮我写日报」「生成 周报」命中 docx-write；「搜周报的邮件」不被 2 字「周报」抢占（E301 回归）；「如何解析 PDF datasheet 表格」不误触。

## 执行过程

### 改动

- `configs/market-skills/docx-write/manifest.json`：触发词 +6（自然问法带空格 + 写日报/写周报）。
- `data/market-skills/docx-write/manifest.json`：重装同步（运行时）。
- `src/skills/market/nl-router.test.ts`：+4 单测（命中 2 / E301 回归 1 / 防误触 1）。
- `src/search/pipeline.test.ts`：+1 单测（「日报 模板」→ docx-write 市场触发）。
- 附录 A E305；`docs/2026-09-01-progress-handoff.md` 第 8 节。

### 遇到的问题

- 首个 pipeline 测试 query「帮我生成 日报 模板」触发「文档方向澄清」分支（product_manager/plan/architect 三选一），走不到市场路由——改为裸问法「日报 模板」（与 E301 测试同风格）后通过。
- 数据校正：初版根因观察误把 8-15~18 的搜索样例（早于市场路由上线）归因为「触发词窄」——已按「路由上线后（08-27+）」口径重析，明确缺口仅日报/周报 模板带空格一类；datasheet 自然问法因搜索管道已能处理、市场 Skill 输入为整句 query 反降质量，**不扩**（诚实登记）。

## 结果

- 验证：`npm run build` 绿；nl-router+pipeline 69/69；`npm run doc-lint` 0 FAIL 0 WARN。
- 效果：`日报 模板` 等自然问法现可直连 docx-write 生成模板（不再落搜索）；复用率分子后续随真实使用上升。
