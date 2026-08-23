# 进度交接 2026-08-23（v0.2b 续作）

> 当前分支：`v0.2b`｜E199-E218 + SEV-1.1~1.4 安全批已提交（E199-E201 `ba41dbb`、E202 `8857b47`、
> E203 `7cb6f3c`、SEV `24399d6`、E204 `4b7e34e`、E205 `a05e9fc`、E206 `fe5f067`、架构审计安全/数据/正确性批
> `60b419d`、决策批 E207 `615bb62`、中期批 1-7 E208-E214 `109021b`、P17 E215 `0cbde9b`、
> P1/P2/P10 E216 `ce1abf8`、B2/B3 E217 `f575040`、S1-S3 E218 `3fb4cc6`）。
> 上一份交接见 `docs/2026-08-22-progress-handoff.md`。

## 今日已收口

1. **表格 OCR 页脚/页码过滤（E199）**：`scripts/office_image_ocr.py` 新增 `_filter_page_footer`
   （图片底部 10% + 强模式「第X页，共Y页」双条件才剔除，无模式页脚如实保留），真实样本
   `OCRtest.png` 复现并验证（csv 末行页码排除、54×7 结构不变）；E185/E186 跨页回归通过。
2. **编号列识别率提升（E200）**：三通道文本融合（结构用透字抑制通道、非代码列文本用灰度
   通道按位置替换/补框、代码列用 2x 预处理通道）+ 编号模式纠正 `correct_code_cell`
   （数字槽混淆 `{S/B→8, O→0, l→1}`）；`--selftest` 13 用例。编号 0%→**100%**。
3. **词典纠正（E201）**：`correct_dict_cell` 精确命中直接替换、长文本相似度 0.78 模糊替换、
   短文本不模糊替换防误伤；默认 `data/ocr-dict.json`（git 忽略）。名称 49/49、型号 43/45（96%）。
4. **五项增量方向决策收口（E202）**：方向 2 已落地（E200/E201）；方向 4（源头提分辨率：
   截图转 PDF / 高 DPI 导出）登记需求文档 §12.6 长期建议；方向 5 排除项（WinRT OCR/列裁剪/
   二值化/直方图均衡）归档；方向 1（PP-OCRv6）与方向 3（超分）状态与阻塞登记
   `docs/plans/2026-08-22-ocr-accuracy.md` 决策表。doc-lint 0 FAIL 0 WARN（附录 935/950）。
5. **方向 1 实测归档 + E201 词典扩展（E203）**：`data/exp-paddle.py` 修复三处阻塞
   （xlrd 残缺 → `data/exp-paddle-gt.json` 真值兜底；oneDNN 指令不兼容 →
   `PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT=False` 同 E97；PP-OCRv6 rec 框 `[l,t,r,b]` → 通用解析）
   后由 owner 本机真跑：目标残差 3 处（糖胶枪/FR405 乱码/FR407 单位套）**全部未修复**，且
   新引入 `LBD补光灯`/`宣鼎SSD`/`GO70VW01`/`LVD8线`/`外亮模具` 5 处新错、单图约 240s
   （比 RapidOCR 慢约 100 倍）——**不达标归档**，默认引擎维持 RapidOCR，`PDF_OCR_ENGINE=paddle`
   保留为可选慢速通道。E201 词典扩展处理残差：型号补 `白色(糖胶枪)`、FR405 两通道乱码读数
   映射规范值、尾片段 `%2.01` 清洗，备件名称 `LBD补光灯→LED补光灯`/`外亮模具→外壳模具`/
   `LVD8线→LVDS线`。bench:B-20260823-01 真跑：型号 43/45→**44/45**（FR405 修复），其余列持平。
6. **斜杠命令层（E204）**：新增 `src/slash/slash-commands.ts`——`/context` 输出会话状态
   （轮次/逐字窗口 [P-29]/待压缩/摘要/token 粗估 [P-109]），`/compact` 手动压缩窗口外轮次
   （复用 E193 `compact`，输出前后对比）；输出与 `answer()` 契约同形。gateway `/api/ask`
   命中斜杠不进入问答管线；CLI `main.ts` 普通问答补 `conversationId='cli'`，CLI 会话进入
   E193 上下文管理。slash 单测 9 条 + gateway 集成 2 条；CLI 真实冒烟通过。
