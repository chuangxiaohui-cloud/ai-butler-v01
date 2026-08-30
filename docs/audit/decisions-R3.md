# R-3 决策记录：.gitignore 增补与资产处置

- **决策事项**：R-3 (来源 r3-codegraph.md §3)
- **拍板人**：[你的名字]
- **时间**：2026-08-30
- **分支**：v0.2b

## 核心结论
1. **11个参考项目**：确认为第三方参考物，执行 `.gitignore` 忽略，不入库。
2. **benchmarks/ 目录**：确认为自产临时测试脚本，执行 `.gitignore` 忽略，不入库。

## 详细决策说明

### 1. 参考项目目录（不入库）
以下目录均为外部参考项目或自动排除项，依据工程规范进行忽略：
- AI-Butler/, OpenHands/, Tavily+AnySearch+Bocha/
- openocta/, opensquilla/, openworker/
- v3/, crm/, benchmarks/
- deepseek-harness/, agent-skills/

### 2. benchmarks/ 黄标结论（审计确认项）
经核查，`benchmarks/` 目录及其子目录（含 results/）下的内容均为开发期自写的临时测试脚本、跑分数据及分析报告（如 search-benchmark.ts, report.md 等）。
- **性质判定**：属于一次性验证产物，非产品核心交付代码。
- **执行动作**：保持 `.gitignore` 规则，整体忽略该目录。

## 执行动作
1. 追加 13 行规则至 `.gitignore`，UTF-8 无 BOM 编码。
2. 使用 PowerShell .NET 写入模式锚定，防止环境差异。
3. 旧无锚定规则保留（无害，新规则最后匹配优先）。

## 验证锚点
- `check-ignore -v 11/11` 命中新规 (86-96)。
- 反向验证 `src/scripts/docs` 未被误伤 (exit=1)。
- 提交 Commit: [这里填你刚才生成的哈希值 e91e6ba]

## 残留说明
- 根目录自产 .md (AI-Butler...) 另行入库；CRLF warning 为环境表象，非代码错误。