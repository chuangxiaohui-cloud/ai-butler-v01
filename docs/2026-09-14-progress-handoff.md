# 2026-09-14 进度交接

## E402：项目冲突裁决恢复接入 gateway（未提交）

- 计划：[`docs/plans/2026-09-13-project-conflict-gateway-resume.md`](./plans/2026-09-13-project-conflict-gateway-resume.md)。
- 仓库：冲突 pending 现在与完整冲突契约、原 prepared transaction 和 conversationId 绑定；裁决事件落盘后才能执行。
- 三选一：`keep_external` 保留冲突文件并提交其余项；`use_transaction` 提交整批事务版本；`cancel_all` 保持当前文件并清理原事务快照。
- 再次确认：裁决后文件又变化时目标零写入，生成新的 conflict pending 并把原内存事务改绑过去。
- 失效：进程重启或事务仓库无正文时返回 `expired`；decision log 只保留证据，禁止反推文件正文。
- gateway：`POST /api/decisions/:id` 识别 `project_transaction_conflict`，返回统一 `projectTransaction` 回执；不走普通 pipeline resume。
- 验证：主项目 build 绿；仓库与 E397 核心测试 14/14；gateway E399/E402 4/4。未跑全量测试、E2E 或 bench，未提交。

## E403：Keil 项目画像持久化与只读盘点（未提交）

- 计划：[`docs/plans/2026-09-14-keil-project-profile-store.md`](./plans/2026-09-14-keil-project-profile-store.md)。
- 画像契约新增 `targets/selectedTarget`；未知单值项保持 `null`，多 target 不猜默认项。
- 新增稳定 projectId 与原子画像 store；保存前、读取后均校验 schema、文件 id 和工程根绑定，拒绝损坏/篡改缓存。
- Keil MCP 新增 `InspectProjectProfile`：只读解析 `.uvprojx` 的 target/device 和已配置 UV4，写入 `data/project-profiles/`；不执行 build、flash 或串口。
- `mcp-agent` 已支持“盘点某 .uvprojx 项目画像”的自然语言路由和结构化画像产物。
- 验证：主项目 build 绿；画像契约/store、Keil 与 mcp-agent 定向测试 24/24；`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仅保留既有 C7 provisional 超期（第 19 行，2 FAIL/0 WARN）。未跑全量测试、集成/E2E 或 bench，未提交。

## E404：MCP 领域工作流最小执行契约（未提交）

- 计划：[`docs/plans/2026-09-14-mcp-domain-workflow-runtime.md`](./plans/2026-09-14-mcp-domain-workflow-runtime.md)。
- 新增领域工作流节点/计划/结果契约；节点显式声明输入、产物、Agent、工具、目标文件、风险、验收与失败回退。
- 当前执行白名单仅含 Keil `InspectProjectProfile` 与 `BuildProject`；kind/tool/产物/风险必须严格匹配。
- 执行器复用 MCP dispatcher 串行执行，artifact/evidence 绑定 nodeId；上游失败立即停止并跳过后续节点。
- 含 build 的修订轮在任何工具调用前检查 [P-154]；超限零调用并携带 `serial_log/recent_diff` 要求上升用户。
- 验证：主项目 build 绿；领域工作流、循环守卫与 dispatcher 定向测试 18/18；`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仅保留既有 C7 provisional 超期（第 19 行，2 FAIL/0 WARN）。未跑全量测试、集成/E2E 或 bench，未调用真实 MCP/build/flash/串口，未提交。

## E405：VS Code 只读 MCP 垂直链（未提交）

