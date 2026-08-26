# GitHub 项目解读子系统 · 需求解读（v2.5 方向）

> 日期：2026-08-26 ｜ 范围：把「v2.5 需求」对 GitHub 项目解读的要求逐条解读，并与当前 POC-C 行为对照、给出落地建议。

## 1. 需求来源（当前盘上最接近 v2.5 的版本）

| 来源 | 位置 | 对 GitHub 解读的要求 |
| --- | --- | --- |
| 一人公司AI-Agent需求文档 v1.4 | §3.2 意图理解（表） | 「这个 GitHub 项目是做什么用的」应理解为：定位与用途、技术架构、核心技术栈、如何使用、适合哪些使用场景 |
| 一人公司AI-Agent需求文档 v1.4 | §6.4 GitHub 项目分析能力 | 能对 GitHub 项目详细分析：定位/用途、技术架构、核心技术栈、如何使用、适用场景 |
| 桌面 Agent SystemPrompt v2.1 | 105 行 | 定位/架构/技术栈/使用/**活跃度/许可证/供应链/对比/适配度/复用清单**；**区分 README 级与源码级判断** |
| 专业审阅协议 | §一 GitHub 项目深度分析（13 点 + 深度分级 + 默认输出） | 13 项分析维度、README 级/源码级分级、固定输出顺序 |
| 用户补充骨架 | §X（本次） | 两层结构、结构化产出契约、诚实边界、与记忆/工程栏联动 |

> 说明：盘上暂无「v2.5 需求文档」实体，以上即当前 v2.x 系列的全部 GitHub 解读要求；本次解读把它们与 §X 骨架合并为 v2.5 的统一规格。

## 2. 统一解读（按骨架 X.1–X.7）

### X.1 两层结构总览 —— 与芯片分析（§3.3）同构，但数据源换成 GitHub
- **第一层（L1，本地/API 直取）**：仓库元数据 + README + Release + 依赖树。特征：确定性高、可复核、当天即可查。
- **第二层（L2，联网补充）**：Issues/Discussion/社区评价。特征：补充 L1 看不到的“坑”与真实口碑，属软证据，必须标注来源与时间。

### X.2 第一层：仓库结构化分析 —— 六项，全部要有“量化/可引用”证据
1. **元数据提取**：Star / Fork / Open Issues / PR / License / 最近提交 / 贡献者数 → 需要 GitHub API（仓库端点 + contributors 端点）。
2. **README 速读**：定位 / 核心特性 / Quick Start / 已知限制 → 优先 `raw.githubusercontent.com` 原文，而非 HTML 网页抓取。
3. **技术栈识别**：语言 + 框架 + 构建工具 + 依赖树 → 除仓库语言外，要读 `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `requirements.txt` 等清单文件；大仓库先统计文件树再抽样。
4. **版本健康度**：Release 频率 / Changelog 质量 / Breaking Change 标记 → 用 Releases API + 提交活动（commit_activity）。
5. **维护状态判断**：Issue 响应时间 / PR 合并率 / Contributor 活跃度 → 需要 Issues/PR 搜索 API 或 events；**必须给出量化依据**（最近 N 月提交数、Issue 平均响应天数）。
6. **架构与使用**：核心模块、数据流、安装/使用/扩展方式（承接 §6.4 与审阅协议 #3–#5）。

### X.3 第二层：联网补充 —— 三类，全部要“来源可点”
- **踩坑经验**：GitHub Issues（官方）+ CSDN/知乎/B站（社区）中的真实问题，与芯片 §3.3 第二层同构。
- **竞品对比**：同类项目选型讨论（如 OpenWorker vs OpenClaw vs OpenHands）。
- **安全审计**：CVE / 安全公告 / 依赖漏洞 → 可用 GitHub Advisory API 或 OSV，优先级低于官方仓库数据。
- 注意：L2 是“补充”，不能替代 L1；无结果时如实说“未检索到”，不编造。

### X.4 解析管道与数据源优先级 —— 明确降级链
```
GitHub API > raw.githubusercontent.com > 网页抓取 > 搜索引擎
```
- 逐级降级：API 限流 → 用 raw 直取；raw 404 → HTML 抓取；抓不到 → 搜索兜底。
- 大仓库策略（>1000 文件 / >10MB README）：先取文件树统计与关键清单，README 只读前 N KB + 目录锚点，避免一次拉爆上下文。
- 与现有 b9 `releases.atom` 注记不冲突：release 信息并入“版本健康度”，不再是唯一产出。

### X.5 诚实边界 —— 四条硬规则
1. Star 数 ≠ 质量：必须结合 Issue 响应 / PR 合并率综合判断。
2. README 宣称 ≠ 已实现：交叉验证 Release / 代码（如仓库名 ≠ 实际能力）。
3. “活跃维护”必须量化：最近 N 月提交 / Issue 响应天数，不给主观判断。
4. License 只给事实（SPDX 标识 + 官方文本链接），不给法律建议。
- 另承接审阅协议“深度分级”：只读了 README → 标注「README 级判断」；涉及源码结论 → 说明检查范围与日期。

### X.6 产出结构契约
```jsonc
{
  "positioning": "一句话定位 + 解决的问题",
  "architecture": "核心模块 / 数据流 / 运行方式",
  "tech_stack": "语言 / 框架 / 构建工具 / 关键依赖",
  "usage": "安装 / 使用 / 扩展（Quick Start 级别）",
  "scenarios": "适用场景 + 主要用户",
  "health_score": "0–100（基于元数据/维护/版本活跃度，附构成依据）",
  "risks": ["踩坑 / 维护 / 许可 / 安全，每条带来源"],
  "evidence": [{ "type": "api|raw|web|search", "url": "…", "accessed_at": "…" }]
}
```
- 输出时契约字段全给；拿不到证据的字段显式写“未获取（原因）”，不硬凑。

### X.7 与记忆 / 工程栏联动（Phase 2 承接）
- 解读结果自动写入 Wiki（可复用），与偏好记忆同构持久化。
- 踩坑经验沉淀为 Skill（`agent-skills` 目录已有类似结构可复用）。
- 用户说「参考这个项目」→ 自动注入工程开发栏上下文（复用已存的解读，不再重复抓取）。

## 3. 当前 POC-C 行为 vs 需求的差距（以 openworker 输出为例）

当前输出：定位 ✓、用途 ✓、核心价值 ✓、运行方式 ✓、状态 ✓、最新版本 v0.2.1 ✓。
与 v2.5 的差距：

| 需求项 | 当前 POC-C | 差距 |
| --- | --- | --- |
| 元数据（Star/Fork/Issue/PR/License/提交/贡献者） | 无 | ❌ 未实现（b9 只有 title + release 注记） |
| 技术栈识别 + 依赖树 | 无（README 首段恰好提到一部分则算运气） | ❌ 未读 manifest 文件 |
| 版本健康度（Release 频率/Changelog/Breaking） | 只有最新 5 条 Release 标题 | ⚠️ 部分（无频率/Changelog 质量判断） |
| 维护状态（Issue 响应/PR 合并率，量化） | 无 | ❌ |
| L2 踩坑 / 竞品对比 / 安全审计 | 无（除非用户显式「搜索：」） | ❌ |
| 诚实边界（README 级标注、量化依据） | 无 | ❌ |
| 产出结构契约 X.6 | 自由散文 | ❌ 无结构化字段 |
| 与记忆/工程栏联动 X.7 | 无 Wiki / Skill 写入 | ❌ Phase 2 |
| 当前系统提示词 | 仅“简洁/可执行/说明来源”，未注入审阅协议 | ⚠️ 协议在仓库里但应用没加载 |

## 4. 落地建议（POC-C 实施顺序）

1. **Server 新增 `github.analyze` 工具**（或扩展 web.fetch 的 GitHub 分支）：
   - L1：GitHub API（`/repos/{o}/{r}` 元数据、`/releases`、`/contributors`、`/commits` 近 N 月、`/issues?state=all` 抽样）+ `raw.githubusercontent` README + manifest 清单（package.json 等）+ 文件树统计。
   - L2：GitHub Issues 搜索 API + 搜索引擎（踩坑/口碑）按 X.4 降级链。
   - 输出直接产出 X.6 契约 JSON，注入 `evidence[]`。
2. **Prompt 注入**：识别「GitHub 项目」意图时，把《专业审阅协议 §一》作为 system 附加上下文（按需加载，不是每轮都带）。
3. **UI**：结果按 X.6 字段渲染（卡片式），来源可点。
4. **测试**：按现有 `test_pocc.py` 模式加 mock（API/raw/issues 本地 fixture），覆盖降级链与诚实边界。
5. **X.7**：Wiki/Skill 联动列为 Phase 2，需记忆系统落地后接（当前偏好记忆已可用，可先做「解读写回偏好记忆/会话摘要」）。
