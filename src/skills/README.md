# 预置 Skill 清单（v0.1）

v0.1 冷启动采用 **2 项核心 + 4 项占位** 策略，占位项先建目录与接口，防止遗忘。

## 核心项（v0.1 必须实现）

| 目录 | Skill | 作用 | 对应规格 |
|------|-------|------|---------|
| `chip-analysis/` | 芯片/器件分析 | STM32、MOSFET、运放等器件速答 | §7 Datasheet 解析子系统 |
| `jargon-map/` | 黑话映射 | Protel→Altium Designer、"大殖子"等 | §3.2 扩展原则 + §8.2 程序性记忆 |

## 占位项（v0.2a 及以后启用）

| 目录 | Skill | 计划启用版本 | 占位理由 |
|------|-------|-------------|---------|
| `datasheet-speed/` | Datasheet 速读 | v0.2a | 依赖 Datasheet PDF 解析管道 |
| `circuit-topology/` | 常见电路拓扑 | v0.2b | 需要 ExperienceManager 积累 |
| `industry-kits/` | 行业知识包 | v0.2b | 需要 L1/L2 蒸馏后装备 |

> 占位目录保留最小入口文件（`index.ts` + `README.md`），确保构建不报错且版本升级时不会遗漏。

## 原生 Skill（Week 3）

