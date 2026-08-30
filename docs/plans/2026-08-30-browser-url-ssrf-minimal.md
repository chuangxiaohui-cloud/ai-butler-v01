# 推进计划：browser-session URL SSRF 最小防护（审计 §3.2 缺口 #4）

> 日期：2026-08-30 · 分支：v0.2b · 状态：已完成

## 目标

按 owner 拍板（2026-08-30）：v2.5 交付前落地 SSRF 最小防护——协议白名单（仅 http/https）+ 内网 IP 段黑名单（127.0.0.1、10.x、172.16-31.x、192.168.x、169.254.x）+ 禁止跟随 30x 重定向；完整域名白名单放 v2.6。

## 计划

1. `src/security/url-safety.ts`：`isInternalAddress` 追加 RFC1918（10/8、172.16/12、192.168/16）+ 十进制/十六进制整数 IP 归一化（防 2130706433 / 0x7f000001 绕过回环）
2. `src/browser/session.ts`：`fetchPage` 装 `page.route('**/*')` 全量请求校验（含 30x 重定向目标），命中内网/非 http(s) 即 `route.abort`；`downloadFile` 改 `maxRedirects: 0` + 3xx 显式拒绝
3. 测试：url-safety 增 RFC1918/数值 IP 用例（原「RFC1918 放行」用例改拦截）；session 增重定向拦截两用例
4. 文档：计划 + 附录 A E292 + roadmap backlog + README 已知风险 + handoff

**验收标准**

- RFC1918 与回环/链路本地/数值 IP 全部拦截；公网（含 172.32、8.8.8.8、134744072）放行
- 公网页 302 → 内网被拦截；downloadFile 3xx 返回「不允许跟随重定向」
- `npm run build` 绿；url-safety + session + browser-session 相关单测全绿；doc-lint 0 FAIL 0 WARN

## 执行过程

### 改动

- `src/security/url-safety.ts`：RFC1918 三段 + `numericHostToIpv4`（纯十进制 / 0x 十六进制整数 → IPv4 后递归判定）；头部注释更新（含已知影响：内网 datasheet 抓取受限）
- `src/browser/session.ts`：fetchPage 路由拦截 + downloadFile `maxRedirects: 0` + 3xx 拒绝
- `src/security/url-safety.test.ts`：拦截清单 +6（10.x / 172.16 / 172.31 / 192.168 / 2130706433 / 0x7f000001）；放行清单改公网 + 172.32 + 8.8.8.8 + 134744072
- `src/browser/session.test.ts`：共享 fakePage 补 `route`；新增 fetchPage 重定向拦截、downloadFile 3xx 拒绝两用例

### 遇到的问题

- fake 模拟重定向：`route.abort` 在真实 CDP 中不向 handler 抛错而是令 goto 失败；fake 改为「abort 打标记 → goto 据此抛 ERR_BLOCKED_BY_CLIENT」贴合真实行为
- 共享 fakePage 缺 `route` 方法导致既有用例崩，补空实现

## 结果

- 验证：`npm run build` 绿；url-safety + browser-actions + browser-session + browser-session skill 单测 29/29
- 测试：单测 x/x + 集成 x/x（全量待提交前 test:all）
- 提交：`26e86d5`（实现）+ `40dca3c`（metrics 基线）+ `dd27cf0`（回填/登记） · 推送：Gitee / GitHub
- 遗留事项：完整域名白名单 v2.6（roadmap B4）；RFC1918 收紧影响内网 datasheet 抓取（README 已标注）
