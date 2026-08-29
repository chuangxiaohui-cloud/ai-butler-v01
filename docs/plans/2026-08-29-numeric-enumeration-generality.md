# 计划：数值列举通用性钉死（P-137 后缀去金融化 + 单位表跨领域扩展，E277）

> 日期：2026-08-29 ・ 对应 E277 ・ 用户拍板方案

## 背景

用户判断：市值 query 折腾多轮只是症状，病根是「需要具体数值的列举型 query」的证据选择机制缺失，与领域无关——延迟最低的数据库 / 价格最贵的显卡 / 评分最高的电影 会得到与市值一模一样的失败。`[P-ZZZ']`（predicate + 内容形态密度 + 覆盖度门控）正是对这一整类 query 的通用修复。核对代码后确认机制本体零领域词，但有两处「值」的领域化残留 + 测试语料全为市值页。

## 计划（用户拍板：先②③后①，②③纯加法零风险，①用用例 1 兜底验证）

1. 扩单位表（②）：`numeric-pattern.ts` 单位表 亿/万/港元/美元/元/%/倍 → 金额+时间延迟+硬件+音视频+评分计数五类 → 验证：跨领域单测
2. 补跨领域单测（③）：numeric-pattern 5 条 + fusion 1 条 → 验证：`npm test` 全绿
3. 改补检索后缀（①）：`params.ts` P-137 ' 亿元' → ' 数据 参数 对比' → 验证：用例 1（后缀断言 + ms 密度）

## 执行

### ② 单位表扩展（`src/search/numeric-pattern.ts`）

- 新增 `NUMERIC_UNITS`（导出）：金额 亿/万/千/港元/美元/美金/元/块；时间延迟 ms/毫秒/us/微秒/ns/纳秒/秒/s/分/分钟/小时/h；硬件 核/GHz/MHz/GB/TB/MB/KB；音视频 帧/fps/Hz/kHz/Mbps/Kbps；评分计数 星/颗/%/倍/个/项/条。
- 正则构建：长单位优先排序（12毫秒 不被拆成 12毫+秒）+ 英文单位结束词边界 `(?![A-Za-z0-9])`（12msx 不误命中）+ 元字符转义（%）。
- 纯加法：`hasNumericUnit` / `numericUnitCount` 行为只扩不减；既有断言仅 ms 一条由 false 翻 true。

### ③ 跨领域单测

- `numeric-pattern.test.ts` 新增 5 用例：数据库延迟（ms 密度 + P-137 后缀断言）、CPU 核数（核/GHz）、游戏帧率（帧/fps）、商品评分（星/颗）、纯泛文反例（不触发密度）。
- `fusion.test.ts` 新增 1 用例：数据库延迟页(ms) [P-136] 密度加权高于同相关泛文。

### ① P-137 补检索后缀（`src/config/params.ts`）

- `' 亿元'` → `' 数据 参数 对比'`（领域中性触发词，量纲无关；引导搜索引擎返回带数据的对比/表格页，非金融 query 不再被污染成金融检索）。
- 同步文档：§5 P-137 行值、§6.5.6 措辞（带单位后缀→带领域中性触发后缀）、附录 A E277。

## 结果

- 目标单测（numeric-pattern + fusion + answer-readiness）41/41 绿，含 2 条新跨领域用例。
- 全量 `npm run test:all` 绿（单测全绿 + 集成 32/32）。
- `npm run doc-lint` 0 FAIL 0 WARN（C8 61 key）。
- 登记：附录 A E277；[P-137] 值修订（provisional）；`bench:na(new-param)` 理由：P-137 仍为 provisional，本次为值修订 + 单位表扩展（纯代码非 PARAM），验证走离线单测，待 `bench:devil-v25` 回归评估。

## 真实管道复测（2026-08-29，用户手动跑 `npm run dev -- "延迟最低的数据库有哪些"`）

- **证据选择已通用生效**：`predicate=numeric`；71 条召回，top-3 evidence 全为数据库性能对比页（浪潮KaiwuDB 时序性能第一 / PolarDB TPC-C 登顶 tpmC=20.55亿 / 分布式SQL对比 写延迟 22ms vs 6ms），零金融污染——P-137 中性后缀未把 query 带歪。
- **直接作答仍被 heavy 档预算吃掉**：CLI `main.ts` 硬编码 `llm: createOptionalHeavyClient()`（未选档时 s5 用该客户端，不走 medium tier），v4-pro 推理吃满 [P-130] 30s → `synthesis_timeout`（`LLM fallback 链总预算 30000ms 超时`），elapsed 91s。这是 E274 已记录的 heavy 档残余，与证据选择无关。
- **兜底可用**：输出为「回答生成超时…」+ 标题/片段/独立 URL，片段已带关键数字（22ms/6ms），原始落盘无 URL 双包裹（粘贴里看到的双链接是桌面端 markdown 渲染）。
- CLI 默认档位已由用户批准改 medium（E278：`main.ts` → `createOptionalMediumClient`），消除 CLI 必现 heavy 超时；真实重跑直接作答（gate=none，49s）。

## 残余

- '个/条/项' 等高频通用量词计入密度可能轻微稀释列举页区分度（rel≥0.1 护栏 + 头部 240 字符切片已压制，若噪音出现可移出单位表）。
- 真实管道端到端验证（延迟/价格/评分 query）需用户手动跑 `npm run dev`，按全局成本纪律不代跑。
