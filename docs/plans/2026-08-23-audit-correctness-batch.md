# 推进计划：架构审计正确性批（H9 / B1 / B4 / H8）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成（待提交）

## 目标

处置架构审计 `docs/2026-08-23-architecture-code-audit.md` 「短期（正确性）」批次：
H9（search-loop 字面量 "null" 查询 + Tavily 补搜串行黑洞）、B1（P-82 分差死参数）、
B4（skill 失败误报"尚未接入"）、H8（skills-config 每次问答 ~24 次同步读盘）。

## 计划

1. H9 `src/search/search-loop.ts`：`${part}` 前缀的补搜查询仅在 part 非空时加入
   （无型号只发 `site:` 定向查询，杜绝 "null 立创商城 …"）；fallbackSearches 改
   `Promise.allSettled` 并联，尾部延迟压到单次超时；先攒查询再消耗 Tavily 月配额。
2. B1 `src/agent/router-v2.ts`：抽出 `shouldOptionClarifyByGap(top, second)`，
   移除 `|| deduped.length > 1` 恒真分支，让 P-82 分差门槛恢复生效（宽分差 → confirm）。
3. B4 `src/search/pipeline.ts`：路由执行器 catch 不再落到"尚未接入"，改如实返回
   `执行器执行失败：<skill>（<error>）`。
4. H8 `src/config/skills-config.ts`：`readDisabledSkills` 按文件 mtime 缓存 Set，
   `writeDisabledSkills` 显式失效——每次问答 ~24 次 readFileSync+JSON.parse 降为 stat。
5. 测试：H9 无型号不发 "null" 查询 + 补搜并发；B1 分差门槛单测 + PCB 宽分差走 confirm；
   B4 执行器抛错返回失败文案；H8 缓存读写回归。
6. 验证：`npm run build` → 相关单测 → `npm run test:all` → `npm exec tsx scripts/doc-lint.ts`。
7. 文档：本计划补结果；交接登记；B1 行为变化提示 devil-v25 基准复跑（需网络/配额）。

**验收标准**

- `rtos 看门狗怎么配置`（无型号命中技术域）Tavily 补搜不出现 "null" 前缀查询。
- 多条补搜并发执行（最大并发 ≥2，串行时恒为 1）。
- 中置信带 2+ 候选、top 分差 ≥ P-82 时决策为 confirm；分差 < P-82 仍 option_clarify。
- skill 执行抛错返回"执行失败"而非"尚未接入"。
- skills-config 读写、外部 mtime 变化都能取到最新值。
- 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/search/search-loop.ts`（H9）：Tavily 官方域补搜先攒查询再消耗配额——
  无型号（part=null）时只发 `site:` 定向查询，`${part} … datasheet` 与
  `${part} 立创商城 芯查查 半导小芯 datasheet` 仅在 part 非空时加入，杜绝
  "null 立创商城 …"；fallbackSearches 改 `Promise.allSettled(...map(...))`
  并联，尾部延迟压到单次超时；无查询可发时不消耗月配额。
- `src/agent/router-v2.ts`（B1）：抽出 `shouldOptionClarifyByGap(top, second)`，
  移除 `|| deduped.length > 1` 恒真分支——second 存在 ⇔ 候选数 >1，该分支令
  P-82 分差门槛恒不生效、消歧率被硬性放大；现在仅 top-second < P-82-1e-9 才
  option_clarify，宽分差直接 confirm。
- `src/search/pipeline.ts`（B4）：路由执行器 catch 不再落到"尚未接入"误报，
  改如实返回 `执行器执行失败：<skill>（<reason>），当前无法完成。` 并记录
  failed 产物事件。
- `src/config/skills-config.ts`（H8）：`readDisabledSkills` 按文件 mtime 缓存
  Set（statSync 命中即返回缓存），`writeDisabledSkills` 写后显式失效；外部改动
  由 mtime 变化覆盖。每次问答 ~24 次 readFileSync+JSON.parse 降为 stat。
- 测试：router-v2（B1 分差门槛纯函数 + PCB 宽分差 confirm + 窄分差仍
  option_clarify）、search-loop（无型号不发 null 查询 + 补搜并联并发 ≥2）、
  pipeline（im-dispatch 开库失败如实归因）、skills-config（缓存复用 + mtime 失效）。

### 遇到的问题

- B1 行为变化：route-cases.jsonl 中「帮我检查一下这个PCB的安全性」从
  option_clarify 翻转为 confirm（top 0.700 vs second 0.380，gap 0.320 ≥ P-82 0.15）；
  `_route_worse.ts` 探测显示 5 条 worse，devil-v25 基准复跑需网络/配额。
  交接摘要所述"PCB 用例断言 option_clarify"与实际不符——现有 PCB 用例只断言
  候选不断言决策，本次补 confirm 断言。
- B4 触发路径：真实 Skill 执行器几乎全部内部 try/catch 吞错，唯一未捕获抛错点是
  im-dispatch 的 `ensureDb`（`new DatabaseSync` 对目录路径必抛）；且 im-dispatch
  的 dbPath 在 registry 模块加载时捕获（ESM 导入先于测试文件模块体执行），测试内
  后设 `MESSAGES_DB_PATH` 无效，需对 `cwd/data/messages.db` 目录占位触发。
- 本环境 apply_patch 工具不可用（codex.exe Access denied），测试改动改用
  PowerShell 精确字符串替换，逐锚点校验出现次数防误替换。

## 结果

- 验证：`npm run build` 通过；`npm run test:all` 单测 621/622（1 skip）+ 集成 17/17；
  `npm exec tsx scripts/doc-lint.ts` 0 FAIL 0 WARN（正文 1185/1800，附录 939/950）。
- 测试：单测 621 pass（较基线 615/616 增 +6）+ 集成 17 pass，0 fail。
- 提交：待提交（并入本批架构审计待提交清单）
- 遗留事项：
  - B1 决策翻转会改变 devil-v25 基准采样，9 月配额重置后复跑
    `npm run bench:devil-v25` 并登记附录 A。
  - 审计剩余批次：短期决策 H6/D1-D5 → 中期 P1-P17。
