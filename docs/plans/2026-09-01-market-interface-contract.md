# 推进计划：市场 Skill 沉淀第 13 批——接口契约机器可读（E311）

> 日期：2026-09-01 · 分支：v0.2b · 状态：已完成

## 目标

按五角色审阅 P1（🏗️系统架构师缺口1「接口契约机器可读」）落地：新增市场 Skill `interface-contract`，输出机器可读接口契约——默认 C Header（.h，供 Keil/MDK 编译与子 Agent 按头文件校验实现），query 含 JSON/Schema 时输出 JSON Schema（.json，数据/API 契约校验）。解决「契约只是 Markdown 文本，子 Agent 没法自动校验」的缺口（§2.1 架构师「接口契约」）。用户累积 Skill 36→37。

## 计划

1. `src/skills/market/templates.ts`：`buildInterfaceContract(title, dateLabel, format)`——c-header（头文件守卫/版本宏/命令类型/结构体/接口函数）+ json-schema（draft-07：title/version/type/properties/required）+ `contractMacroToken`（标题转 ASCII 安全宏前缀，中文兜底 CONTRACT）→ verify: templates 单测
2. 薄 CLI `scripts/market-interface-contract.ts`（query 含 JSON/Schema → json-schema，否则 c-header；输出 `<标题>-接口契约.{h|json}`）+ package.json `market:interface:contract` → verify: build 绿
3. manifest `configs/market-skills/interface-contract`（触发词含 模板/生成/写 明确意图；不含裸「接口契约/契约/接口定义」防知识问答被抢）本地安装 → verify: 市场包 37
4. 单测：templates（C 头结构 / JSON Schema 结构 / 宏 token 中文兜底）+ nl-router（模板命中 / 生成C头文件 自然问法 / 防误触不命中）→ verify: build + 定向单测全绿
5. 真实冒烟两格式全链 ok:true + maturity:check 36→37 + doc-lint 0 FAIL 0 WARN

**验收标准**

- `buildInterfaceContract('c-header')` 输出含 `#ifndef`/版本宏/`#include <stdint.h>`/结构体/接口函数，标识符为 ASCII token（中文标题不产出非法 C 标识符）
- `buildInterfaceContract('json-schema')` 输出 draft-07 `$schema`/`type: object`/`properties`/`required`
- 触发词：接口契约模板/生成接口契约/写接口契约/接口契约生成/契约模板/生成C头文件/生成c头文件/生成头文件/生成JSON Schema/生成json schema；「接口契约是什么」「什么是接口定义」不命中
- 冒烟两格式 ok:true + 市场包 36→37 + maturity 37/50+ + doc-lint 0 FAIL 0 WARN

## 执行过程

### 改动

- `src/skills/market/templates.ts`：`buildInterfaceContract`（c-header：`__<TOKEN>_CONTRACT_H` 守卫 + `CONTRACT_VERSION` 宏 + `CMD_<X>` 占位 + `typedef struct` + 三个接口函数；json-schema：draft-07 cmd/length/payload 示例）+ `contractMacroToken`（标题 → `[A-Za-z0-9_]` 安全 token，非 ASCII 剥离，空则 CONTRACT）。
- `scripts/market-interface-contract.ts` + package.json `market:interface:contract`（E251 @input；格式由 query 是否含 JSON/Schema 决定）。
- `configs/market-skills/interface-contract/manifest.json`（command + input:query + 中文触发词，裸词不登记）。

### 遇到的问题

- **C 标识符合法性**：中文标题直接进 `typedef struct {…} <标题>Frame_t;` 会产出非法 C 标识符（如 `网关告警Frame_t`）——统一用 `contractMacroToken` 转 ASCII 大写 token 作为结构体/函数名（`STM32_BLEFrame_t` / `int STM32_BLE_init(void)`）。
- **触发词防误触**：裸「接口契约」「契约」「接口定义」都不登记——「接口契约是什么」「什么是接口定义」是知识问答，会被子串匹配抢走；只登记带「模板/生成/写」的明确意图形式（E301/E305 纪律延续）。

## 结果

- 验证：`npm run build` 绿；templates 22/22 + nl-router 26/26（新增 6 条：C 头结构 / JSON Schema 结构 / 宏 token / 模板命中 / 生成C头文件 自然问法 / 防误触）；doc-lint 0 FAIL 0 WARN；真实冒烟两格式全链 ok:true——「生成STM32与蓝牙模块的接口契约模板」→ `STM32与蓝牙模块的-接口契约.h`、「生成设备上报的JSON Schema接口契约」→ `设备上报的JSON Schema-接口契约.json` 落沙箱；maturity:check 用户累积 Skill **36→37**/50+。
- 测试：templates 22/22 + nl-router 26/26（48/48）。
- 提交：未提交（owner 未要求）。
- 遗留事项：P1 剩余——里程碑复盘自动触发（项目经理缺口1）；P2——proactive-assistant + notification-hub（秘书）。
