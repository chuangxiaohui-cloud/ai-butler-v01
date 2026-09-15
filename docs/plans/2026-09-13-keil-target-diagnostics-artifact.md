# Keil target 与可定位诊断产物

## 目标

- 只读解析 `.uvprojx` 的 target 名称，供调用方选择后再执行 build。
- 将 Keil warning/error 映射为带文件、行号、级别和消息的结构化 artifact。
- 在现有桌面原型中展示 target 与诊断列表；有文件行号时提供现有文件预览入口。

## 非目标

- 不修改 `.uvprojx`、源码或 target 配置。
- 不自动选择并编译 target，不开放烧录或调试。
- 不新增 XML/UI 框架或外部依赖。

## 验收标准

- 多 target、空 target、格式异常和越界工程均有定向测试。
- `DiscoverProjects`/`BuildProject` 之外只新增只读工具；结构化诊断在失败 build 时仍保留。
- UI 能区分 warning/error，并在安全路径内定位到文件与行号。
- 主项目与 UI 构建、相关定向测试通过；工作区无真实工程时明确不做真实 build。

## 执行过程

### 改动

- 新增 `listKeilTargets()` 与 Keil MCP `ListTargets`：只读提取 `TargetName`，保序去重并解码基础 XML 实体；空/不完整 XML 返回空清单，越界仍由沙箱拒绝。
- build 诊断仅在文件真实存在且仍位于工作区白名单时补 `sourcePath`；原始 `file` 保留，越界或不存在路径不可点击。
- `mcp-agent` 将 target 查询自然语言映射到只读工具，并生成 `keil-targets` / `keil-diagnostics` 结构化 Skill 产物；统一 pipeline 将产物透传到回答契约。
- UI 新增 target 清单与 warning/error 诊断卡；带安全 `sourcePath` 的诊断可打开现有文件只读预览。
- 明确 `.uvprojx`/显式 MCP 工具请求在通用问答前路由到 `mcp-agent`，不触发联网搜索。

### 遇到的问题

- 首轮验证中，“有哪些 target”被通用 `qa` 规则先截获，导致 pipeline 未进入 MCP Skill。
- 将仅匹配显式 MCP 工具或 `.uvprojx` 路径的 `operate` 规则前移；路由与 pipeline 复验通过，未把普通 Keil 软件咨询扩大为工具执行。

## 结果

- 主项目 `npm run build` 与 UI `npm run build` 均通过。
- router-v2 + Keil + mcp-agent 定向测试 101/101；pipeline 结构化产物透传 1/1；Keil MCP stdio 集成 4/4。
- `npm run mcp:health` 2/2，Keil server 工具数由 2 增至 3，默认健康动作仍是只读 `DiscoverProjects`。
- `projects/`、`sandbox/`、`outputs/` 内仍无 `.uvprojx`，未执行真实固件 build；未修改工程、未开放 flash。
- `git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。
- 未运行全量 E2E/bench，零外部 LLM，未提交。
