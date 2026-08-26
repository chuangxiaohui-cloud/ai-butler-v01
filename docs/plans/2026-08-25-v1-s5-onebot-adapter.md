# 推进计划：S5 平台适配器——QQ OneBot 11 真实协议接入

> 日期：2026-08-25 · 分支：v0.2b · 状态：执行中

## 目标

v1.0 S5（E224）远程对话通道骨架（`src/im/`：gate/session/format/service）已收口，但无真实平台
适配器（骨架遗留：真实微信/QQ/飞书适配器按平台协议后续接入，实现 ImChannel 并注入 ask）。
本轮落地**首个真实平台适配器 = QQ OneBot 11 协议**（NapCat/go-cqhttp/Lagrange 生态标准，
纯本地、无需公网，Node 22 内置 fetch/http 零新依赖）：

- 补齐骨架缺失的 `ImChannel` 抽象（start/stop/onMessage/send）。
- 实现 OneBot 11 HTTP 适配器：事件上报（POST 到本地监听端点）→ `ImInboundMessage`；
  回复经 OneBot HTTP API（`send_private_msg`/`send_group_msg`）发出。
- 装配：`configs/im-channels.json`（.example 提交、本地 git 忽略）声明通道，独立常驻入口
  `npm run im:dev` 构造同一 `pipeline`（不另起一套问答链路）注入 `ImService` 并启动通道。
- 安全（§10）：监听默认仅 127.0.0.1；`accessToken` 必填否则拒绝启动；gate 未授权平台
  消息不回复；CQ 码只剥离不执行（不下载图片/文件）。
- 诚实登记：端到端集成测试用本机 mock OneBot server 验证真实 HTTP/JSON 协议交互；真实
  QQ 登录态（NapCat 实例）需用户安装配置后可用；微信（个人号非官方协议）、飞书（需企业
  租户 app 凭据）保持骨架。

## 计划

1. 参数补欠账：E224 的 `DEFAULT_IM_MAX_LENGTH=500` 为未登记裸值 → §5 新增 `[P-123]`
   IM 输出适配上限（500 字符，定稿），`params.ts` 落 `imMaxLength`，`format.ts` 改用引用。
2. 抽象：`src/im/channel.ts` 定义 `ImChannel` 接口与消息回调。
3. OneBot 适配器：`src/im/onebot/{types,cq,adapter}.ts`——
   事件解析（private/group → sessionKey）、CQ 码剥离、Bearer 鉴权、发送 API 映射。
4. 装配：`src/im/config.ts` 读 `configs/im-channels.json` 构造通道；`src/im/run.ts`
   常驻入口（复用 `pipeline`，注入 `ImService`，优雅关闭）；`src/im/gate-cli` 提供
   `npm run im:gate -- enable|disable <platform>` 授权入口。
5. 验证：单测（cq/事件解析/鉴权/send/config）+ 集成测试（mock OneBot server 真实 HTTP
   协议端到端：上报私聊/群消息 → pipeline stub → 回复经 send API 到达 mock）；
   `npm run build` + `npm run test:all` + `doc-lint` 0 FAIL 0 WARN。
6. 文档：需求文档 §5 [P-123] + §4.5 补注 + 附录 A E241、目录文档、handoff、计划收口；
   提交（三段式）。

## 执行过程

### 改动

- `src/im/channel.ts`：`ImChannel` 抽象（start/stop/onMessage/send），补 E224 骨架缺口。
- `src/im/onebot/`：`types.ts`（OneBot 事件/配置/API 响应类型）、`cq.ts`（CQ 码剥离，只提取纯文本，
  不执行/不下载图片文件）、`adapter.ts`（`OneBotChannel`：本地 HTTP 端点接收事件上报 → `ImInboundMessage`
  （私聊/群聊 → sessionKey 隔离），Bearer 鉴权（safeEqual 恒时比较，失败 401），回复经 OneBot HTTP API
  `send_private_msg`/`send_group_msg` 回发；监听默认仅 127.0.0.1；accessToken 必填否则拒绝启动）。
- `src/im/config.ts`：读 `configs/im-channels.json` 构造通道（.example 提交、本地 git 忽略）；
  `src/im/run.ts`：常驻入口 `npm run im:dev`（复用同一 pipeline 函数注入 ask，优雅关闭）；
  `scripts/im-gate.ts`：`npm run im:gate -- enable|disable <platform>` 授权 CLI。
- `src/im/format.ts` + `src/config/params.ts`：[P-123] `imMaxLength=500` 登记（E224 存量裸值），
  `DEFAULT_IM_MAX_LENGTH` 改引用 PARAMS（C8 生效）。
- `tests/integration/im-onebot-real.test.ts`：本地 mock OneBot server 真实 HTTP/JSON 协议端到端
  （INT-IM-001 私聊 → send_private_msg、002 群 → send_group_msg、003 gate 未授权不回复/上报鉴权 401、
  004 长回复 [P-123] 截断）。
- 文档：需求文档 §4.5 实现状态 + §5 [P-123] + 附录 A E241；`docs/code-directory.md`、
  `docs/directory-structure.md`、AGENTS.md 目录地图、`.gitignore`、`configs/im-channels.json.example`。

### 遇到的问题

- 无重大阻塞。真实 QQ 登录态需用户安装 NapCat 等 OneBot 实现并配置 `configs/im-channels.json`
  （accessToken 必填、监听本机）后启用；微信（个人号非官方协议）、飞书（需企业租户 app 凭据）保持骨架。

## 结果

- `npm run build`：通过（tsc 0 错误）。
- `npm run test:all`：单测 840/841（1 skip）+ 集成 22/22（含 INT-IM-001~004）。
- `npm exec tsx scripts/doc-lint.ts`：0 FAIL 0 WARN。
- 提交：见 git log（提交号登记于 handoff）；推送：未推送（待 `push:hosts` 双端同步）。
- 遗留：微信/飞书适配器待平台官方凭据后按 ImChannel 接入；真实 QQ 登录态需用户配置 NapCat。
