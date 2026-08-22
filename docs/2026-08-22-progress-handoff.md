# 进度交接 2026-08-22（v0.2b 续作）

> 当前分支：`v0.2b`｜E177-E187 已提交（HEAD=`dffa89c`），E187 恢复复核登记待 housekeeping。上一份交接见 `docs/2026-08-21-progress-handoff.md`。

## 今日已收口

1. **表格垂直组标签 3 行+ 支持（E177）**：`scripts/office_image_ocr.py` `detect_merges`
   阶段 B 垂直/角落合并的扫描行数由 `band = min(2, rows)` 独立为 `band_v = min(3, rows)`，
   3 行 L 形表头（`产品` 跨 A1:A3 + `地区` B1:C1）可完整还原；阶段 C 内部空隙分支与
   槽位法分别加守卫（角落合并占住邻居时空锚点不再崩、文本底边越线 2px 不再产生
   pseudo-merge）。
2. **扫描件倾斜纠正 deskew（E178）**：`scripts/office_image_ocr.py` 新增 `deskew_image`
   （HoughLinesP 近水平网格线中位角估计，|角度|≥0.25° 时 warpAffine 白边旋转纠正），
   `--table` 路径先纠偏再做 OCR 与网格线检测；cv2 缺失回退原图不抛错；噪声/模糊/混合/
   旋转（0.8°-1.5° 含 expand）变体下合并结构全部保持，deskew 修复旋转场景。
3. **UI 设置面板集成邮件/日历（E179）**：gateway 新增 `GET/POST /api/mail/credentials`
   （读取不回显授权码）与 `GET /api/calendar/export`（.ics 下载）/ `POST /api/calendar/import`
   （ICS 文本导入）；`calendar-skill` 抽出可复用 `openCalendarDb`/`buildCalendarIcs`/
   `importIcsToDb`（导入导出行为不变，既有 31 条单测原样通过）；UI 原型设置区新增
   “邮件/日历”面板（SMTP 凭据表单、日历导出下载/文件导入）。
4. **UI 邮件发送入口（E180）**：UI 原型“邮件”设置面板新增发信区块（收件人/主题/正文 +
   发送按钮），发送走 `/api/ask` 同一问答管道——面板拼“发送邮件给 …，主题：…，正文：…”
   查询，由 office-daily 邮件模式承担缺项/未配置凭据诚实拦截与 SMTP 发送，答案原样回显；
   不新增独立发信链路。

5. **扫描件透字/折痕/彩色底鲁棒性（E181）**：`scripts/office_image_ocr.py` 新增
   `suppress_faint_ink`（局部对比度抑制：高斯模糊 5px 背景差 > 85 的浅墨/透字/水印
   置白，对干净扫描件为空操作），`--table` 路径 deskew 之后、OCR/网格线检测之前调用；
   `detect_merges` 阶段 B 垂直扩展新增截断守卫——上方同列有其它文本且未被 covered
   （正常标题行下的垂直组标签）时不再产出截断伪合并，改追加 `merged_conflict` warning
   如实提示“可能为透字/水印噪声，无法自动还原”，并把相关槽位标 covered 防止水平启发
   式误并。透字墨色过重超出抑制范围时靠守卫诚实降级，不产出错结构。

7. **复杂表头合并还原（E183）**：`detect_merges` 三处修复——角落列垂直标签可延伸到
   表身底部（整行标题下“产品 A2:A3”）；`r_top` 扩展遇到 covered 格停止（标题行不再被
   并入或冲突跳过）；相位 C 内部空区间归属改用槽位中心（对称空区间不再因 OCR 偏移误分）；
   1×1 退化候选跳过。验收 3 场景全过：A1:A3+B1:D1、A1:D1+A2:A3、A1:A3+B1:E1+B2:C2+D2:E2。
8. **左上角垂直标签+斜跨/嵌套多层表头（E184）**：`detect_merges` 新增相位 B0——第 1 行
   锚点的垂直组标签向下扩展（左上角标签“产品 A1:A3”，四道守卫防缺值/透字残影/右缘表头列
   误并）；相位 C 排除垂直合并列并放行“全非数字锚点+单格空隙”的嵌套多层行。验收 3 场景
   全过：T1 `A1:A2`+`B1:C1`+`D1:E1`、T2 斜跨阶梯 `A1:A3`+`B1:C1`+`D1:E1`、
   T3 嵌套 4 层 `A1:A3`+`B1:E1`+`F1:G1`+`B2:C2`+`D2:E2`。

