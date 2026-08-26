# POC-C GitHub 解读 → v0.2b 移植参考（记忆载体）

> 来源：`M:\20260804\poc-c\server\pocc_server.py`（POC-C v0.1.1-b11，28/28 测试通过）＋
> `M:\20260804\GitHub项目解读子系统_需求解读_v2.5.md`（已复制为
> `docs/2026-08-26-github-analysis-requirements.md`）＋
> `M:\20260804\进度记录_2026-08-25.md` 第十六段。
> 本文件给新任务（工作根 `M:\202608111`）做完整实现参考：**代码必须按本仓约定用
> TypeScript 重写，不得直接拷贝 Python**；契约与降级策略已在本仓 `docs/borrowed-designs.md`
> 登记（借思想，不借底座）。

## 1. 需求锚点（v2.5 正文）

| 位置 | 要求 |
| --- | --- |
| §3.2 知识咨询（L307） | 知识咨询含「GitHub 项目分析」：直接回答 + 联网补坑 |
| §4.4 MVP 切片预置 Skill（L466） | 预置 Skill 库含「GitHub 项目解读」 |
| §6.1.2 意图表（L706/L719） | `github_analysis`：项目分析，**优先走 GitHub API，搜索做补充**，≤6 月，github.com |
| §12.2 初始预置 Skill（L1462） | GitHub 项目解读 Skill：定位 / 架构 / 技术栈 / 用法 / 场景 |
| §12.5.1（L1543） | GitHub 解读走「重模型深度报告」：允许慢，但必须先给「正在分析」反馈 |

## 2. 目标契约（X.6，字段全给，缺失显式「未获取（原因）」）

```jsonc
{
  "repo": "owner/repo",
  "depth": "README 级判断",
  "positioning": "一句话定位 + 解决的问题",
  "architecture": "核心模块 / 数据流（README 级）",
  "tech_stack": "主语言 + manifest 依赖摘要",
  "usage": "安装 / 使用 / 扩展（Quick Start 级别）",
  "scenarios": "适用场景 + 主要用户",
  "health_score": 0,              // 0–100 整数
  "health_basis": ["Star 15,045（≥1万）", "…"],
  "risks": ["每条带依据，不编造"],
  "meta": {                        // L1 原始指标
    "stars": 0, "forks": 0, "open_issues": 0, "license": "MIT",
    "language": "TypeScript", "default_branch": "main",
    "pushed_at": "ISO", "created_at": "ISO", "description": "",
    "topics": [], "contributors": 0, "commits_6m": 0,
    "latest_release": "", "latest_published": "", "releases_6m": 0
  },
  "evidence": [
    { "type": "api|raw|web", "url": "…", "accessed_at": "ISO" }
  ]
}
```

## 3. L1 数据源与降级链

顺序：**GitHub API → raw.githubusercontent.com → releases.atom/仓库主页 → 搜索（L2，Phase 2）**。
任一环节失败只降级、不抛错；字段拿不到就写「未获取（原因）」。

- GitHub API（未认证限流 60 req/h；失败/限流/超时 → 返回 None 进降级链）：
  - `GET /repos/{o}/{r}` → stargazers_count / forks_count / open_issues_count /
    license.spdx_id / language / default_branch / pushed_at / created_at /
    description / topics
  - `GET /repos/{o}/{r}/contributors?per_page=100` → 贡献者数（列表长度）
  - `GET /repos/{o}/{r}/commits?per_page=100&since=<now-183d>` → 近6月提交数
    （commit_activity 需额外 scope，POC 用 commits 计数代替）
  - `GET /repos/{o}/{r}/releases?per_page=30` → 最新 tag/published_at、近6月 release 数、
    非 draft 过滤；失败兜底 `github.com/{o}/{r}/releases.atom`
- raw（`raw.githubusercontent.com/{o}/{r}/{branch}/{file}`）：
  - README：README.md / README_CN.md / readme.md / README.rst / README.txt
  - manifest：package.json / pyproject.toml / requirements.txt / go.mod / Cargo.toml
- 分支探测：API 的 default_branch → main → master → HEAD（raw 404 换下一个）
- 大仓库（>1000 文件 / README>10MB）：README 只读前 N KB（POC 用 96KB），manifest 只抽依赖摘要
- 超时：API/raw 各 8s（POC 用 `_http_get(timeout=8)`；TS 用 AbortSignal）

## 4. health_score 加权（0–100）

| 项 | 满分 | 档位 |
| --- | --- | --- |
| Star | 20 | ≥5万:20 / ≥1万:18 / ≥1千:14 / ≥100:10 / >0:6 / 0:0 |
| 近6月提交 | 25 | ≥200:25 / ≥100:22 / ≥50:18 / ≥20:12 / ≥5:6 / <5:0 |
| 贡献者 | 15 | ≥100:15 / ≥30:13 / ≥10:10 / ≥3:7 / <3:3 |
| Open Issues | 10 | <50:10 / <300:8 / <1000:5 / ≥1000:2（积压多降分） |
| 近6月 Release | 20 | ≥12:20 / ≥6:17 / ≥2:12 / ≥1:8 / 0:3 |
| 最近推送 | 10 | ≤7天:10 / ≤30:8 / ≤90:6 / ≤180:3 / >180:0（且写进 risks） |
| License 缺失 | -5 | SPDX 缺失或 NOASSERTION |

规则：字段未获取（None）→ 该项不加不扣，`health_basis` 注明「未获取」；满分 100 封顶。

## 5. risks 规则（每条带依据）