7. **表格 OCR 网格补位（E205）**：`scripts/office_image_ocr.py` 新增 `_grid_fill_empty_cells`——
   按网格线裁剪「编号锚定数据行」内空的非代码列单元重 OCR（原尺寸优先、2x 兜底），
   score≥0.95 且 ≤4 字符才补入；仅补「短值列」（数量/单位类）、排除合并覆盖单元与代码列；
   新增 `grid_filled` warning。真值对比脚本 `scripts/table_ocr_bench.py`（编号对齐 + 续行合并）。
   bench:B-20260823-02：FR407 单位「套」补入（score 0.979）、FR407-01~-20 未误补；
   登加型确认已被 E201 词典解决；全表 +15s。
8. **v0.2b L2 记忆蒸馏验收收口（E206）**：[P-08] 由 草稿/TODO 转 conditional 定稿，验收口径
   对齐 §4.4 v0.2b 切片（v0.1 数据零丢失自动迁移 + 回归测试）：蒸馏链路以 E6
   bench:B-20260813-01 为证据（137→191，无提取 7 ≈5.1%，失败不阻塞主对话）；
   MemoryCoreStore 同接口同 schema 切换回归通过（记忆相关单测 26/26）；
   `migrate:memorycore` 零丢失校验就绪（dry-run 读源 903 条 L0/2 会话）。
   L2 embedding/向量检索「后置」诚实登记，不在验收内。bench:B-20260823-03。
9. **架构审计安全批（H1+H2+H3+H4+H10）**：处置 `docs/2026-08-23-architecture-code-audit.md`
   第六节「立即（安全）」：project-packager 弃 PowerShell 改 jszip（H1 注入）+ 过沙箱白名单
   且排除 `.env*`/`data/`（H2 凭据聚合）；gateway 全部写端点挂 `requireGatewayAuth`、
   终端白名单改 default-deny、补 §10.2 硬拒绝表与解释器通道显式放行（H3）；
   SMTP 仅加密通道发 AUTH（H4）；yt-dlp 加 `--` 终止符 + URL 校验（H10）。
   计划与结果见 `docs/plans/2026-08-23-security-audit-batch.md`，审计文档已登记
   documentation-map。
10. **会话上下文 H5（立即/数据）**：处置「同进程双 SessionContextStore 实例 + 非原子写 =
    会话历史丢失」——`persist` 改 temp+rename 原子写；`runExclusive` 追加跨进程文件锁
    （`<会话>.json.lock` 独占创建 + 陈旧锁夺锁 + 超时）；`server.ts` 唯一实例同时传给
    app 与 pipeline deps、`main.ts` pipeline deps 传入 CLI 实例。跨实例并发 append 回归
    测试（无锁前会丢更新）。计划与结果见
    `docs/plans/2026-08-23-session-context-h5.md`。

11. **架构审计正确性批（H9/B1/B4/H8）**：处置审计文档「短期（正确性）」批次——
    search-loop 无型号不再发 "null 立创商城 …" 补搜、Tavily 补搜改并联把尾部延迟
    压到单次超时（H9）；router-v2 移除 `|| deduped.length > 1` 恒真分支让 P-82 分差
    门槛恢复生效、宽分差直接 confirm（B1）；pipeline 执行器失败如实归因而非
    "尚未接入"误报（B4）；skills-config 按文件 mtime 缓存禁用技能 Set、每次问答
    ~24 次读盘降为 stat（H8）。单测 621/622（1 skip）+ 集成 17/17，doc-lint
    0 FAIL 0 WARN。计划与结果见 `docs/plans/2026-08-23-audit-correctness-batch.md`。

