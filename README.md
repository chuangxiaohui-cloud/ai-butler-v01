# 一人公司 AI-Agent（AI-Butler）

面向嵌入式电子工程师的一人公司桌面助手。核心定位：五角色合一（贴身女秘书 / 老板 / 产品经理 / 项目经理 / 系统架构师）+ 三种工作模式（知识问答 / 项目协作 / 生活助手）。

- **权威需求文档**：`一人公司AI-Agent需求文档_v2.5.md`（文档治理重构完成版，tag `v2.5`）
- **当前开发**：v0.1 MVP 验收通过（分支 `v0.1`，tag `v0.1`；[P-07] 10/10 通过；规划见 `v0.1_MVP_实施规划.md`）
- **技术栈**：Tauri + Node.js/TypeScript + React（无 Docker 依赖）

---

## 📐 文档治理与验收（§0 宪法）

文档由 `scripts/doc-lint.ts` 执法，七项检查（C1 数值扫描 / C2 废弃格式 / C3 行数预算 / C4 引用解析 / C5 bench 联动 / C6 共变 / C7 provisional 超期）。

### lint 命令（权威用法）

```bash
cd M:/202608111/scripts

# ① 全量验收模式 —— 唯一验收口径（C1-C7 全激活，C3 无宽限）
npx tsx doc-lint.ts

# ② 迁移期模式 —— 仅迁移开发中临时用（C5/C6 跳过，C3 ×1.2 宽限）
npx tsx doc-lint.ts --migration

# ③ 指定其他文档（默认 ../一人公司AI-Agent需求文档_v2.5.md）
npx tsx doc-lint.ts --doc <文档路径>
```

**要点**：
- 运行时**不需要传文档路径**（脚本默认指向上一级 v2.5）；`--doc` 仅在其他文档时使用
- 用 **tsx** 运行（本机未装 ts-node，npx 自动临时拉取），Node 22
- **验收通过 = 全量模式 0 FAIL 0 WARN**（WARN 也不行，必须全绿）

### v2.5 验收链（2026-08-12 实录）

```
阶段0-5 全量迁移完成
  → §0.7 退出迁移期四条件满足（台账归零 / PARAM 100% / provisional 全带 @date / 废弃双轨）
  → 全量 lint 0 FAIL 0 WARN
  → commit 5d6c6c5
  → git tag v2.5（锚定快照，diff 基准 = v2.5）
```

**退出迁移期四条件**（lint 自动检查覆盖）：

| # | 条件 | v2.5 实测 |
|---|------|----------|
| ① | 迁移台账旧→新全登记、悬空归零 | ✅ 39 条 |
| ② | PARAM 填充率 ≥80% | ✅ 79/79 = 100% |
| ③ | provisional 全带 @date | ✅ C7 |
| ④ | 废弃术语全双轨格式（旧→新） | ✅ C2 |

---

## 🚀 v0.1 MVP 常用命令

```bash
npm run dev --silent -- "你的问题"   # 运行 CLI 搜索管道（--silent 保证 stdout 纯 JSON，npm header 与 warning 均走 stderr）
npm run build               # TypeScript 构建
npm run bench:v01           # 验收基准脚本（10 条 query）
npm run score:v01           # [P-07] 评分判定（读取 bench/v01-scores.json）
```

- API Key 放 `.env`（模板见 `.env.example`，已被 `.gitignore` 排除，不进 git）
- 记忆 schema v1：`src/memory/schema.sql`（L0 原始问答 JSONL + L1 提炼表）

---

## 📁 目录结构

| 路径 | 说明 |
|------|------|
| `一人公司AI-Agent需求文档_vX.Y.md` | 需求文档版本链（v1.9 ~ v2.5，v2.5 为当前权威） |
| `scripts/doc-lint.ts` | 文档宪法执法脚本（§0.6 七检查） |
| `scripts/bench-v01.ts` | v0.1 验收基准脚本 |
| `scripts/score-v01.ts` | [P-07] 评分判定脚本 |
| `src/search/` | 搜索管道（Stage 1-6） |
| `src/memory/` | 记忆存储（SqliteDirectStore + schema v1） |
| `src/skills/` | 预置 Skill（2 核心 + 4 占位） |
| `src/wiki/` | 冷启动知识种子 |
| `bench/` | 基准数据（`raw_scores.csv` 人工打分，git 跟踪） |
| `bench/v01-report.md` | v0.1 验收报告（含分引擎时延与逐条评分列） |
| `bench/search-metrics.jsonl` | 分引擎时延日志（bench schema） |
| `v0.1_MVP_实施规划.md` | v0.1 实施规划（WBS 11 工作包） |

---

## 🏷️ 版本与标签

| tag | 指向 commit | 说明 |
|-----|------------|------|
| `v2.4` | 迁移基线 | v2.4 快照（lint diff 基准） |
| `v2.5` | `5d6c6c5` | 文档治理重构完成（阶段0-5 全绿，退出迁移期） |
