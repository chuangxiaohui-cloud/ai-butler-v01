# 用户操作手册 · v1.0

> 版本快照：2026-08-26（v0.2b 分支）· 文档类型：交付期交付物（documentation-map 第四组 #10）
> 证据来源：`ui/prototype/README.md`、需求 §4.1（三栏交互）/§9（证据链与反馈）、package.json 全部入口。

## 1. 产品形态

一人公司 AI-Agent（AI-Butler）是面向嵌入式电子工程师的本地优先桌面助手，五角色合一
（秘书/老板/产品经理/项目经理/系统架构师），三种工作模式（知识问答/项目协作/生活助手）。

## 2. 运行入口

| 入口 | 命令 | 说明 |
|------|------|------|
| CLI 问答 | `npm run dev -- "问题"` | stdout 输出结构化 JSON（answer/confidence/evidence/gate_triggered） |
| Gateway 服务 | `npm run gateway` | 默认 `http://127.0.0.1:8787`，`POST /api/ask` + `/api/events` SSE |
| 桌面壳 | `npm run desktop` / `npm run desktop:smoke` | Electron 主壳（拉起 gateway + 同源 UI）；Tauri 壳 `desktop/src-tauri/` 为备选 |
| 三栏 UI 原型 | `cd ui/prototype && npm run dev` | Vite + React，默认 `http://127.0.0.1:5173/` |
| 构建 | `npm run build` | TypeScript 构建到 `dist/` |
| 测试 | `npm run test:all` | 单测 + 集成（先 build，单测运行 dist/） |

## 3. 三栏交互（§4.1）

- 顶栏三栏导航：**工程开发 / 知识咨询 / 生活助手**；三种任务模式 **Ask（问答）/ Craft（创作）/ Plan（规划）** 与栏位正交。
- 工程开发栏：角色面板、子 Agent 状态、对话区、产物区、内置终端与内置浏览器。
- 提问框：`+` 上传图片/文件/设置工程文件夹；支持粘贴图片；右下角模型切换器（DeepSeek V4 Flash/Pro、MiniMax M3/M2.7、GLM-5.3/5.2/5-Turbo）。
- 运行前置：从 `.env.example` 复制 `.env` 并填写搜索/LLM Provider 密钥。

## 4. 证据链与反馈（§9）

- 每条回答带证据：`[hard]`（官方源/已核验）与 `[soft]`（参考/推断）标签，可点击证据卡片溯源。
- 轻量反馈：回复下方 👍 / 👎 / 修改建议，驱动经验闭环。
- CLI 侧反馈：`npm run route:feedback` 提交 accept/reject；`npm run route:cases` 查看路由 case。

## 5. Skill 与斜杠命令

- 预置 Skill（25 个，`src/skills/`）：芯片分析、datasheet 速查、电路拓扑、行业套件、黑话映射、
  GitHub 解读、颜色识别、文档问答、图像分析、知识问答、内容创作、日历、报价对比、IM 分发、
  工程师、交付流程、计划校验、浏览器会话、项目打包、项目写入、原理图 BOM、办公日常、视频学习、
  MCP 子 Agent 等。
- 市场 Skill：`npm run install:skill` 安装、`npm run skill:market:run -- <name>|--list` 在 §10 沙箱内执行
  （未声明 command 权限的 Skill 拒绝执行）。
- 斜杠命令（会话上下文，E193/E204）：`/context` 查看会话状态（轮次/窗口/摘要/预算）、
  `/compact` 手动压缩窗口外轮次。

## 6. 记忆管理

- 记忆分层：L0 原始对话 → L1 摘要 → L2 关键事实 → L3 长期画像；`npm run distill` 全量 L0 蒸馏。
- 记忆设置：UI 记忆管理页查看/筛选/遗忘（`GET /api/memory`、`POST /api/memory/forget`）。
- 存储切换：`.env` 设 `MEMORY_STORE=memorycore` 启用 MemoryCore sidecar（§8.1.4），默认 SQLite。

## 7. 工程协作与代码托管

- 代码托管：`npm run repo:whitelist -- --authorize --host github.com --owner <owner> --repo <name>`
  授权 → `npm run repo:push -- --dry-run` 预览 → `--yes` 真实推送（token 从 `GITHUB_TOKEN`/`GITEE_TOKEN`
  环境变量注入，不落盘）；`npm run repo:audit` 查看推送审计。
- 双端同步：`npm run push:hosts -- --dry-run` 预览，`--yes` 真实推送 Gitee/GitHub。
- datasheet：`npm run datasheet -- "<商品页URL>" <型号>` 下载并校验官方手册。
- 浏览器：`npm run browser:launch -- qq` 启动/复用调试端口，`npm run browser:fetch -- "<URL>" <等待ms>` 抓取。

## 8. 远程对话通道（S5）

- 配置 `configs/im-channels.json`（复制 .example）后 `npm run im:dev` 常驻运行；QQ OneBot 11 真实适配器。
- 授权开关：`npm run im:gate -- enable|disable <wechat|qq|feishu>`；未授权平台消息不回复。

## 9. 常见问题

- 答非所问/低置信：CLI 输出含 `confidence`，路由层低置信会先确认（confirm）而非直答。
- 网络不可用：搜索 provider 有 fallback 链与兜底（浏览器/官方源）；记忆检索离线可用。
- 输出过长：IM 通道按 [P-123] 上限截断并提示；会话超预算自动压缩（[P-29]/[P-109]）。

## 10. 版本与支持

- 当前主线 v0.2b（里程碑 ≈95%，待 v1.0 全量验收 [P-10]）；权威需求
  `一人公司AI-Agent需求文档_v2.5.md`；`npm exec tsx scripts/doc-lint.ts` 为唯一验收口径。
- 本手册为 v1.0 收口快照；入口变化时重新生成，不覆盖本版。