12. **架构审计短期决策批（H6/D1-D5）**：处置审计文档「短期（决策）」批次——
    H6 LLM 特征提取生产入口未接线，正式降级声明留待 v1.0（与 E22/E23 状态一致）；
    D1 删 P-83 死参数 `routeLlmTimeoutMs` + doc-lint 新增 C8「PARAM 代码引用」执法
    （登记即生效，key 零引用 FAIL）；D2 `COMPACT_TIMEOUT_MS`（8s）接线 /compact 与
    pipeline 压缩的轻模型客户端（原走轻档 1750ms）；D3 删 fast-description 死链
    （maybeFastDescribe/withTimeout/SkillDeps），P-87/P-88 tombstone；D4
    `distill-worker.ts` 声明为 L1 蒸馏正式入口；D5 MemoryCoreStore 为可选 sidecar
    切换声明。需求文档 P-83/P-87/P-88 tombstone + §0.6 补检查 8 + 附录 A E207
    （bench:na(deprec)）。全量单测 621/622（1 skip）+ 集成 15/15 + doc-lint
    0 FAIL 0 WARN。计划与结果见 `docs/plans/2026-08-23-audit-decision-batch.md`。

13. **架构审计中期批·第一批（H7+P4）**：中期批开工——H7 video-learner
    固定共享 `tmp` 工作目录（并发执行互删文件，审计批次表漏排）改
    `mkdtempSync` 独立目录；P4 s3_search 超时 race 的 timer 泄漏清理 + stage 级
    AbortController 超时即取消进行中的 provider fetch（`SearchOptions` 新增
    `signal`，bocha/anysearch/tavily 合并外部取消）。新增单测 3 条；全量单测
    624/625（1 skip）+ 集成 15/15；doc-lint 0 FAIL 0 WARN；附录 A E208
    （bench:na(new-param)）。计划见 `docs/plans/2026-08-23-audit-mid-batch-1.md`。
14. **架构审计中期批·第二批（P3+P5）**：P5 `src/search/quota.ts` 读改写改进程内
    互斥锁（`withFileLock` 按文件路径串行化，防 gateway 并发丢计数）+ temp/rename
    原子落盘（防半截 JSON）+ 同进程 mtime 状态缓存（跨进程写靠 mtime 感知重读）；
    P3 `defaultRegistry()` 改模块级惰性单例、`provider-order` read 按 mtime 缓存、
    write 后显式失效（每次问答省多次 new Registry + 读盘）。新增单测 6 条
    （quota 并发 2、provider-order 缓存 3、defaultRegistry 单例 1）；全量单测
    630/631（1 skip）+ 集成 15/15；doc-lint 0 FAIL 0 WARN；附录 A E209
    （bench:na(new-param)）。计划见 `docs/plans/2026-08-23-audit-mid-batch-2.md`。
15. **架构审计中期批·第三批（P6+P8）**：P6 authority 的 `SOFTWARE_OFFICIAL_RULES`
    name 正则模块级预编译（每条规则一条 `\b(name1|name2)\b`），新增
    `buildOfficialQueryContext`（q 小写/techDomains/spaceStatus/part/vendor 一次算好）
    + `isOfficialForQueryCtx`/`isHighTrustDatasheetUrlCtx`（原公开函数保持签名转调）；
    fusion 的 query tokenize/去重每条结果只算一次、per-item 预计算
    `ItemText{text,lower,titleLower}` 供 5 个评分函数复用、`ANSWER_SIGNALS` 模块级
    预编译小写（热路径每条结果省 4-5 次字符串拼接与多次 RegExp 构造）；
    P8 CLI `/context`、`/compact` 跳过 Bocha 余额探测（省一个 RTT+超时）。
    新增单测 4 条（authority 3、fusion 1）；全量单测 634/635（1 skip）+ 集成 15/15；
    CLI /context 冒烟 3.6s 无余额探测；doc-lint 0 FAIL 0 WARN；附录 A E210
    （bench:na(new-param)）。计划见 `docs/plans/2026-08-23-audit-mid-batch-3.md`。

