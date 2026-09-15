# v1.0 推进快照：MCP/S3 状态校正（2026-09-13）

## 结论

- [P-10] 仍未通过。
- S3 的 MCP stdio 工具适配层当前健康：本机 `windows-mcp` 握手、工具清单及 `Process(mode=list)` 只读调用通过，危险 `kill` 仍由安全门拒绝。
- S3 不再按“专业子 Agent 已完成”统计：KiCad、Altium、FreeCAD、VS Code、Cursor、LTspice 仍为未配置占位；Keil 仅完成低风险垂直链；现有 dispatcher 尚无动态多 Skill 工作流执行器。

## E389 状态更新

- dispatcher 已不再丢弃 `task`，并统一返回 task、确定性执行计划、进度事件、文本产物、MCP 调用证据、结构化失败、取消状态与人工接管建议。
- 成功、失败、白名单拒绝、超时、降级、取消和无可用 Agent 均使用同一契约；真实 Windows MCP 链已验证该契约。
- 这里的 plan 是可审计的执行阶段，不是 LLM 自主规划；专业工具语义、独立上下文和领域产物仍需在 Keil 等垂直实现中补齐。因此 S3 仍不能判定为完成。

## 当前证据

- `npm run mcp:health`：1 个配置、1 个检查、0 个跳过；19 个工具；握手与 tools/list 约 5.2 秒，只读默认调用约 1.8 秒。
- `node --import tsx --test tests/integration/mcp-real-server.test.ts`：3/3 通过。
- Windows MCP 专属 `startTimeoutMs` 从 10 秒调整为 20 秒，以容纳曾出现的冷启动波动；全局 [P-57] 不变。
- 健康检查只调用注册表声明且通过白名单校验的默认参数；当前仅为 `Process(mode=list)`，未扩展写操作权限。

## [P-10] 影响

- 条件①不能再仅凭 E222/E240 提交号认定“专业子 Agent 全功能切片完成”；后续须以至少一个专业 Agent 的真实垂直闭环重新验收。
- 条件③仍为 L1：2026-09-13 自检为用户 Skill 40/50、验收样本 23/30、复用率 20.9%/60%。
- 条件④当前也未满足：`doc-lint` 仍因需求文档第 19 行 provisional 超期为 2 FAIL / 0 WARN；本轮未运行全量测试、E2E 或 bench。

## E390 Keil 垂直链更新

- Keil 已从纯占位推进为首个专业 Agent 垂直链：本地 stdio MCP server 暴露 `DiscoverProjects` 和 `BuildProject`。
- 发现严格限制在 projects/sandbox/outputs 白名单根，拒绝越界并跳过 symlink；build 只接受现存 `.uvprojx`，固定调用 UV4 `-b`，按 [P-38] 超时，不提供 flash 工具。
- 编译器/链接器 warning/error、退出码、日志与超时会形成结构化结果；失败输出仍进入 E389 artifact/evidence，不被压成泛化错误。
- 本机 `D:\Keil_v5\UV4\UV4.exe` 已接入本地配置，`mcp:health` 为 Windows + Keil 2/2；Keil 真实 server 的工程发现链已通过。
- 工作区白名单内暂无真实 `.uvprojx`，因此未执行真实固件编译；当前结论是“发现链真实可用、build 适配器通过 mock/协议测试”，不能写成真实 Keil 编译验收完成。

## 下一验收切片

- 运行契约已由 E389 落地，Keil 低风险垂直链已由 E390 实现；E391 已补齐调用方取消、MCP 取消通知、server requestId 中止与 UV4 进程树终止。
- E391 证据：定向单测 30/30、Windows + Keil MCP 集成 6/6、`mcp:health` 2/2；[P-38] 超时与用户取消均已验证终止真实父子进程树。
- 白名单工作区仍无 `.uvprojx`，因此下一验收缺口仍是用户提供真实工程后的 UV4 build；当前不能把 S3 或 [P-10] 判为完成，且仍不开放自动烧录。

## E392 Keil target 与诊断产物更新

- Keil MCP 新增只读 `ListTargets`，可从沙箱内 `.uvprojx` 返回 target 清单；真实 stdio 集成已覆盖多 target。
- build warning/error 现在携带可选 `sourcePath`：只对工作区白名单内真实存在的文件生成，越界或不存在路径保持不可点击。
- 结构化 target/诊断产物已贯通 mcp-agent、统一 pipeline/API 与桌面 UI；明确 `.uvprojx` 请求不再被通用问答路由截获。
- 当前证据为主项目/UI build、定向测试、协议集成和健康检查；没有白名单内真实工程，因此仍不构成真实 UV4 build 或 S3 完成证据。

## E393 多文件事务门更新

- 新增项目级快照、整批预检、提交前一致性检查和全量暂存边界；预检、冲突或暂存失败均不会触碰目标文件。
- 跨文件 rename 无法承诺底层强原子性；提交中断会返回 `partial_failed` 与已提交/待提交清单，并保留快照，不能据此开放专业 Agent 写入。
- 下一验收切片是基于快照自动恢复部分提交并登记 append-only 事务状态；完成冲突仲裁和用户确认入口后，才评估 EDA 受控写入。

## E394 项目事务恢复更新

- 逐文件提交中断已能从 E393 快照自动恢复覆盖文件并删除新建文件；恢复结果逐路径校验，失败时保留未恢复路径和快照。
- operation log 已增加 transaction 事件，按 transactionId 记录 prepared/completed/rolled_back/failed，同时保持原单文件回滚查询兼容。
- 写入门仍未完成：提交前冲突只会整批拒绝，尚无用户仲裁与多文件确认入口，因此仍不能开放专业 Agent 工程写入。