| 目录 | Skill | 作用 | 依赖 |
|------|-------|------|------|
| `github-reader/` | GitHub 项目解读 | X.6 契约结构化解读：GitHub API 元数据 + raw README/manifest + Release/提交/贡献者 → health_score(0-100+health_basis) + risks + evidence[] → LLM 按《专业审阅协议 §一》合成（无 LLM 时返回结构化契约 + 诚实提示）；降级链 API → raw → releases.atom/主页 → 显式「未获取（原因）」 | 可选文本 LLM（fetch 直连，无新依赖） |
| `color-recognition/` | 颜色识别 | L1 语义色名 + L2 主色调 HEX | VLM（DI 注入） |
| `document-qa/` | 文档解析 | 结构化摘要 / 结构提取 / 全文问答 | parseDocument + 可选文本 LLM |
| `image-analysis/` | 通用图片描述 | 按需 VLM 描述图片内容/文字 | VLM（DI 注入） |
| `knowledge-qa/` | 文化梗/知识问答 | 简洁作答，已知梗做最小兜底 | 可选文本 LLM |
| `content-writer/` | 文档/PRD 生成 | 按 query 生成结构化 Markdown 文档 | 文本 LLM |
| `calendar-skill/` | 本地日历 | 创建/查询日程 + .ics 导入/导出（SQLite，创建自动登记提醒，支持每天/每周重复；`openCalendarDb`/`buildCalendarIcs`/`importIcsToDb` 供 gateway `/api/calendar/*` 复用） | 无外部依赖 |
| `quote-compare/` | 报价对比 | 本地供应商报价库查询/对比（SQLite） | 无外部依赖 |
| `im-dispatch/` | 消息待发队列 | 写入本地 outbox（SQLite） | 真实 IM 待接 |
| `engineer/` | 代码实现 | 按需求生成代码/实现方案 | 文本 LLM |
| `project-writer/` | 工程落地 | 单文件按路径+内容写入并备份；结构化多文件清单先整批预检、项目快照并生成无正文确认卡，首次确认后由进程内事务仓库安全提交/取消/转冲突（E398/E399） | 无外部依赖 |
| `schematic-bom/` | PDF 原理图 BOM | PyMuPDF 坐标最近邻绑定位号/值/封装，三层过滤噪声并合并 BOM Change 备注后聚合生成 CSV BOM；坐标失败回退文本/OCR | PyMuPDF + parseDocument + 可选 LLM |
| `office-daily/` | 办公日常 | 考勤表模板 / CSV+xlsx+xlsm+xls+xlsb 占比 / 回复邮件/会议邀请草稿 + SMTP 发送 / 图片压缩+格式转换（含 AVIF/TIFF，HEIC 尽力解码） / 图片 OCR 文字提取（含多图批量）/ 图片表格识别→xlsx（TSR 保留 bbox/span，网格线检测重建行列结构、合并单元格自动还原（含整行标题/两级分组/L 形与跨行+跨列角落、3 行+ 垂直组标签、整行标题下垂直标签、3 层表头、左上角垂直标签与斜跨/嵌套多层表头等组合复杂表头，缺值数据行防误并，扫描件自动纠偏 deskew/cv2、透字/折痕抑制；多页 PDF 跨页拼接：重复表头自动去重、分页切片对齐，复用逐页 TSR bbox/span 不重跑整图识别），无法还原的疑似区域如实提示）/ 文档排版（docx/md/txt/pdf/doc）/ Word↔PDF / PDF 合并+加密+压缩（含图片型降采样） / PPT / 主动提醒（设置/列出/取消，支持每天/每周重复） | openpyxl + python-docx + python-pptx + Pillow + pypdf（+PyMuPDF/ffmpeg 可选）+ Excel/Word COM（Python）+ 可选 LLM |
| `mcp-agent/` | MCP 子 Agent 调度（E240/E389-E408） | 真实 stdio MCP server、统一运行契约；工程构建先读画像，缺失/过期只读盘点，画像就绪后经共享人工门与 [P-154] 执行 Keil/STM32-GCC build（不烧录），结构化产物输出 untrusted | 真实 MCP server + dispatcher |
| `video-learner/` | 视频学习 | 字幕 / ASR 音频转文字 / 关键帧 VLM 理解后生成 Skill 定义，落盘并接入经验库；B站 yt-dlp 被 412 时走浏览器会话拉播放流 | yt-dlp + ffmpeg + 浏览器会话 + 可选 whisper/ASR API + VLM + LLM |
| `pm-xmind/` | PM 角色 Xmind 思维导图（E340） | 文本大纲（WBS 编号/缩进/- 列表）→ .xmind 落盘 `outputs/pm-xmind/`；读取已有 .xmind（沙箱路径或附件）回文本大纲；confirm 写类低风险闸门 | 无外部依赖（jszip 已有） |
| `codegraph/` | 代码影响/调用关系解读（E353） | 只读把「改 X 影响什么 / 谁调用 X / 调用链 / 项目解读」转发本机 codegraph CLI（本地 SQLite 索引，须先 `codegraph init`）；索引缺失给 init 引导 | 本机 `codegraph` CLI（@colbymchenry/codegraph，100% 本地） |
| `layered-arch/` | 分层架构/框架/模块图（E364） | 架构/框架/分层/模块/组件/系统图由分层泳道接管（替代 Archify 架构类）：主模型按「铁律 + 领域样板」产轻量分层 JSON → 本地结构校验（≤1 轮修复）→ 内联自研 viewer.html 成单文件整宽 HTML 落盘 `outputs/layered-arch/`；confirm 低风险 content_generation 闸；流程/时序/数据流/生命周期仍走 archify | 本地 assets viewer + 文本 LLM 一次生成 |
| `archify/` | Archify 交互式系统图（E352） | 流程/时序/数据流/生命周期四类图（系统架构/框架/分层/模块已由 layered-arch 接管，E364）：主模型按 schema 产 typed JSON IR → 本地 vendor renderer validate + deliver 自包含交互 HTML 落盘 `outputs/archify/`；confirm 低风险 content_generation 闸 | vendor `archify` v2.16.0（`src/skills/archify/vendor/`，本地 node 渲染）+ 文本 LLM 一次生成 |
| `delivery-workflow/` | 工程工作流 | 蒸馏自 agent-skills：需求访谈/规格/拆解/TDD/增量/审查/安全/性能/调试/上线 | 无外部依赖，供 LLM 注入 |
| `plan-validation/` | 计划编译校验 | 借鉴 DeepSeek Harness 计划校验思想：检查验收/验证/依赖/文件范围 | 可选文本 LLM；JSON 可直接校验 |

> `delivery-workflow` 不执行代码，而是把 `agent-skills` 中适合一人公司的
> 工程流程编译为可注入 LLM 的“原则 + 步骤 + 质量门禁”，并纳入
> Skill 生命周期（触发/使用/反馈/冷存）。

> `plan-validation` 让 Agent 在拿到计划后先做“编译式检查”，Critical 不通过
> 就不进入执行，避免带着残缺计划开工。

> 市场安装 Skill 的执行链由 `src/skills/market/runner.ts` 承载（E243）：`steps`/`verify` 逐条过
> §10.2 命令白名单，在 `sandbox/market-skills/<name>` 沙箱 cwd 内 shell:false 执行；入口
> `npm run skill:market:run -- <name>|--list`。
