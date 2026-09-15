# v1.0 推进快照：项目冲突裁决恢复（2026-09-14）

## E402 结论

- E397 的三选一事务执行器已接入 E399 的进程内事务仓库和 gateway。
- 冲突裁决只有在 append-only 选择证据成功落盘、事务身份与完整冲突契约一致时才执行。
- `keep_external`、`use_transaction`、`cancel_all` 已有仓库层测试；确认后再次变化会零写入并生成新 pending。
- gateway 完整链“首次确认→发现冲突→冲突 pending→选择事务版本→完成写入”已通过。
- 进程内事务缺失仍返回 `expired`，不从日志恢复正文。

## 当前边界

- 不自动选择、不自动合并、不持久化文件正文，不扩大到 EDA 写操作。
- 本轮没有改变搜索、PARAM、MCP 或 UI 行为；[P-10] 仍未通过。
- 未运行全量测试、E2E 或 bench；验证仅使用主项目 build 与定向测试。

## E403 结论

- E401 项目画像已从 schema 契约推进为稳定 projectId、原子保存和严格读取的运行时证据缓存。
- Keil `InspectProjectProfile` 可只读解析 `.uvprojx` 的 target/device，并在 UV4 配置可验证时登记结构化 build 工具引用。
- 多 target、未配置工具链和未知硬件信息不会由模型补猜；flash、serial、sdkRoot 保持 `null`。
- mcp-agent 已接通自然语言盘点请求与 `keil-project-profile` 结构化产物。
- 本轮 build 通过、定向测试 24/24；未执行真实 build、flash、串口、集成/E2E 或 bench。[P-10] 仍未通过。

## E404 结论

- E400 的节点责任字段已落成最小可执行契约，当前只接受 Keil 项目画像盘点与 build。
- 执行器复用统一 MCP dispatcher，按序输出带 nodeId 的结构化 artifact/evidence；上游失败不会继续执行下游。
- E401 的 [P-154] 已接到含 build 工作流入口，超限时任何 MCP 工具都不会被调用。
- 本轮 build 通过、定向测试 18/18；未接入 flash、串口、并行 DAG、持久化恢复或真实 MCP 执行。[P-10] 仍未通过。

## E405 结论

- VS Code 已从纯注册表占位推进为可配置的本地只读工作区 MCP，支持工作区发现与配置盘点。
- JSONC tasks/launch/C/C++/build settings 可形成结构化证据；task 命令内容不会回显或执行，配置损坏按文件隔离。
- problemMatcher 仅标记诊断来源已配置，实时编辑器 Problems 仍明确不可用；没有启动、控制或写入 VS Code。
- mcp-agent 和 E404 工作流已接入 VS Code 只读节点；本轮 build 通过、定向测试 29/29。[P-10] 仍未通过。

## E406 结论

- STM32-GCC/CMake 已成为第二个平台代码链，工程发现、画像、受控 build 与诊断均有实现。
- 无工具/目录/芯片证据时不猜测；E407 后同根异平台画像改为字段级证据合并。
- flash/serial 未开放；本轮 build 通过、定向测试 33/33，未执行真实硬件或昂贵验收。[P-10] 仍未通过。

## E407 结论

- 同根 Keil/STM32-GCC 画像已从整份覆盖改为字段级证据合并，两个平台能力按 `agentId` 共存。
- 字段遵守既有来源优先级和同来源新鲜度；模型候选 target 不进入可信 target 合集。
- 规划读取由调用方提供新鲜度截止点；过期 build/flash 及能力 build 降为空并要求重探测，不能授权动作。
- 本轮 build 通过、定向测试 28/28；未新增 TTL PARAM，未运行真实构建、全量、集成/E2E 或 bench。[P-10] 仍未通过。

## E408 结论

- Keil/STM32-GCC 构建已接入画像优先的统一规划入口，工具参数只来自校验后的结构化 capability。
- 画像缺失/过期时只读盘点，多平台歧义先澄清；画像就绪后共享 pipeline 先建人工裁决，批准恢复才执行。
- 批准后的执行继续复用领域工作流和 [P-154]，未开放 flash/serial，也未把首次批准扩张成后续轮预授权。
- 本轮 build、入口/审批/pipeline/router 定向回归通过；未执行真实 MCP/构建或昂贵验收。[P-10] 仍未通过。

## E410 结论

- Keil、VS Code、STM32-GCC、KiCad、LTspice 五个专业 Agent 已通过真实 stdio initialize、tools/list 与最小夹具只读盘点；证据见 `mcp-s3-evidence-2026-09-14.md`。
- Windows MCP 本轮 initialize 达到启动超时，未形成工具清单或只读调用证据，因此 S3 不能判为整体全绿。
- 成熟度轻量自检仍为 L1；本轮不运行全量、集成/E2E 或 bench，doc-lint 既有 C7 provisional 超期也仍存在。[P-10] 仍未通过。