- 计划：[`docs/plans/2026-09-14-vscode-readonly-mcp.md`](./plans/2026-09-14-vscode-readonly-mcp.md)。
- 新增本地 VS Code 工作区 MCP：在沙箱内发现 `.vscode`/`.code-workspace`，只读盘点 tasks、launch、C/C++ 配置与有限 build settings。
- task 命令/参数不回显、不执行；JSONC 损坏形成独立配置诊断；problemMatcher 与实时 Problems 诊断明确区分。
- `mcp-agent` 已接通工作区发现/盘点自然语言路由和 `vscode-workspace-profile` 产物；本地配置白名单已启用两个只读工具。
- E404 工作流新增 `workspace_inventory → vscode.InspectWorkspace` 严格节点，按 code 类别调用。
- 验证：主项目 build 绿；VS Code 适配、mcp-agent、领域工作流、配置与 registry 定向测试 29/29；两个配置 JSON 解析及 `git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仅保留既有 C7 provisional 超期（第 19 行，2 FAIL/0 WARN）。未跑全量测试、集成/E2E 或 bench，未启动/控制 VS Code，未执行 task 或写配置，未提交。

## E406：STM32-GCC 第二平台 MCP（未提交）

- 计划：[`docs/plans/2026-09-14-stm32-gcc-mcp.md`](./plans/2026-09-14-stm32-gcc-mcp.md)。
- 从 CMake/compile_commands 证据识别 ARM GCC、芯片宏、target 与 buildDir；多候选不猜。
- 新增 Discover/Inspect/Build 三工具；build 固定无 shell `cmake --build`，buildDir 必须位于项目根。
- 项目画像仅在 CMake/buildDir 有证据时登记 build；flash/serial 恒为空；E407 后已改为同根异平台证据字段级合并。
- 已接入注册表、配置白名单、mcp-agent 与领域工作流；验证 build 绿、定向测试 33/33、两个配置 JSON 与 `git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仅保留既有 C7 provisional 超期（2 FAIL/0 WARN）。未跑真实构建、全量、集成/E2E、bench，未提交。

## E407：项目画像字段级合并与过期重探测（未提交）

- 计划：[`docs/plans/2026-09-14-project-profile-merge-freshness.md`](./plans/2026-09-14-project-profile-merge-freshness.md)。
- 画像新增按 `agentId` 保存的 `capabilities`；同根 Keil/STM32-GCC 能力同时保留，顶层字段继续作为规划优选视图。
- 字段按“用户确认 > 工程文件 > 工具探测 > 缓存 > 模型候选”合并，同来源只接受更新证据；模型候选 target 不进入可信 target 合集。
- store 新增 `mergeAndSave` 与 `loadForPlanning`；规划方显式提供 `minimumObservedAt`，过期 build/flash 和能力 build 降为空并要求重探测。
- Keil/STM32-GCC server 已统一走合并保存；未新增未经标定的 TTL 参数。
- 验证：主项目 build 绿；画像合并/store/契约、Keil、STM32-GCC 定向测试 28/28；schema JSON、`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仅保留既有 C7 provisional 超期（2 FAIL/0 WARN）。未跑全量、集成/E2E、bench 或真实构建/硬件操作，未提交。

## E407 后交接（已由 E408 续推）

- 当前状态：E403-E407 均已完成但尚未提交；工作树包含更早轮次和用户改动，下次继续时禁止 reset/覆盖，先核对现有 diff。
- 下一轮首选 E408：把领域工作流计划生成、画像缓存优先读取和用户审批接入统一任务入口。
- E408 验收底线：入口只生成白名单内节点；优先读取新鲜画像，缺失或过期先盘点/澄清；build 节点执行前保留批准门与 [P-154]；不得引入 flash/串口。
- 后续推荐 E409：KiCad ERC、LTspice 只读链。
- 后续推荐 E410：真实 VS Code/Keil/STM32-GCC 工程证据与 S3/[P-10] 验收。
- 后续推荐 E411：再评估 flash/串口能力；仍需独立人工门与硬件风险设计。

## E408：MCP 统一工作流入口与构建审批（未提交）

- 计划：[`docs/plans/2026-09-14-mcp-unified-workflow-entry.md`](./plans/2026-09-14-mcp-unified-workflow-entry.md)。
- 新增 `workflow-entry.ts`：Keil/STM32-GCC 构建任务先按工程根读取画像，只从 `capabilities[].build` 生成 E404 白名单节点。
- 画像缺失、过期或 build 能力未取证时只执行 `InspectProjectProfile`；多平台未明确选择时先澄清，不猜命令。
- 画像就绪后，pipeline 先展示 Agent/工具/风险并建立人工裁决；批准恢复才交给 `executeDomainWorkflow`，仍受 [P-154] 约束。
- mcp-agent 保留原始工程路径，Keil/STM32-GCC 构建词已接入本地工具路由；不接受 flash/serial。
- 验证：主项目 build 绿；入口/领域工作流/mcp-agent/审批门 25/25，pipeline MCP 2/2，router-v2 86/86；`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仅保留既有 C7 provisional 超期（2 FAIL/0 WARN）。未跑全量、集成/E2E、bench 或真实构建/硬件操作，未提交。