16. **架构审计中期批·第四批（P7+P11）**：P7 搜索缓存新增 [P-110] 容量上限
    （`cacheMaxEntries=2000`，§5 注册 + params.ts）并按 Map 插入序模拟 LRU——get 命中
    刷新序、set 超容量先清过期再淘汰最冷条目，长驻 gateway 不再无界驻留 7/30 天 TTL
    死条目；P11 除 source-stats 外 8 个 SQLite 库统一补 `PRAGMA journal_mode=WAL /
    busy_timeout=5000 / synchronous=NORMAL`，热路径语句（put/addSessionSummary/
    recordUse/record/提醒顺延）构造器预编译复用，`archiveExpired` 与 `dueReminders`
    逐行 UPDATE 包事务（消除每行一次 fsync）。新增单测 5 条（cache LRU 3、
    user-context WAL+批量归档 2）；全量单测 639/640（1 skip）+ 集成 15/15；
    doc-lint 0 FAIL 0 WARN（PARAM 100、C8 24）；附录 A E211（bench:na(new-param)）。
    计划见 `docs/plans/2026-08-23-audit-mid-batch-4.md`。

17. **架构审计中期批·第五批（P9+P15）**：P9 document-parser 与 office-daily 两处
    Python 子进程加 [P-111] 20s / [P-112] 120s 超时（kill 防永久挂起）、document-parser
    stdin EPIPE 吞掉、office-daily stdout 累加 64MB 上限（超限杀进程转下一候选），
    error/close/timeout 统一 settled 防双结算；P15 新增 `src/log/jsonl.ts`
    （appendJsonl 句柄复用免每事件 open-write-close + [P-113] 50MB 轮转保留 .1 归档 +
    readJsonlCached mtime+size+解析函数三重键缓存读），trajectory/usage/metrics 三处
    接入，main.ts 退出关句柄。新增单测 2 条（jsonl 追加读回+缓存失效、小上限轮转）；
    全量单测 641/642（1 skip）+ 集成 15/15；doc-lint 0 FAIL 0 WARN（附录 942/950）；
    附录 A E212（bench:na(new-param)）。计划见
    `docs/plans/2026-08-23-audit-mid-batch-5.md`。

