# 推进计划：补齐开发全景推导链文档（ADR + 目录结构）

> 日期：2026-08-17 · 分支：v0.2b · 状态：已完成

## 目标

把“需求文档 → 架构决策记录（ADR）→ 目录结构设计 → AGENTS.md”推导链中缺失的
ADR 与目录结构文档补上，并把已有入口串成一条可追溯的阅读链。

## 计划

1. 审阅推导链与仓库现状，确认缺口：无 ADR、无独立目录结构文档、AGENTS.md 直接悬在需求之上。
2. 新建 `docs/adrs/README.md`（ADR 流程与索引）。
3. 新建 `docs/adrs/0001-architecture-foundation.md`（技术选型、分层策略、模块划分原则、稳定契约）。
4. 新建 `docs/directory-structure.md`（代码骨架、模块职责、接口契约、数据流）。
5. 更新 `AGENTS.md`、`README.md`、`docs/2026-08-17-progress-handoff.md`，接入新文档入口。
6. 校验文档链接与需求文档 lint（本次不涉及行为/参数变更，不跑基准）。

**验收标准**

- ADR 索引与 ADR-0001 存在且互相引用。
- 目录结构文档覆盖根目录、`src/` 各模块、接口契约与数据流。
- AGENTS.md 与 README 能从入口链直达上述文档。
- `doc-lint` 保持 0 FAIL 0 WARN；无代码改动。

## 执行过程

### 改动

- 新建 `docs/adrs/README.md`：ADR 用途、流程、索引。
- 新建 `docs/adrs/0001-architecture-foundation.md`：基础架构决策补记。
- 新建 `docs/directory-structure.md`：全景、目录表、接口契约、数据流、更新纪律。
- 更新 `AGENTS.md`：开工前阅读链加入 ADR 与目录结构文档，目录地图指向详细文档。
- 更新 `README.md`：增加“开发全景阅读链”入口。
- 更新 `docs/2026-08-17-progress-handoff.md`：记录本次文档补全。

### 遇到的问题

- 无。文档补全不涉及需求正文，未触发 E-NN 与 bench 登记。

## 结果

- 验证：`doc-lint` 0 FAIL 0 WARN；`rg` 抽查新文档引用路径均存在。
- 测试：本次为文档补全，无代码改动，不新增测试。
- 提交：未提交，等待用户确认后统一处理。
- 遗留事项：后续新增架构决策时按 `docs/adrs/README.md` 流程追加 ADR；目录变化时同步
  `docs/directory-structure.md` 与 AGENTS.md。
