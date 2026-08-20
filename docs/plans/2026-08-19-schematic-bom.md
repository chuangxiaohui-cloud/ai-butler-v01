# 推进计划：生活助手 PDF 原理图 → BOM 表（E136）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

先落地第三点里最典型的高价值场景：用户上传 PDF 电路原理图，Agent 解析元件位号
与参数，去重聚合生成元器件 BOM 表（CSV），并返回文件路径与摘要。Word/Excel/PPT
等其余日常技能留待后续轮次。

## 计划

1. 新增 `src/skills/schematic-bom/`：PDF 文本/OCR → 位号/值/封装提取 → BOM 聚合 → CSV 落盘。
2. 新增 `generate_bom` 意图与 `R_BOM` 路由，文档附件 + BOM 请求走该 Skill。
3. 注册 Skill、执行器、README、测试计数。
4. 补单测：位号解析、同值合并、CSV 生成、无附件/无位号诚实降级。
5. 登记 E136，更新计划结果与当天交接。

**验收标准**

- `R1 10k 0603 / R2 10k 0603 / C1 100nF 0603 / U1 STM32F103 LQFP48`
  聚合为 3 类、4 个元件，R1/R2 合并。
- 无附件时返回“请上传 PDF 原理图”。
- 无位号时返回“未识别到元件位号”，不编造 BOM。
- 主项目 build、单测全绿、doc-lint 通过。

## 执行过程

### 改动

- `src/skills/schematic-bom/index.ts` + 测试。
- `src/agent/intent-feature.ts`、`routing-table.ts`、`executors.ts`、`mode-mapper.ts`。
- `src/skills/registry.ts`、`README.md`、`lifecycle.test.ts`、`registry.test.ts`。

### 遇到的问题

- PDF 原理图的实际版式差异大，当前按“位号 + 值 + 封装”确定性提取；
  扫描件依赖既有 PDF OCR 管道，后续可用 LLM 二次校验型号映射。

## 结果

- 验证：`npm run build` 通过；`npm run test:all` 单测 406/406 + 集成 17/17 全绿；
  `doc-lint` 通过。
- 能力：`R1/R2 10k 0603 + C1/C2 100nF 0603 + U1 STM32F103 LQFP48`
  聚合为 3 类 5 个元件并生成 CSV BOM；无附件/无位号均诚实降级。
- 提交：未提交（延续工作区待统一确认批次）。
- 遗留事项：Word/Excel/PPT、格式转换、图片压缩、主动提醒等生活助手能力继续排期。