- License 缺失/NOASSERTION：商用与复用需自行确认许可，**不给法律建议**
- commits_6m < 10：维护活跃度低，谨慎采用
- pushed_at > 180 天：项目可能已停滞
- open_issues ≥ 500：积压较多，Issue 响应速度需 L2 核实
- README 未获取：功能与宣称无法交叉验证

## 6. 《专业审阅协议 §一》全文（注入 LLM 的 system 节选）

> 协议原文在 `M:\20260804\一人公司桌面Agent_专业审阅协议.md`，本仓无此文件，移植时内嵌下方节选。

老板问「这个 GitHub 项目是做什么的 / 值不值得用 / 能不能借鉴」时：
1. 项目定位与解决的问题。
2. 主要用户与适用场景。
3. 技术架构、核心模块、数据流。
4. 核心技术栈、运行时、部署方式。
5. 安装、使用、扩展方式。
6. 模型 / 工具 / MCP / 插件 / Agent 机制。
7. 最近提交、Release、Issue/PR 与维护活跃度。
8. 许可证、商业使用、传递依赖风险。
9. 隐私、安全、权限、供应链风险。
10. 优点、限制、成熟度、隐藏成本。
11. 与同类项目差异。
12. 与老板当前项目与技术栈的适配度。
13. 可直接复用 / 改造采用 / 只参考设计 / 明确放弃清单。

**深度分级**：仅看过 README → 明确「README 级判断」；源码级结论需检查入口、目录、依赖、
关键模块、许可证与运行路径，并注明检查范围与日期。

**默认输出顺序**：一句话结论 → 定位 → 架构与栈 → 使用 → 活跃度与许可证 → 风险 → 对比 →
对当前项目的建议 → 仍需确认。

**诚实边界 4 条**：Star 数 ≠ 质量；README 宣称 ≠ 已实现（交叉验证 Release/代码）；
「活跃维护」必须有量化依据（近 N 月提交等）；License 只给事实不给法律建议。

## 7. POC-C 实现细节与坑（移植注意）

- releases.atom 正则：`<entry>.*?<title>(.*?)</title>`（re.S）；tag 从
  `<link href="…releases/tag/xxx"/>` 尾部 `unquote` 取
- positioning 提取过滤（README 首段）：
  - 跳过 `![` 图片行、纯 markdown 链接行（链接文本长度 ×2 > 整行长度）、
    HTML 徽章行（剥 `<…>` 后 <20 字符，或 tag 长度 ×2 > 整行长度）
- README 章节提取：`^#{1,4}` 标题匹配关键词（Quick Start/快速开始/安装/Usage/使用/
  架构/Architecture/模块/设计/场景/适用/Use cases…），取到下一个标题为止，压缩空白，≤600 字符
- manifest 解析（各取前 12 项）：
  - package.json：dependencies + devDependencies（按版本号数值倒序）
  - pyproject.toml：`dependencies = ["a>=1", …]` 引号内包名
  - requirements.txt：按 `[=<>!~[]` 切分取包名
  - go.mod：`module <path>` + `^\s*(\S+)\s+v\d` 依赖行
  - Cargo.toml：`name = "x"` 或 `name = { version = …` 形式
- 测试用可配基址（POC 用 env：`POC_GITHUB_API_BASE` / `POC_GITHUB_RAW_BASE` /
  `POC_GITHUB_WEB_BASE`）；本仓应改为 fetch 注入 mock（勿引入新依赖）

## 8. POC-C 测试覆盖（新任务照此写 TS 测试，≥10 条）

1. 契约结构：8 字段 + depth + evidence（api+raw）+ README 级标注
2. API 全失败降级：raw README + releases.atom 兜底、tech_stack/architecture 显式「未获取」
3. API 部分失败：contributors/commits/releases 各自缺失仍出解读
4. README 缺失 / manifest 缺失
5. health_score 边界：全无数据 → 0；License 缺失扣分
6. 无 `deps.complete`（LLM 未接）→ 返回结构化契约对象 + 诚实提示
7. URL 提取边界：`.git` 后缀、带查询参数、中文紧贴 URL、非 github.com 链接
8. fetch 404 / 超时 → 不抛错、走降级

## 9. 真实冒烟数据（POC-C b11，2026-08-26）

- `andrewyng/openworker`：health_score=82；evidence 6 条（4 api + 2 raw）；
  usage 提取 `git clone https://github.com/andrewyng/openworker`；
  positioning 已过滤导航/徽章行
- 健康分构成实例：Star 15,045→18 / 近6月提交 100→22 / 贡献者 15→10 /
  Open Issues 438→5 / 近6月 Release 6→17 / 最近推送 0 天→10 = 82

## 10. 待办（按 `docs/plans/2026-08-26-github-project-analysis.md` 执行）

1. `src/skills/github-reader/index.ts` 重写为 `createGithubReaderSkill()`（ExecutableSkill，
   `deps.complete` 做 LLM 合成；`result` 返回 `{ answer, contract, evidence, confidence }`）
2. `src/skills/registry.ts` 从 LegacySkillDef 移入 EXECUTABLE_SKILLS
3. 测试重写（上表）+ `npm run build` + `npm run test:all` 全绿
4. `src/skills/README.md` 状态更新；附录 A 登记 E-NN（无 §5/§6 参数变更 → bench:na）
5. 真实冒烟（openworker/zephyr）+ `npm exec tsx scripts/doc-lint.ts` 0 FAIL 0 WARN
6. 本计划/交接补「结果」，提交 v0.2b
