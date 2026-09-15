# MCP S3 真实协议证据与 [P-10] 差距报告

> 证据时间：2026-09-14T14:56:58+08:00 · 范围：E410 · 结论：专业工具链通过最小夹具验证，S3/[P-10] 整体未通过

## 1. 证据口径

- `npm run mcp:health`：真实启动 `configs/mcp-agents.json` 中的 stdio server；`tools/list` 成功即证明 initialize 已完成，再调用白名单内只读默认工具。
- `npm run mcp:evidence`：对 `projects/e410-mcp-evidence/` 五类最小夹具执行明确的只读盘点工具；不执行 build、ERC、VS Code task、LTspice 仿真、flash 或串口。
- MCP 原始输出不写入报告，只保留 SHA-256、字节数与必要结构事实；所有工具输出均保持 `untrusted=true`。
- 最小夹具证明协议链和解析器可运行，不等同用户真实业务工程验收。

## 2. 专业工具只读证据

| Agent | initialize / tools/list | 只读工具 | 结构事实 | 输出证据 | 结论 |
|------|--------------------------|----------|----------|----------|------|
| Keil | 通过 / 4 工具 | `InspectProjectProfile` | `keil-mdk`、STM32F103C8、单 target、build 能力已取证、flash 无 | 1666 bytes；`53bffbc3115e7a49260c98ec3332b49cf1b7ecd5d9d5aa846b7e8cbf8b87d2f9` | ✅ |
| VS Code | 通过 / 2 工具 | `InspectWorkspace` | task 1、C/C++ 配置 1、实时 Problems 未接入 | 982 bytes；`cff1f9dd73250292851bd23c3e4eaf6cb56a7be114520c15d92b12920f1c52d9` | ✅ |
| STM32-GCC | 通过 / 3 工具 | `InspectProjectProfile` | `stm32-gcc-cmake`、STM32F103xB、单 target、build 能力已取证、flash 无 | 1974 bytes；`9672dc4f1a0692b6e8b70054b9f4f441b57c0aba10d7df4c3ecd10ea0565e4e6` | ✅ |
| KiCad | 通过 / 3 工具 | `InspectProject` | 原理图 1、PCB 1、符号 1、CLI 已取证 | 543 bytes；`09bcc9e1b28a0c0206f178738590d4d064e581ecad8975f12b77356ed408a01e` | ✅ |
| LTspice | 通过 / 2 工具 | `InspectSchematic` | 元件 2、仿真指令 1、软件已取证、仿真未执行 | 393 bytes；`150765c763e2c064439ac64f1f60ea194f4ceeca129f2b019a90dc0eae6c046e` | ✅ |

健康检查的只读默认发现同样通过上述五个 Agent，均记录 `verification=read_only_call`、工具清单、输出摘要与 `untrusted=true`。

## 3. 未通过项

- Windows MCP 在真实健康检查中 initialize 超时：`initializePassed=false`，耗时 20016ms，未进入 tools/list 或只读调用。本轮不跨文件诊断、不扩大启动阈值，也不重复重试。
- 没有用户真实 Keil/CMake/KiCad/LTspice 工程，因此没有真实业务工程的构建、ERC、仿真或硬件证据。

## 4. [P-10] 差距判定

| 条件 | 本轮状态 | 依据 |
|------|----------|------|
| ① S1-S8 全功能切片与回归 | ❌ 未整体通过 | 五个专业 Agent 真实 stdio 只读链已验证；Windows MCP initialize 超时，且本轮没有跑全量回归 |
| ② P-07/P-12/P-08 既有验收 | ⏸ 未复跑 | 保留历史证据，本轮按成本纪律不运行基准与全量验收 |
| ③ 成熟度 L2+ | ❌ 未通过 | `maturity:check` 当前为 L1；用户累积 Skill、样本数与复用率仍未达门槛 |
| ④ doc-lint 0 FAIL + 全量测试/集成绿 | ❌ 未通过 | doc-lint 仍有既有 C7 provisional 超期；本轮禁止自主运行全量/集成 |
| ⑤ 附录 C 无相反证据 + owner 签认 | ⏸ 待最终签认 | 本轮没有请求 owner 把夹具证据签认为正式发布验收 |

结论：E410 完成的是 S3 专业工具真实协议与最小夹具证据补强；[P-10] 仍不能判定通过。
