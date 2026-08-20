# 进度交接 2026-08-19（v0.2b 续作）

> 当前分支：`v0.2b`｜未提交：E127-E152 行为修复、文档资产、A/B 与 B 套评测工具等一批改动等待统一确认。

## 今日已收口

1. **显式“记住”指令写入长期事实（E133）**：新增 `extractRememberInstruction`，
   `记住：...` 在路由前写入 `user_facts`（`user_explicit`）并返回“已记住”，
   不再触发搜索；CLI 真跑 87ms 返回确认，随后“老规矩”提问能召回该事实。
2. **“刚才/上次”回溯边界（E134）**：Stage 5 提示只能引用历史记忆，记忆里没有
   就明说，不把通用经验说成刚才说过；单测覆盖 prompt 与用户内容注入。
3. **Agent 事务回滚（E135）**：新增 `operation-log.ts`，`project-writer` 写入后
   登记操作日志；`撤销/回滚` 恢复最近备份或删除新建文件，无记录时诚实说明。
4. **PDF 原理图 BOM（E136）**：新增 `schematic-bom` Skill 与 `R_BOM` 路由，
   从 PDF 文本/OCR 提取位号与参数，按值+封装聚合生成 CSV BOM。
5. **办公日常（E137/E138）**：新增 `office-daily` Skill 与 `R_OFFICE_DAILY` 路由，
   支持考勤表模板、CSV/xlsx/xlsm 占比、回复邮件草稿、图片压缩 200KB、
   Word 排版、PDF→Word、项目汇报 PPT、主题色定制、主动提醒；
   calendar/im Skill 改为懒打开 SQLite，消除并发测试锁；未接入能力诚实提示。
6. **全量验证**：`npm run build` 通过；单测 435/435 + 集成 17/17 全绿；
   `doc-lint` 0 FAIL 0 WARN。
7. **B 套重跑验证（E133-E135）**：`npm run bench:devil-b` 全量完成；
   P04/P07 种子轮均为“已记住”且无搜索，正式轮能召回事实；
   C03 正式轮停止编码并明确“刚才说的坑具体指哪个”；
   C07 正式轮返回“已回滚：删除新建文件”；原人工分 28 轮、平均 2.25 保留。
8. **独立“写入 <路径>”路由（E139）**：`写入/保存到/写到 <盘符路径>` 用原始
   query 直接路由 `project_writer`；CLI 真跑直接写入成功，不再被搜索截走。
9. **回滚会话隔离（E140）**：操作日志带 `conversationId`，gateway 支持透传，
   B 套按场景隔离；重跑后 C07 返回“没有最近写入记录”，不再误删 C01 文件。
10. **桌面壳冒烟兼容（E143）**：Electron 开发模式 userData 指向 `data/electron-dev`，
    禁用硬件加速，冒烟加 CI 兼容开关；`npm run desktop:smoke` 输出 `DESKTOP_READY` 且退出码 0。
11. **表格格式识别补齐（E144）**：`office-daily` 占比分析支持 `.csv/.xlsx/.xlsm`，
    `.xls/.xlsb` 老格式诚实提示另存。
12. **文档格式识别补齐（E145）**：文档排版支持 `.docx/.md/.txt/PDF`，
    `.doc` 老格式诚实提示另存。
13. **搜索结果附带视频（E146）**：搜索证据含 B站/YouTube/抖音视频时返回
    `videos` 字段并追加“相关视频教程”区块。
14. **UI 视频卡片（E147）**：三栏 UI 知识咨询栏把 `videos` 渲染成视频卡片区。
15. **视频学习转 Skill（E148）**：`video-learner` 用 yt-dlp 提取字幕，LLM 生成
    Skill JSON 并落盘；无字幕时诚实要求文字稿。
16. **视频 Skill 自动接入经验库（E149）**：`video-learner` 生成 Skill JSON 后调用
    `ExperienceManager.add`，后续同类问题可通过经验检索自动触发；
    单测覆盖经验库写入。
17. **视频学习 ASR 与关键帧（E150）**：无字幕时下载音频并转文字（OpenAI
    兼容 ASR API 或本地 whisper），下载视频后抽关键帧并交给 VLM 描述；
    字幕、ASR、画面三类材料统一进入 Skill 生成。
18. **B站浏览器会话兜底（E151）**：yt-dlp 对 B站 412 时，
    `video-learner` 用浏览器会话直连 B站 API 拉播放流；
    真跑通过：QQ 登录态下用 `player/wbi/v2` 提取字幕，生成 Skill 并接入经验库。
19. **PDF 原理图 BOM 坐标感知 Week 1（E152）**：新增 PyMuPDF 坐标提取与
    文本包围盒聚类脚本，DM365 电源页跑通单页；Week 2 做最近邻绑定与三层过滤。

## 今日收尾状态

- 今晚到此暂停，所有改动仍未提交，继续留在待统一确认批次。
- 相关计划：`docs/plans/2026-08-19-remember-facts.md`（E133/E134）、
  `2026-08-19-agent-rollback.md`（E135）、`2026-08-19-schematic-bom.md`（E136）、
  `2026-08-19-office-daily-skills.md`（E137）、`2026-08-19-office-daily-next.md`（E138）、
  `2026-08-19-write-path-route.md`（E139）、`2026-08-19-rollback-conversation.md`（E140）、
  `2026-08-19-ppt-theme.md`（E141）、`2026-08-19-active-reminders.md`（E142）、
  `2026-08-19-desktop-smoke.md`（E143）、`2026-08-19-spreadsheet-formats.md`（E144）、
  `2026-08-19-document-formats.md`（E145）、`2026-08-19-video-results.md`（E146）、
  `2026-08-19-ui-video-cards.md`（E147）、`2026-08-19-video-learner.md`（E148）。
  另有 `2026-08-19-video-skill-lifecycle.md`（E149）已收尾。
  本项新增 `2026-08-19-video-asr-keyframes.md`（E150）。
  本项新增 `2026-08-19-video-bilibili-browser.md`（E151）。
  本项新增 `2026-08-19-schematic-bom-coordinate.md`（E152）。
- PDF 原理图 BOM：真实样例已放在根目录（DM365 三份 + 老人防跌倒）；
  正确 BOM 对照表为 `365IPC_TOTAL_BOM_0307.xls`；坐标感知方案等用户讨论后实现。

## 明天继续（按优先级）

1. PDF 原理图 → BOM Week 2：最近邻绑定 + 三层过滤 → 全 PDF 跑通 → 与 XLS 对照。

## 常用命令

```bash
npm run review:low-confidence
npm run bench:devil-b
npm run bench:devil-v25
npm run baseline:devil-v25
```
