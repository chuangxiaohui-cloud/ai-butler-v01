# 推进计划：Keil 项目画像持久化与只读盘点

> 日期：2026-09-14 · 分支：v0.2b · 状态：已完成

## 目标

把 E401 的项目画像契约落成原子持久化 store，并由 Keil MCP 只读解析 `.uvprojx` 后写入证据缓存。

## 计划

1. 扩展画像契约以保存 target 清单与已确认 target，新增稳定 projectId、原子保存和严格读取校验。
2. 新增 Keil `InspectProjectProfile`：读取工程/target/device 和已配置 UV4，生成画像并写入 `data/project-profiles/`。
3. 接入 MCP 白名单与 mcp-agent 展示，补目标单测并同步需求、目录、验收与交接。

**验收标准**

- 同一规范化工程根稳定生成同一 projectId，缓存文件名不能由外部任意指定。
- 保存前和读取后都执行画像校验；损坏、篡改或 projectId 不匹配的缓存拒绝使用；写入采用同目录临时文件原子替换。
- Keil 盘点仅读取 `.uvprojx` 和 UV4 配置，输出 target/device 来源；flash、serial、sdkRoot 等未知项保持 `null`。
- 主项目 build、目标单测和 `git diff --check` 通过；`doc-lint` 不新增失败。不运行 E2E、全量测试或 bench。

## 执行过程

### 改动

- `ProjectMcpProfile` 增加 `targets/selectedTarget`，校验 target 唯一性及选定项归属；同步 JSON Schema。
- 新增 `ProjectProfileStore`：规范化工程根稳定派生 projectId，保存前/读取后双重校验，临时文件原子替换，拒绝损坏、篡改与路径型 id。
- Keil 新增只读 `InspectProjectProfile`：从 `.uvprojx` 提取 target/device，探测已配置 UV4，仅对有证据字段赋值，并写入 `data/project-profiles/`。
- MCP 白名单与 `mcp-agent` 接通盘点入口，返回 `keil-project-profile` 结构化产物。
- 同步需求 §4.1.2/§13、附录 A、目录地图与进度账本。

### 遇到的问题

- 首次构建发现测试中重复调用联合类型结果导致 TypeScript 无法缩窄；改为保存读取结果后按 `ok` 分支断言，未改生产代码。
- 仓库既有 `doc-lint` C7 provisional 超期（需求文档第 19 行）仍在；E403 不扩大范围处理。

## 结果

- `npm run build`：通过。
- 定向测试：24/24（画像契约/store、Keil、mcp-agent）。
- 未运行全量测试、集成/E2E 或 bench；本轮未执行真实 build、flash 或串口。
- `git diff --check`：通过；`doc-lint`：C1-C6/C8 通过，仅保留既有 C7 provisional 超期（需求第 19 行，2 FAIL/0 WARN），E403 未新增失败。