9. **跨页大表拼接（E185）**：`scripts/office_image_ocr.py` `--table` 新增多页 PDF 输入
   （fitz dpi=200 逐页渲染）；`process_table_array` 单页管道 + `stitch_table_pages` 跨页
   拼接——逐后续页求与首页的最长公共表头前缀（非空格文本匹配率 ≥70%），重复表头自动去重、
   正文行顺序追加，merges/cells/spans 按全局行号重排（复用逐页 TSR bbox/span，不重跑整图
   识别）；列数不一致按首页列数补齐/截断并告警 `page_col_mismatch`，表头无法匹配整页追加
   并告警 `page_header_mismatch`（诚实降级不丢数据）；输出 JSON 新增 `pages`/
   `page_stitched`/`page_headers`。`office-daily` `table_ocr` 接受图片或 PDF，答案文案多页
   前缀“N 页拼接”。`suppress_faint_ink` 模糊半径按图像尺寸自适应（min 边 ≤1000px 保持
   5px，大图按 min/100 放大），修复 200dpi 渲染页细网格线碎裂导致的伪列。验收：合成 2 页
   表 PDF → xlsx 6 行 × 5 列、merges 仅首页表头 `A1:A2`+`B1:C1`+`D1:E1`、锚点格与第 2 页
   正文落位断言、答案含“2 页拼接”与“已还原 3 处”；单图 t1/t3（E184）与 420×430 小图
   （E181）回归 merges 完全一致。

10. **跨页拼接鲁棒性——表头匹配加结构证据（E186）**：`scripts/office_image_ocr.py` `_row_similar`
    新增 span 级结构证据——非空格列位置模式相同且 ≥1 个非空格格文本一致时判同（OCR 噪声/透字粘连下
    表头文本变化但列结构不变仍可去重；文本锚点守卫防稀疏正文行误判），文本先归一化再比较；
    `detect_table_lines` 新增 `_merge_near_edges`（相距 ≤5px 的网格线候选边合并，消除 200dpi 渲染页
    透字抑制造成的幻影空行/列）；阶段 C 整行空格（`start==0` 且 `end==cols-1`）跳过，防 `anchor_c`
    越界崩溃。`office-daily` 告警类型新增 `page_header_mismatch`/`page_col_mismatch`，分页对齐告警
    单独成句“检测到 N 处分页对齐问题…已按普通文本逐格填充，请核对后手动调整”。验收：真跑 2 变体——
    第 2 页表头噪声（`2024`→`2O24`）+ 旋转 1.2° + 透字 → 6 行 × 5 列、merges 仅首页表头、零 warning、
    答案含“2 页拼接”；无表头续接页 → 诚实降级（整页追加 + `page_header_mismatch` 告警，不崩溃不丢数据）；
    DPI 150/200/250/300 复核维持 `TABLE_PDF_DPI=200`；单图回归 t1/t3（E184）与 420×430 小图（E181）零回归。

11. **E1/E2 复验门复核与口径修正（E187）**：复核 E1/E2 复验门——`recheck-gates`/`finalize-gates`
    原把“!ok 率”标为“超时率”且未覆盖对冲③，本轮输出拆分为 failRate / timeout5sRate / 双返回率，
    E2 判断区分复验门（超时率）与对冲③（双返回率<70% 触发重开）。结论：E1 复验门 PASS
    （classify n=70、timeout 0%、准确率 80%、p95=1406ms → 推荐 [P-04]=1750ms，等 owner 签认）；
    E2 全库无 Bocha 真实 5s 超时（max=1055ms、timeout5sRate=2.5%；AnySearch=8.0%，复验门未触发），
    但双返回率 31.7%<70% 触发对冲③ → [P-02] 重开决策；2026-08-22 探活：充值前 Bocha 10/10 快速失败（failRate 100%、超时 0%）、双返回率 0/10；充值后同日复核 Bocha 10/10 ok、双返回率 10/10——可用性恢复，[P-02] 触发条件解除。