## E409：KiCad ERC 与 LTspice 只读 MCP 链（未提交）

- 计划：[`docs/plans/2026-09-14-kicad-ltspice-readonly-mcp.md`](./plans/2026-09-14-kicad-ltspice-readonly-mcp.md)。
- 新增 KiCad 本地 stdio MCP：沙箱内发现/盘点工程；ERC 固定使用无 shell 的 `kicad-cli sch erc`，报告只写临时目录并在读取后清理，源原理图用摘要复核未改变。
- 新增 LTspice 本地 stdio MCP：只读解析 UTF-8/UTF-16 `.asc` 的元件、实例、模型引用和已有仿真指令；不启动 GUI/仿真，不生成 `.raw/.log/.net`。
- mcp-agent、配置白名单与领域工作流接入 KiCad `eda`、LTspice `simulation` 节点；产物统一为 untrusted。
- 本机已取证 KiCad CLI 与 LTspice 可执行文件路径；KiCad CLI 帮助探测因其尝试初始化用户 Documents 目录而权限失败，未据此宣称真实 ERC 成功，也未提升权限。
- 验证：主项目 build 绿；E409 定向测试 32/32；两个 stdio server 的 `tools/list` 冒烟通过；配置 JSON、`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仅保留既有 C7 provisional 超期（第 19 行，2 FAIL/0 WARN）。未跑全量、集成/E2E、bench 或真实工程 ERC/仿真，未提交。

## E410：MCP S3 真实协议证据与 [P-10] 差距验收（未提交）

- 计划：[`docs/plans/2026-09-14-mcp-s3-real-evidence.md`](./plans/2026-09-14-mcp-s3-real-evidence.md)；证据报告：[`docs/reports/mcp-s3-evidence-2026-09-14.md`](./reports/mcp-s3-evidence-2026-09-14.md)。
- MCP 健康结果新增 initialize、工具名、验证级别及成功只读输出的 SHA-256/字节数/untrusted 证据；失败不生成成功摘要。
- `mcp:evidence` 对 Keil、VS Code、STM32-GCC、KiCad、LTspice 最小夹具执行真实 stdio tools/list 与只读盘点，专业链 5/5 通过。
- 全局 health 中 Windows MCP initialize 在 20016ms 超时；成熟度仍为 L1，因此 S3/[P-10] 未整体通过。
- 验证：主项目 build 绿；health 定向单测 5/5；配置 JSON、`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仅保留既有 C7 provisional 超期（第 19 行，2 FAIL/0 WARN）。
- 未调用 build、ERC、VS Code task、LTspice 仿真、flash 或串口；未跑全量、集成/E2E 或 bench。

## 最新暂停交接（E410 后）

- 当前状态：E403-E410 均已完成但尚未提交；工作树包含更早轮次和用户改动，下次继续时禁止 reset/覆盖，先核对现有 diff。
- owner 于 2026-09-14 明确暂停：Plus 套餐额度仅剩约 1%，担心不足以完整推进 E411；本次暂停后不得提前创建 E411 计划、代码或测试，待 owner 恢复指令后再开工。
- E411 当前状态：尚未开始，零实现改动、零硬件调用、零授权继承。
- 下一轮首选 E411：先只做 flash/串口能力与风险契约，不连接设备；明确设备标识白名单、端口占用检查、固件摘要、逐次人工门、取消/超时和审计证据。
- E411 验收底线：默认无设备授权即零硬件动作；每次 flash 独立确认；串口默认只读且不发送字节；不得因 E410 夹具证据自动授权硬件。
- 后续推荐 E412：统一工作流计划指纹、持久化恢复及 UI 证据链增强。
- 后续推荐 E413：KiCad 编辑与 LTspice 实际仿真写入链，复用项目事务和高风险确认。
- 后续推荐 E414：在用户提供真实业务工程后，分别执行构建/ERC/仿真人工验收，再重跑 [P-10]。