18. **架构审计中期批·第六批（P12+P16）**：P12 experience 的 `search()` 候选下推 SQL
    （needs_review / 置信度 / [P-31] 冷存 cutoff / 关键词 LIKE 命中，token 转义
    `%`/`_`/`\` 按字面匹配，无有效 token 返回空）+ `stats()` 改单趟聚合 COUNT，不再
    每请求全表载入；`list()` 保持管理端全量枚举契约。P16 新增 `src/gateway/rate-limit.ts`
    （RateLimiter 按 IP 令牌桶 + 过期桶定期清扫 + 超 [P-114] 上限按插入序淘汰最旧 +
    ConcurrencyGate [P-115] 并发闸门），`/api/ask` 挂并发中间件，并发满立即 429，
    不再无上限打满 LLM 配额。新增单测 7 条（rate-limit 4 + experience 3）；
    全量单测 648/649（1 skip）+ 集成 15/15；doc-lint 0 FAIL 0 WARN（PARAM 105、
    C8 29 key）；附录 A E213（bench:na(new-param)）。计划见
    `docs/plans/2026-08-23-audit-mid-batch-6.md`。

19. **架构审计中期批·第七批（P13+P14）**：P13 route-case-store 的 `record()` 改走共享
    `src/log/jsonl.ts` appendJsonl（[P-113] 轮转 `.1` 归档，O(1)/事件）+ 新增
    `batchMarkFeedback()` 单趟读+单趟写（`/api/routing/batch-mark` 不再 O(m×n) 循环全文
    重写），recordFeedback/attachModelRoute 收敛到 `updateRecord` 唯一出口；P14 会话
    compact 摘要合并截断到注入上限并保留最新段（存储有界，不再丢 601 字符后的最新信息），
    buildSessionNotes 只注入 [P-29] 逐字窗口轮次 + buildRecentMemory 只保留最近配对
    （压缩失败被吞时 prompt 注入有硬顶）。新增单测 5 条（route-case 2 + session 3）；
    全量单测 653/654（1 skip）+ 集成 15/15；doc-lint 0 FAIL 0 WARN；附录 A E214
    （bench:na）。计划见 `docs/plans/2026-08-23-audit-mid-batch-7.md`。

20. **架构审计中期批·第八批（P17）**：P17 fallback 链共享 [P-116] 总预算 12s
    （对齐 [P-06] Stage 5 预算）——`FallbackLLMClient.complete` 每次调用独立起算预算，
    共享 AbortController 透传 signal 到各 provider（`CompleteOptions.signal` 与内部超时合并，
    同 P4 取消模式），预算到点 `Promise.race` 强制终止并停止后续兜底，最坏不再 3 家 × 30s
    = 90s；单 provider 链不受影响仍走自身超时。新增单测 3 条（预算超时终止且不再试第二家、
    预算内失败仍正常兜底、预中止 signal 立即拒绝不发请求）；全量单测 656/657（1 skip）+
    集成 15/15；doc-lint 0 FAIL 0 WARN（PARAM 106、C8 30、附录 944/950）；附录 A E215
    （bench:na(new-param)）。计划见 `docs/plans/2026-08-23-audit-mid-batch-8.md`。

21. **架构审计中期批·第九批（P1+P2+P10）**：P1 二次取证抽成
    `src/search/second-pass-fetch.ts`——targets 并发抓取 + 共享 [P-117] 总预算 8s（预算耗尽
    整体放弃，不再逐目标串行 2 × 8s = 16s），PDF 分支改异步有界读取（[P-118] 20MB 上限，
    不再 readFileSync 同步读整份 datasheet 阻塞事件循环）；P2 取证 PDF 落盘用后即删
    （finally 清理，data/datasheets 不再无界增长）；P10 multimodal 图片归一化改异步 fs，
    多个 python 候选共享总预算（每候选只拿剩余时间，单张图最坏不再 2 × 15s = 30s），
    候选支持完整 argv 便于测试。新增单测 8 条（second-pass-fetch 6 + multimodal 2）；
    全量单测 664/665（1 skip）+ 集成 15/15；doc-lint 0 FAIL 0 WARN（PARAM 108、C8 32、
    附录 946/950）；附录 A E216（bench:na(new-param)）。计划见
    `docs/plans/2026-08-23-audit-mid-batch-9.md`。

22. **架构审计中期批·第十批（B2+B3）**：B2 confidence-calibration 分位改 nearest-rank
    （`Math.ceil(p*n)-1`，小样本 n=4 p=0.75 不再取最大值）；去掉 `Math.max` 棘轮——
    建议阈值按样本分位双向收敛（clamp 限定安全范围）；新增 [P-119] 30 天时间窗，只取窗口内
    样本（早期误标不再把 Low 永久钉死在 clamp 上限，无时间戳旧样本视为窗口内兼容导入）；
    B3 llm-rule-proposer 的 LLM confidenceBoost 夹到 [0, [P-120] 0.25]，与确定性路径
    取值域对称，不再允许 0.9/负值支配排序。新增单测 7 条（calibration 5 + proposer 2）；
    既有 apply-calibration/route-case-store 校准用例改用近期时间戳回归；全量单测
    671/672（1 skip）+ 集成 15/15；doc-lint 0 FAIL 0 WARN（PARAM 110、C8 34、
    附录 947/950）；附录 A E217（bench:na(new-param)）。计划见
    `docs/plans/2026-08-23-audit-mid-batch-10.md`。

23. **架构审计安全批收尾（S1+S2+S3）**：S1 新增 `src/security/url-safety.ts`——
    fetchPage/downloadFile 只允许 http/https，拒绝回环（127.0.0.0/8、::1、localhost、
    IPv4-mapped 含 Node 十六进制归一化）/未指定/链路本地/ULA 地址（RFC1918 局域网保留放行，
    嵌入式内网 datasheet 场景），防网页提示注入驱动带登录态浏览器 SSRF 访问 sidecar
    （127.0.0.1:8420）；S2 CDP 状态新增 [P-121] 10 分钟过期（超时或旧版无 expiresAt 状态
    一律清理，不再无限期自动重连），连接与 launch 脚本输出风险提示 + `browser:cdp-off`；
    S3 MemoryCore 客户端拒绝弱默认 key `local-dev-key` 启动（构造即校验），sidecar 配置
    `configs/tdai-gateway.local.yaml` 改 `${TDAI_GATEWAY_API_KEY}` 环境注入，`.env.example`
    补充说明。新增单测 9 条（url-safety 4 + memorycore 1 + session 4）；全量单测 680/681
    （1 skip）+ 集成 15/15；doc-lint 0 FAIL 0 WARN（PARAM 111、C8 35、附录 948/950）；
    附录 A E218（bench:na(new-param)）。计划见
    `docs/plans/2026-08-23-audit-security-finish.md`。

## 待提交（本批次）

- 架构审计全部批次已提交：安全/数据/正确性批 `60b419d`、决策批 E207 `615bb62`、
  中期批 1-7 E208-E214 `109021b`、P17 E215 `0cbde9b`、P1/P2/P10 E216 `ce1abf8`、
  B2/B3 E217 `f575040`、S1-S3 E218 `3fb4cc6`；待提交清单已清空。
- `bench/search-metrics.jsonl` 与根目录临时文件/`docs/2026-08-23-architecture-code-audit.md`
  不在任何批次，未混入提交（审计文档保留为只读第三方输入）。

## 明日继续（按优先级）

1. **OCR 残差已收口**：登加型（E201 词典）、FR407 单位「套」（E205 网格补位）均已解决。
   已知限制（诚实登记）：长文本列整格漏检仍无法补；FR133 合并行（`叠加型 分开型`/`1 1`/`条 条`）
   与编号半角括号为结构/字形口径差异。方向 3（超分）维持暂缓——「换模型即提升」假设已被方向 1
   实测证伪，残差集中在整格漏检与结构口径，词典/网格优先。
2. **Tavily（备忘，勿忘）**：已接入并启用（`src/search/providers/tavily.ts` + `tavily-trigger.ts`
   条件并联，`.env` 的 `TAVILY_API_KEY` 已配置）。月度配额 [P-64]=1000 落盘
   `data/tavily-monthly.json`；owner 已决策等下月重置，9 月重置后跑 `npm run tavily:smoke` 复核，
   并评估 [P-64] 口径复算（本地计数 vs 远端 credits）。
3. **附录 A 行数预算**：新增 E205-E212 后附录 942/950，继续按 retention 压缩旧段腾行；
   v0.2b 里程碑验收已随 E206 正式收口，下一里程碑动作为 v1.0 切片（深度报告等）。
4. **架构审计后续批**：安全批 H1-H4/H10、数据 H5、短期正确性 H9/B1/B4/H8、
   短期决策 H6/D1-D5、中期第一批 H7+P4、中期第二批 P3+P5、中期第三批 P6+P8、
   中期第四批 P7+P11、中期第五批 P9+P15、中期第六批 P12+P16、中期第七批 P13+P14 均已
   收口 → 架构审计全部批次完成（安全 H1-H4/H10 + 数据 H5 + 正确性 H9/B1/B4/H8 + 决策
   H6/D1-D5 + 中期 P1-P17 + 校准 B2/B3 + 安全 S1-S3）；审计文档归档为只读输入。后续
   回到 OCR 备忘 / Tavily 月度复核 / 附录行数 retention 等常规项。
   `docs/plans/YYYY-MM-DD-<主题>.md` 三段式。

## 常用命令

```bash
npm run dev -- "/context"            # 斜杠命令：查看会话上下文状态
npm run dev -- "/compact"            # 斜杠命令：手动压缩窗口外轮次
python scripts/office_image_ocr.py --selftest
python scripts/office_image_ocr.py --table <图片> <out.csv>
python scripts/table_ocr_bench.py <图片> data/exp-paddle-gt.json --out <csv>  # OCR 真值对比
python M:\202608111\data\exp-paddle.py        # 方向 1 实测（需读 ~/.paddlex）
npm run build && npm run test:all
npm exec tsx scripts/doc-lint.ts
```