12. **[P-04] 定稿晋升 1750ms（E188）**：owner 签认 E1 复验门数据包（A 方案按 1750ms 晋升），
    §5 注册表 [P-04] 由 2000ms provisional@2026-08-12 转 1750ms 定稿；代码默认超时同步
    `LLM_CLASSIFY_TIMEOUT_MS`（`src/search/llm-registry.ts` light 档 2000→1750、
    `scripts/classify-smoke.ts` 默认显示 1750、`scripts/finalize-gates.ts` E1 建议值上限 2000→1750）；
    附录 A 登记 E188（bench:B-20260822-01）；晋升验证 1750ms 下 10 条冷调用 0/10 超时、
    准确率 8/10、max=1026ms（叠加 n=70：p95=1406ms / max=1542ms 缓冲充足），provisional 治理债务消除。
13. **[P-02] 定稿（E189）**：owner 签认 E2 复验门数据包——充值后健康窗口
    （2026-08-22T09:02Z 起）连续 60 条搜索指标：Bocha n=60 超时率 0.0%（p95=362ms /
    max=411ms）、AnySearch n=50 超时率 0.0%（p95=1683ms / max=2049ms）、双返回率 50/60=83.3%
    （≥70%），复验门 PASS + 对冲③ NOT triggered；[P-02] Stage 3 搜索执行预算 5s 转 定稿，
    附录 A 登记 E189（bench:B-20260822-02），无代码值变更。
14. **[P-03] 定稿（E190）**：与 [P-02] 共用 E2 复验门证据——AnySearch@5s 超时率全窗口 7.7%
    （≤30%）、充值后健康窗口 0.0%（n=50，p95=1683ms / max=2049ms）；[P-03] AnySearch 超时 5s
    转 定稿，约束 P-03<=P-02 保持，无代码值变更。
15. **[P-12] 定稿（E191）**：附录 C v0.2a 全量验收证据（`bench/v02a-report.md`：30/31 相关性
    ≥2、0 硬答、96.8% ≥80%，score=0 仅 E07）；[P-12] v0.2a 31 条通过率阈值 80% 转 定稿，
16. **Bocha 余额预警落地（E192）**：实现 §D.3「资源包健康检查」代码侧——
    `src/search/balance.ts`（GET `/v1/fund/remaining` 主备双 host、3s 超时静默失败、内存 + `data/bocha-balance.json`
    持久缓存 30 分钟、[P-75] 折算剩余次数）；Bocha 搜索 HTTP 4xx 自动探测余额透出 notice，
    `SearchStageResult`/`SearchLoopResult`/`AnswerResult` 逐层聚合，CLI stderr / gateway 启动日志 /
    `GET /api/bocha/balance` 三处可见；新增 `npm run balance:smoke` 随时查看余额/次数；
    [P-67] 落地为剩余次数 ≤10 告警线（无资源包总量接口），耗尽强告警提示购买（防 [P-76] 按量 10 倍成本）；
    UI 原型新增「资源包」设置面板（余额/剩余次数/刷新）与聊天区可关闭预警横幅（兑现 §D.3「弹窗提示购买」）。
    计划见 `docs/plans/2026-08-22-bocha-balance-warning.md`，证据见 `bench/B-20260822-04-bocha-balance.md`。
17. **§8.3 会话上下文压缩落地（E193）**：新增 `src/memory/session-context.ts`——按 conversationId
    持久化 `data/session-context/<id>.json`（读改写串行化、compact 防重入、每轮唯一 id 增量合并防并发丢更新）；
    逐字窗口 [P-29]=5 轮完整保留，窗口外轮次由轻模型压缩为「实体+决策+未决事项」摘要滚动合并；新增
    [P-109]=6000 token 硬约束双触发（窗口超预算最早轮次也移入压缩）；pipeline 在 `opts.conversationId` 显式传入时
    启用会话上下文——摘要 + 窗口轮次并入 memoryNotes/recentMemory，回答后 append 轮次并异步压缩；UI 主聊天
    发送稳定 conversationId；远期会话仍走 L1-L3 蒸馏，不动记忆分层。
    计划见 `docs/plans/2026-08-22-context-compaction.md`，证据见 `bench/B-20260822-05-context-compaction.md`。
18. **度量型问答并入 qa 提取词（E194）**：路由参数校准（阈值建议 0.45/0.75 与 P-80/P-81 一致、
    无规则候选）暴露规则侧缺口——`X 是多少/多少钱/什么价位/多大/几位` 不在 `QA_RE`，判定
    `unknown` 走 R012 confirm，「开发板多少钱」因含「开发」被 create 抢走 option_clarify；
    本轮 `intent-feature.ts` 拆分 GENERIC_QA_RE / METRIC_QA_RE 合成 QA_RE，analyze 守卫
    「通用疑问词优先 qa + 度量词仅在无业务评估词（值不值/成本/收益）时让给 qa」，业务评估与
    安全审查路由不回退；9 条目标 query 全部 `qa + direct + web_search`，样本库 37/37 度量
    记录直答，全量 742 条决策差分无新增回退。
    计划见 `docs/plans/2026-08-22-route-metric-qa.md`，证据见 `bench/B-20260822-06-route-metric-qa.md`。