## E395 项目事务冲突契约更新

- 提交前冲突检查已从首个错误字符串升级为完整冲突清单，可区分外部修改、外部删除和外部创建。
- 每条冲突只提供路径、存在状态与 snapshot/current/proposed SHA-256，不暴露文件正文；检测到任一冲突时整批零写入。
- 仲裁契约固定提供“保留外部版本 / 使用事务版本 / 取消整批”，默认取消整批且要求用户确认。本轮不执行选择，也没有接入 gateway/UI 或 decision log。
- 写入门仍未完成：下一验收切片是用户确认入口和 append-only 决策证据，确认后还必须重新校验外部状态，不能因已有选择自动覆盖。

## E396 项目冲突确认与证据更新

- E395 冲突契约可登记到现有人类裁决队列；pending 同时保存结构化三选项、默认取消、确认要求及事务/冲突摘要。
- gateway 支持 choice 裁决，带 choices 的记录拒绝普通 approve/reject 与非法选项；UI 显示“保留外部版本 / 使用事务版本 / 取消整批”三个按钮。
- 最终选择以新事件追加 selectedChoice/refId，原 pending 不改写；任何 choice 在本轮都不触发事务执行，目标文件保持不变。
- 写入门仍未完成：下一验收切片是选定策略后的状态重校验与安全执行；外部状态再次变化必须重新阻断。

## E397 项目冲突重新校验与执行更新

- 事务级解析器只接受 decision log 中已落盘且与 pending/transaction/contract 完整绑定的裁决事件；缺失、错事务或篡改契约均拒绝。
- 写入前复核全部路径；确认后发生任何存在状态或摘要变化会返回新的 `reconfirmation_required` 契约，目标零写入。
- `cancel_all` 保留整批，`keep_external` 保留冲突文件并提交其余文件，`use_transaction` 提交整批；写入型选择均重新创建当前状态恢复快照。
- 提交中断会恢复用户确认时的外部版本，不会用旧快照抹掉外部修改。gateway 尚不持久化事务正文，需由下一轮 project-writer 多文件入口在同一进程内显式编排。

## E398 project-writer 多文件确认更新

- project-writer 支持 `params.fileChanges` 和 fenced JSON `{files:[...]}` 结构化多文件输入，至少两项；整批预检失败时不创建可执行变更。
- 确认前通过 E393 prepare 生成项目快照，返回只含创建/修改、路径、字节数和摘要的 `project-change-confirmation` artifact，正文不进入卡片或 decision log。
- 结构化多文件请求即使被规则路由判为 direct，也会强制进入专用确认门；pending 固定为 `confirm_changes` / `cancel_all`，默认取消且不带自动执行 resume。
- 当前批准仍只记录证据、目标零写入；下一验收切片是进程内待处理事务仓库、取消清理和批准后的安全 commit/冲突转接。

## E399 project-writer 待处理事务仓库更新

- E398 pending decision id 现在与 prepared transaction 绑定在同一进程内；文件正文仅驻留内存，不进入 decision log 或 API 回执。
- `cancel_all` 会删除精确事务快照并追加 `cancelled` 审计；`confirm_changes` 复用既有冲突检查、全量暂存、提交和自动回滚边界。
- 首次确认时若外部状态已变化，目标零写入，并生成 E395/E396 三选一冲突 pending；同一事务改绑到新 pending id。
- 进程重启或仓库记录缺失时返回 `expired`，不会从日志恢复或猜测正文；gateway/UI 已区分已提交、已取消、待冲突裁决和已失效。
- 写入门尚未完全闭环：E397 的冲突三选一执行器仍未接 gateway；MCP 规格补强后，下一验收切片顺延为 E401 冲突裁决恢复执行与再次变化重确认。

## E400 MCP 领域工作流规格与 VS Code 更新

- §4.1.2 明确 Skill 方法层、子 Agent 执行层、MCP 工具桥接层，软件名称不再等同于专业 Agent 已完成。
- 工程任务采用单一领域入口与按项目裁剪的工作流节点；节点声明输入、输出、负责 Agent、允许工具、文件范围、风险、验收和回退，并用结构化 artifact/evidence 交接。
- 质量门与人工门分离：机器检查通过不自动授予下载、写文件、烧录或硬件操作权限；MCP 返回继续属于 `untrusted_data`。
- VS Code 已纳入嵌入式软件清单和编码类子 Agent 注册表，但保持未接入占位；未安装、未启动、未控制真实 VS Code，也未宣称可用。
- 验证为主项目 build、MCP registry 2/2 与 gateway 子 Agent 目录 1/1；`doc-lint` 除既有 provisional 超期外无新增问题，不能据此把 S3 判为完成。
- 文档检查：`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。

## E401 MCP 项目画像与循环熔断更新

- 项目工具链信息不再留给模型临场猜测：schema 和 TypeScript 契约规定首次只读盘点形成 `data/project-profiles/<projectId>.json` 证据缓存，未知项显式 `null`。
- build/flash 仅能登记结构化 MCP 工具引用，拒绝裸命令字段；模型候选不能授权动作，最终调用仍经过 registry、白名单和人工门。
- [P-154] 将完整“构建→烧录→验证→修订”自动循环与 [P-44]/[P-45] 单点重试分离；默认最多两轮，超限要求携带串口日志与最近 diff 人工接管，每轮烧录仍独立确认。
- §13 已补录全部现有 MCP 生产文件及新增 schema/守卫；验证为主项目 build、8/8 目标测试、schema 解析与文档 lint，未运行全量测试、E2E 或 bench。
- 当前仍只是契约层闭环：画像 store/探测编排、动态工作流执行器与第二平台尚未实现，因此 S3 和 [P-10] 仍不能判定完成。
