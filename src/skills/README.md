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
| `github-reader/` | GitHub 项目解读 | v0.2a | 需要 MCP/浏览器子 Agent |
| `datasheet-speed/` | Datasheet 速读 | v0.2a | 依赖 Datasheet PDF 解析管道 |
| `circuit-topology/` | 常见电路拓扑 | v0.2b | 需要 ExperienceManager 积累 |
| `industry-kits/` | 行业知识包 | v0.2b | 需要 L1/L2 蒸馏后装备 |

> 占位目录保留最小入口文件（`index.ts` + `README.md`），确保构建不报错且版本升级时不会遗漏。

## 原生 Skill（Week 3）

| 目录 | Skill | 作用 | 依赖 |
|------|-------|------|------|
| `color-recognition/` | 颜色识别 | L1 语义色名 + L2 主色调 HEX | VLM（DI 注入） |
| `document-qa/` | 文档解析 | 结构化摘要 / 结构提取 / 全文问答 | parseDocument + 可选文本 LLM |
| `image-analysis/` | 通用图片描述 | 按需 VLM 描述图片内容/文字 | VLM（DI 注入） |
| `knowledge-qa/` | 文化梗/知识问答 | 简洁作答，已知梗做最小兜底 | 可选文本 LLM |
| `content-writer/` | 文档/PRD 生成 | 按 query 生成结构化 Markdown 文档 | 文本 LLM |
| `calendar-skill/` | 本地日历 | 创建/查询日程（SQLite，创建自动登记提醒，支持每天/每周重复） | 无外部依赖 |
| `quote-compare/` | 报价对比 | 本地供应商报价库查询/对比（SQLite） | 无外部依赖 |
| `im-dispatch/` | 消息待发队列 | 写入本地 outbox（SQLite） | 真实 IM 待接 |
| `engineer/` | 代码实现 | 按需求生成代码/实现方案 | 文本 LLM |
| `project-writer/` | 工程落地 | 按路径+内容写入工程文件，覆盖前备份，路径过沙箱白名单 | 无外部依赖 |
| `schematic-bom/` | PDF 原理图 BOM | PyMuPDF 坐标最近邻绑定位号/值/封装，三层过滤噪声并合并 BOM Change 备注后聚合生成 CSV BOM；坐标失败回退文本/OCR | PyMuPDF + parseDocument + 可选 LLM |
| `office-daily/` | 办公日常 | 考勤表模板 / CSV+xlsx+xlsm+xls+xlsb 占比 / 回复邮件/会议邀请草稿 / 图片压缩+格式转换（含 AVIF/TIFF，HEIC 尽力解码） / 图片 OCR 文字提取（含多图批量）/ 文档排版（docx/md/txt/pdf/doc）/ Word↔PDF / PDF 合并+加密+压缩（含图片型降采样） / PPT / 主动提醒（设置/列出/取消，支持每天/每周重复） | openpyxl + python-docx + python-pptx + Pillow + pypdf（+PyMuPDF/ffmpeg 可选）+ Excel/Word COM（Python）+ 可选 LLM |
| `video-learner/` | 视频学习 | 字幕 / ASR 音频转文字 / 关键帧 VLM 理解后生成 Skill 定义，落盘并接入经验库；B站 yt-dlp 被 412 时走浏览器会话拉播放流 | yt-dlp + ffmpeg + 浏览器会话 + 可选 whisper/ASR API + VLM + LLM |
| `delivery-workflow/` | 工程工作流 | 蒸馏自 agent-skills：需求访谈/规格/拆解/TDD/增量/审查/安全/性能/调试/上线 | 无外部依赖，供 LLM 注入 |
| `plan-validation/` | 计划编译校验 | 借鉴 DeepSeek Harness 计划校验思想：检查验收/验证/依赖/文件范围 | 可选文本 LLM；JSON 可直接校验 |

> `delivery-workflow` 不执行代码，而是把 `agent-skills` 中适合一人公司的
> 工程流程编译为可注入 LLM 的“原则 + 步骤 + 质量门禁”，并纳入
> Skill 生命周期（触发/使用/反馈/冷存）。

> `plan-validation` 让 Agent 在拿到计划后先做“编译式检查”，Critical 不通过
> 就不进入执行，避免带着残缺计划开工。