19. **Tavily 触发冒烟 + 配额监控（E195）**：新增 `npm run tavily:smoke`（key 检查 + `shouldTriggerTavily`
    触发判定 + `runSearchStage` 真实链路 + [P-64] 配额报告）；`quota.ts` 新增只读 `readMonthlyQuota()`、
    `TAVILY_MONTHLY_LIMIT` 常量单源化（删 s3_search/search-loop 硬编码）；`tavily.ts` 把 HTTP 432
    （Tavily 计划用量超限）映射为 error + notice（复用 E192 告警透出）。**实测发现**：key 有效但远端
    返回 432 计划额度耗尽（探测响应体坐实），本地计数 634/1000 与远端矛盾——Tavily 本月条件并联
    实际不可用（静默熔断）；owner 已决策等下月重置，9 月重置后复核并评估 [P-64] 口径复算。
    计划见 `docs/plans/2026-08-22-tavily-smoke-quota.md`，证据见 `bench/B-20260822-07-tavily-smoke.md`。

## 今日验证

- 全量单测 540/541 通过 + 1 条 fitz 特性门控用例按环境跳过、集成 17/17 全绿、doc-lint 0 FAIL 0 WARN（附录 A 949/950）（E186/E187 收尾复核）。
- E188（[P-04] 晋升）：`npm run classify:smoke -- --rounds=1`（`LLM_CLASSIFY_TIMEOUT_MS=1750`）
  10 条基准 0/10 超时、准确率 8/10（80%，S02/L05 仍由规则③兜底）、min=514ms / median=771ms /
  max=1026ms；doc-lint 0 FAIL 0 WARN（附录 A 950/950 到上限）；build + 单测 + 集成全绿。
- E194（度量型问答）：`routeV2` 确定性对照（bench:B-20260822-06）9 条目标 query 全部
  `qa + direct + web_search`（含「开发板多少钱」create 误抢修复）；样本库 37/37 度量型记录
  直答、全量 742 条决策差分无新增回退；router-v2 新增 3 条用例（版本号直答/度量全集/业务
  评估豁免），agent 单测 119/119；build + doc-lint 0 FAIL 0 WARN（附录 950/950，压缩 E191 腾行）。
- E195（Tavily 冒烟+配额）：`npm run tavily:smoke` 真实链路 HTTP 432（计划用量超限）被显式识别；
  触发判定 6 例全对（english×3/news/low_confidence/严肃禁区熔断）；quota 6/6 + tavily 3/3（含 432
  notice）；build + test:all 全绿、doc-lint 0 FAIL 0 WARN（附录 947/950，压缩 E56 腾行）。
  遗留：owner 已决策等下月重置；9 月重置后跑 tavily:smoke 复核。
- E189（[P-02] 定稿）：`npm run search:smoke` 追加 2 轮（各 10/10 双引擎 ok）；充值后窗口
  （2026-08-22T09:02Z 起）`recheck:gates`/`finalize:gates`：Bocha/AnySearch timeout5sRate 均
  0.0%、双返回率 83.3%，复验门 PASS + 对冲③ NOT triggered；doc-lint 0 FAIL 0 WARN
  （附录 A 948/950，压缩 E71 腾行）；build + 单测 + 集成全绿。
- E192（Bocha 余额预警）：`npm run balance:smoke` 真跑 303ms 返回 ¥2.80 / 777 次（与充值实况一致）；
  健康余额无告警不误报；新增 mock fetch 单测 8 + bocha provider 4 + s3 notices 聚合 1 + gateway 端点 1；
  `search:smoke` 10/10 双引擎无回归；CLI 端到端答案正常（健康时不带 notice）；UI 原型生产构建通过、
  gateway 托管产物含「资源包」面板与横幅（视觉截图因浏览器策略未做，以构建 + 产物字符串 + 端点单测为准）。
