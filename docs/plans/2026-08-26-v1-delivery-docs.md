# 推进计划：v1.0 交付期文档四件套（E245）

> 日期：2026-08-26 · 分支：v0.2b · 状态：计划中

## 目标

v1.0 收口（P-10 全量验收）前置：documentation-map 第四组「交付期审核与交付物」中标记
`v1.0 收口` 的文档补齐——安全审计报告、隐私与数据处理说明、用户操作手册、成熟度评估报告、
架构设计说明书（终版）。交付期文档按版本快照生成、不预置结论，证据来源以 documentation-map
第四组表格为准；缺失/未达标的项目诚实登记，不自我夸大（对齐 §12.4「不自我夸大」原则）。

## 背景与差距

- P-10 条件集含「附录 C 无相反证据 + owner 签认」，交付期文档是 owner 签认的输入物。
- documentation-map 第四组 `v1.0 收口` 标记的 5 份文档当前全部缺失：
  #1 安全审计报告、#2 隐私与数据处理说明、#7 架构设计说明书（终版）、#10 用户操作手册、
  #14 成熟度评估报告。
- 已有基础：`docs/architecture/*`（5 份）、`docs/adrs/`（2 份）、`src/security/*.test.ts`、
  `src/gateway/terminal.test.ts`、`ui/prototype/README.md`、`.env.example`、需求 §4.1/§8.1.4/
  §9/§10.3/§10.4/§10.5/§12.4。

## 计划

1. **新目录 `docs/reports/`**（交付期报告快照，按版本归档不互相覆盖）：
   - `security-audit-v1.md`：安全审计报告——§10.4 用例清单逐条映射到真实测试证据
     （src/security/*.test.ts + src/gateway/terminal.test.ts），覆盖/缺口如实登记；
   - `privacy-data-processing-v1.md`：隐私与数据处理说明——本地优先存储（data/、SQLite、
     MemoryCore sidecar）、外发数据最小化（§10.3 脱敏）、云端仅 LLM 推理请求（§8.1.4）；
   - `user-manual-v1.md`：用户操作手册——三栏交互（§4.1）、Ask/Craft/Plan、证据链与反馈
     （§9）、CLI/gateway/桌面壳入口、Skill、斜杠命令、记忆管理、代码托管与市场 Skill CLI；
   - `maturity-assessment-v1.md`：成熟度评估报告——§12.4 五维指标按当前证据如实评分，
     输出 L1→L2 过渡态（不得虚报 L2）；
   - `architecture-design-final-v1.md`：架构设计说明书（终版）——整合 docs/architecture/* 与
     ADR-0001/0002，覆盖分层/数据流/依赖边界/接口契约/部署/关键决策。
2. **登记**：documentation-map 第四组状态更新；需求文档附录 A E245（bench:na(new-param)）；
   `docs/code-directory.md` 与 `docs/directory-structure.md` 增 `docs/reports/` 行；
   当天 handoff 登记。
3. **验证**：doc-lint 0 FAIL 0 WARN（纯文档批次，无代码/参数变更）。

**验收标准**

- 5 份交付文档全部落盘 `docs/reports/`，证据来源与 documentation-map 第四组一致；
- 安全审计逐条映射 §10.4 用例 → 测试文件/行号，无覆盖的用例显式登记为缺口；
- 成熟度报告按 §12.4 五维指标输出，等级判定与交接快照（L1→L2 ≈35-40%）一致；
- 用户手册覆盖 §4.1/§9 要求 + 全部 CLI 入口；
- doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- `docs/reports/security-audit-v1.md`、`privacy-data-processing-v1.md`、`user-manual-v1.md`、
  `maturity-assessment-v1.md`、`architecture-design-final-v1.md`（新增）。
- `docs/documentation-map.md`（第四组状态）、需求文档附录 A（E245）、
  `docs/code-directory.md`、`docs/directory-structure.md`、本计划、当天 handoff。

### 遇到的问题

- PowerShell 对含反引号（markdown 行内代码）的字符串匹配不稳定：改用 `.Contains` 行级定位替换，
  避免 `-like/-match` 与反引号转义互相干扰。
- 交付文档的证据引用全部来自既有测试/文档（无新代码），保持「快照不预置结论」口径；
  安全审计对读侧越界用例无独立断言、终端解释器通道只标记不硬拒等缺口如实登记。

## 结果

- 验证：`npm exec tsx scripts/doc-lint.ts` 0 FAIL 0 WARN（纯文档，无 build/test 变化）。
- 交付文档 5 份落盘 `docs/reports/`；documentation-map 第四组 #1/#2/#7/#10/#14 转 ✅；
  需求文档附录 A 登记 E245（bench:na(new-param)）；code-directory/directory-structure 补
  `docs/reports/` 行。
- 提交：见 git log（提交号登记于 handoff）。
- 遗留：文档治理合规报告（#15）与依赖清单（#12）为「每次发布/发布前」项，不在 v1.0 收口
  强制清单，随发布执行；owner 签认后按 P-10 跑全量验收。
