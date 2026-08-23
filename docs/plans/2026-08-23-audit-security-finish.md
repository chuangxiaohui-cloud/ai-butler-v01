# 推进计划：架构审计安全批收尾（S1 + S2 + S3）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

架构审计最后三个安全项：S1 `session.ts:268-368` fetchPage/downloadFile 无 URL 校验（SSRF 面）——
带登录态的浏览器可被网页提示注入驱动访问 `http://127.0.0.1:8420`（MemoryCore sidecar，弱 key）
或内网管理页，结果回填进回答。S2 `session.ts:246` + `scripts/browser-launch.ts:68-76` CDP 调试口
期间本机任意进程可完全控制浏览器读全部 cookie；CDP 态持久化长期自动重连，风险窗口无限延长。
S3 `configs/tdai-gateway.local.yaml` + `memorycore-store.ts` 双双弱默认 key `local-dev-key`，
本机任意进程可冒充服务读写全部记忆。

## 计划

1. S1 新增 `src/security/url-safety.ts`：`isBlockedBrowserUrl` / `assertSafeBrowserUrl`——
   只允许 http/https，拒绝回环（127.0.0.0/8、::1、localhost、0.0.0.0、IPv4-mapped 含
   Node 十六进制归一化 `::ffff:7f00:1`）/ 链路本地（169.254/16、fe80::/10）/ ULA
   （fc00::/7）；RFC1918 局域网保留放行（嵌入式内网 datasheet 场景，文档注明取舍）。
   `fetchPage` 入口抛错；`downloadFile` 返回 `{ok:false, error}`。
2. S2 `src/browser/session.ts`：`writeCdpState` 记录 [P-121] `expiresAt`（10 分钟 TTL）；
   `savedCdpPort` 超时或旧版无 expiresAt 状态一律清理返回 null——不再无限期自动重连；
   `connectCdp` 输出风险提示；`browser:launch` / `browser:cdp` 脚本消息补 S2 提示与
   `browser:cdp-off` 指引。
3. S3 `src/memory/memorycore-store.ts`：构造新增 `apiKey` 参数，统一 `resolveApiKey`
   校验——空值或 `local-dev-key` 一律抛错拒绝启动；`configs/tdai-gateway.local.yaml`
   改 `server.apiKey: "${TDAI_GATEWAY_API_KEY}"`（与既有 `${TDAI_LLM_API_KEY}` 一致，
   sidecar 支持 env 展开）；`.env.example` 补 TDAI_GATEWAY_API_KEY 与 MEMORY_CORE_* 说明。
4. 参数与文档：`params.ts` 注册 [P-121] `cdpStateTtlMs=600_000`；需求文档 §5 + 附录 A E218；
   code-directory / directory-structure 登记 `url-safety.ts`。
5. 测试：新增 `url-safety.test.ts` 4 条；memorycore 弱 key 拒绝 1 条；session S1/S2 4 条。
6. 验证：build + 定向单测 + 全量 test:all + doc-lint 0 FAIL 0 WARN。

**验收标准**

- 回环/链路本地/非 http(s) URL 在 fetchPage 抛错、downloadFile 返回失败，不发起请求。
- CDP 状态超时自动清理，旧版无过期状态启动即清；连接输出有风险提示。
- MemoryCore 未配置 key 或用默认值构造即抛错；sidecar 配置无明文默认 key。
- build + 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- S1 `src/security/url-safety.ts`（新增）：协议白名单 + 回环/链路本地/ULA/未指定/IPv4-mapped
  黑名单；Node 把 `[::ffff:127.0.0.1]` 规范化为 `::ffff:7f00:1`，十六进制组还原 IPv4 再判。
  `fetchPage` 抛错、`downloadFile` 返回错误对象（保持其契约）。
- S2 `src/browser/session.ts`：TTL 写入/过期清理/旧版状态清空；`connectCdp` console.warn
  风险提示；launch/cdp 脚本消息补 S2 提示与 `browser:cdp-off`。
- S3 `src/memory/memorycore-store.ts`：`resolveApiKey(explicit?, env)` 统一校验，构造第四参
  `apiKey`；`configs/tdai-gateway.local.yaml` 改 env 注入；`.env.example` 补条目。
- 参数：`params.ts` PARAMS + PARAM_IDS 注册 [P-121]。
- 测试：`url-safety.test.ts` 4 条、`memorycore-store.test.ts` 1 条、`session.test.ts` 4 条；
  既有 memorycore 用例补测试 key 参数。
- 文档：需求文档 §5 [P-121] + 附录 A E218；code-directory / directory-structure；
  本计划；交接更新。

### 遇到的问题

- Node `URL.hostname` 对 IPv6 保留方括号（`[::1]`），且 IPv4-mapped 规范化为十六进制
  （`::ffff:7f00:1`）——先剥方括号，再按 16 位组还原内嵌 IPv4 判断。
- 显式传入弱 key（`local-dev-key`）也会绕过 `??` 兜底，`resolveApiKey` 改为显式值与环境
  统一校验。
- session.test.ts 的 S1/S2 用例首次编辑被前一脚本在 memorycore 锚点失败处中断未落盘，
  补跑后 11/11 通过。

## 结果

- 验证：`npm run build` 通过；定向单测 31/31（url-safety 4 + memorycore 5 + session 11 +
  其他回归）；`npm run test:all` 全量单测 680/681（1 skip）+ 集成 15/15；`doc-lint`
  0 FAIL 0 WARN（PARAM 111、C8 35 key、附录 947/950）。
- 测试：新增 9 条全绿；既有 browser/memorycore 回归通过。
- 提交：待提交（与安全/正确性/决策/中期第一~十批同批）。
- 遗留事项：架构审计批次（H1-H4/H10、H5、H9/B1/B4/H8、H6/D1-D5、P1-P17、B2/B3、S1-S3）
  全部收口。