- E190/E191（[P-03]/[P-12] 定稿）：E2 健康窗口证据复用（AnySearch 超时率 0%）、附录 C
  v02a 报告核数（30/31 ≥2、0 硬答）；doc-lint 0 FAIL 0 WARN（附录 A 950/950，压缩 E72 腾行）；
  build + 单测 + 集成全绿。
- E193（§8.3 上下文压缩）：`session-context` 单测 14/14（估算/持久化往返/损坏文件/窗口/双触发/压缩合并/防重入/全链路/注入/配对）+ pipeline 2 条
  （摘要注入路由上下文并 append、无 conversationId 不启用）；真实轻模型压缩冒烟（bench:B-20260822-05）2 轮合成对话 →
  输出「实体/决策/未决」摘要；build + test:all 全绿、doc-lint 0 FAIL 0 WARN（附录 A 950/950 到上限）。
- office-daily 新增 2 条真跑：3 行 L 形 → xlsx `A1:A3`+`B1:C1`“已还原 2 处”；1.5° 旋转
  组合表头 → deskew 后 `A1:D1`+`A2:B2`+`C2:D2`“已还原 3 处”。
- gateway 新增 2 条单测：邮件凭据读写且不暴露密码（GET 无 `pass` 字段）、日历导入 ICS
  后导出包含 `SUMMARY:网关导入测试`。
- UI 邮件发送入口（E180）：MailSettings 新增发信区块，经 `/api/ask` 发送并回显答案；
  查询格式与既有 E170 单测一致；UI 原型生产构建通过。
- office-daily 新增 1 条真跑（合成 4 变体）：彩色底/折痕/透字 160 → `A1:A3`+`B1:C1`
  无 warning“已还原 2 处”；透字 90 → 只剩 `B1:C1` + 1 条 `merged_conflict` warning、
  答案含“无法自动还原”。既有 10 张回归图 merges 与 E177 一致，零回归。
- E182：`extractPageScript` 新增 2 条单测——citations 透传断言（mock 页）、fake-DOM
  去噪断言（nav/footer/广告剔除、块级换行保留、外部链接去重、同页锚点与 pdf 分流）。
- E183：新增 1 条真跑 3 变体（跨行+跨列混合角落/整行标题+垂直标签/3 层表头），
  xlsx 读回 `model.merges` + 锚点格 + 答案计数断言；既有 10 张回归图与 E181 一致。
- E185：新增 1 条真跑（合成 2 页表 PDF，PIL save_all），xlsx 读回 `model.merges`
  + 锚点格 + 第 2 页正文落位 + 答案计数断言；单图回归与 E184/E181 一致。
- E184：新增 1 条真跑 3 变体（左上角标签/斜跨阶梯/嵌套 4 层），xlsx 读回 `model.merges`
  + 锚点格 + 答案计数断言；既有 10 张回归图 + E181/E183 用例 merges 与 E183 一致，零回归。
- E186：新增 1 条真跑 2 变体（第 2 页表头噪声 `2024`→`2O24` + 旋转 1.2° + 透字；
  无表头续接页），xlsx 读回 `model.merges` + 零 warning + 诚实告警断言；单图回归
  t1/t3（E184）与 420×430 小图（E181）merges 完全一致，零回归。

- E187：`recheck:gates`/`finalize:gates` 新口径输出验证（failRate/timeout5sRate/双返回率）；
  E1 PASS、E2 复验门未触发但对冲③触发（双返回率 31.7%<70%）；build + 单测 + 集成 17/17 全绿；
  doc-lint 0 FAIL 0 WARN（附录 A 949/950）；探活：充值前 Bocha 10/10 失败/双返回率 0/10，充值后 10/10 ok/双返回率 10/10。

- 已知边界：部分噪声/模糊图 OCR 文本有误读（如“上海”→“奥”），但合并判断不受影响；
  透字墨色过重（灰度 <90）超出局部对比度阈值时靠相位守卫诚实提示，不产出伪合并。

## 今日收尾状态

已提交：E177-E198（HEAD=`3d47c16`）；本批次待提交：E199 页脚页码过滤 + E200 编号模式纠正/三通道融合 + E201 词典纠正（方向 2 全部完成，见 `docs/plans/2026-08-22-ocr-accuracy.md` 结果与 bench:B-20260822-09）；并行改动（SEV-1.1~1.4：`sandbox.ts`/`memorycore-store.ts`/`terminal.ts` 及测试）不在本批次。
- E200/E201 要点：三通道文本融合（结构用透字抑制通道、非代码列文本用灰度通道按位置替换/补框、代码列用 2x 预处理通道）+ `correct_code_cell` 编号纠正 + `correct_dict_cell` 词典纠正；OCRtest.png 编号 0%→100%、数量 100%、单位 96%、名称/型号词典后 100%/96%；E181 四变体零回归；`--selftest` 进单测。
- 提交前请勿包含根目录 `.codex-*.cjs`（已 gitignore）、`data/` 临时文件与合成样本（已清理）。

