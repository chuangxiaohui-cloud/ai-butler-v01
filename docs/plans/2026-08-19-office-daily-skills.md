# 推进计划：生活助手办公日常首批（E137）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

按“生活助手办公日常”逐项补能力，首批实现四个可独立闭环的日常技能：
考勤表模板生成、CSV 数据占比分析、回复邮件草稿落盘、图片压缩到 200KB。
Word/PPT/PDF 转换等格式引擎能力留待下一批。

## 计划

1. 新增 `src/skills/office-daily/`：按 query 分发 table / analyze / email / image 四种模式。
2. 新增 `office_daily` 意图与 `R_OFFICE_DAILY` 路由，secretary 映射到 life 模式。
3. 图片压缩复用 Python Pillow，新增 `scripts/compress_image.py`。
4. 注册 Skill、README、生命周期/注册表测试。
5. 补单测：考勤模板落盘、CSV 占比、邮件落盘、图片压缩、xlsx 诚实降级。
6. 登记 E137，更新计划结果与当天交接。

**验收标准**

- `帮我做一个考勤表模板` 输出 `data/office/考勤表模板-*.csv`。
- CSV 附件的“部门/销售额”能算出各部门占比。
- `写一封回复邮件...` 输出 Markdown 草稿文件。
- 图片压缩后体积 ≤ 200KB。
- xlsx 上传分析时诚实提示“暂待接入，请另存为 CSV”。

## 执行过程

### 改动

- `src/skills/office-daily/index.ts` + 测试。
- `src/agent/intent-feature.ts`、`routing-table.ts`、`executors.ts`、`mode-mapper.ts`。
- `scripts/compress_image.py`。
- `src/skills/registry.ts`、`README.md`、`lifecycle.test.ts`、`registry.test.ts`。

### 遇到的问题

- 图片压缩测试首轮失败：fake file 的 `arrayBuffer` 暴露了 Buffer 底层大块内存；
  改为按 `byteOffset/byteLength` 切片后通过。
- `registry`/`lifecycle` 并发测试偶发 SQLite 锁；calendar/im Skill 改为执行时懒打开 DB 后消除。

## 结果

- 验证：`npm run build` 通过；`npm run test:all` 单测 414/414 + 集成 17/17 全绿；
  `doc-lint` 通过。
- 能力：考勤表模板 CSV、CSV 部门占比、回复邮件草稿、图片压缩 200KB 均落盘可用；
  xlsx 分析诚实降级“另存为 CSV”；PPT/Word/PDF 转换明确提示“下一批接入”。
- 提交：未提交（延续工作区待统一确认批次）。
- 遗留事项：Word 格式、PPT、PDF 转换、主动提醒继续排期；xlsx 原生解析待引入格式引擎。