## 明天继续（按优先级）
1. provisional 晋升批已执行（E197，owner 签认 E196 数据包）：[P-16]/[P-17]/[P-80]/[P-81]/[P-63] 转 定稿；
   [P-01] tombstone 并入 [P-17]；[P-06]=12s、[P-15]=14s 转 定稿（实测超预算比例 Stage5>12s 13.7%、
   总>14s 19.7%，代码无强制降级，走现有 Stage 超时兜底）；约束卡线连带 [P-13]=13s（14+13=27≤P-14）
   保持 provisional 待深度报告实现后复测；[P-82]-[P-94]/[P-105]-[P-107] 维持 provisional，等 4 周标红再处理。
   **P-06/P-15 后续观察基线（E197 决策后）**：trajectory 8-14 起 low_confidence 二次取证触发率 31.6%（176/557），
   是超预算主因——若该频率继续增长，按 owner 决策评估「二次取证剥离为可选路径」时以此为基准。
2. E186 遗留已收口：页脚/页码落格已修复（E199，真实样本 OCRtest.png 复现+验证，54×7 结构不变）；剩余——极端全噪声表头仍走诚实告警；纯数字页码/公司名等无模式页脚暂不处理，等真实样本反馈再扩展。
3. 附录 A 行数预算 934/950（本批次压缩 A.0 迁移段腾 16 行 + 登记 E200/E201），后续新增条目继续按 retention 压缩旧段腾行。
4. 方向 1（PaddleOCR）待 owner 决策后推进：`data/exp-paddle.py` 已备好，沙箱 ACL 拒绝读 `~/.paddlex`、提权被审核误拒（模型名匹配规则），需修审核规则或 owner 本机跑脚本；方向 3（超分）等方向 1+2 结果再评估。
5. 斜杠命令层（备忘，勿忘）：`/compact`（手动触发当前会话压缩）+ `/context`（查看会话状态：轮次/逐字窗口/摘要/token 粗估）
   ——E193 上下文压缩的手动入口，参考 AI-Butler 增补方案 §12.7（MiMo-Code `/compact`，SessionCompaction + COMPACTABLE_TOOL_NAMES）
   与 `src/interaction/memory-hub.ts`（规则版滚动摘要 + 实体槽位/指代消解，零 LLM 成本兜底）；owner 已确认按计划在合适时机实现，不由本批次推进。
6. Tavily（备忘，勿忘）：**已接入并启用**，不是后续里程碑——`src/search/providers/tavily.ts`（v0.2a WP0，
   §6.2.1）+ `tavily-trigger.ts` 条件并联（news/英文技术/低置信提示，医疗政务禁区熔断）；pipeline → s3_search
   `useTavily` 并行执行，另承担 E72 官方域兜底（`search-loop.ts` include_domains）；`main.ts`/`gateway/server.ts`
   均为 `tavily.enabled=true`，`.env` 的 `TAVILY_API_KEY` 已配置（勿忘，成本预期管理用）。月度配额
   [P-64]=1000 落盘 `data/tavily-monthly.json`（配额耗尽=当日熔断不报错）。**E195 已落地冒烟+监控**：
   `npm run tavily:smoke` + `readMonthlyQuota` + 432 notice；**owner 已决策：等下月重置**（已核实 Tavily 用量耗尽）；
   9 月重置后跑 `npm run tavily:smoke` 复核，并评估 [P-64] 口径复算（本地计数 vs 远端 credits）。


## 常用命令

```bash
npm run mail:config -- --host <smtp主机> --port <端口> --secure <0|1> --user <账号> --pass <授权码> --from <发件人>
npm run dev -- "发送邮件给 a@b.com，主题：测试，正文：你好"
npm run dev -- "导入 M:\\path\\events.ics"
python scripts/office_image_ocr.py --table <图片> <out.csv>
npm run build && npm run test:all
npm exec tsx scripts/doc-lint.ts
```
