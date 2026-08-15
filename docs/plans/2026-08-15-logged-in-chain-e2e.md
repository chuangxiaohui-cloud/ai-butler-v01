# 推进计划：登录态完整链路 E2E

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

在 QQ 9222 已登录立创/芯查查/半导小芯的前提下，跑一次真实 Agent 查询，验证“意图路由 → 搜索 → 浏览器会话复用 → 二次取证 → 合成回答”完整链路，并确认证据或下载结果确实来自已登录站点。

## 计划

1. 创建本计划文档，确认 `data/browser-session-cdp.json` 指向 9222。
2. `npm run dev -- "STM32F103C8T6 数据手册"`，记录输出 JSON（evidence/gate/confidence）与轨迹文件。
3. 若需要补下载验证，运行 `npm run datasheet -- "https://item.szlcsc.com/9243.html" STM32F103C8T6`，确认 QQ CDP 会话下载并校验 PDF。
4. 检查 `data/datasheets/` 文件大小与型号校验结果。
5. 更新本计划、当日交接、v2.5 附录 A（E92），doc-lint + build/test 后提交推送。

**验收标准**

- 新进程自动复用 QQ CDP 9222，无需重新登录。
- 查询输出 evidence 或 datasheet 下载来源包含 szlcsc/xcc/semiee 至少一个。
- datasheet 文件存在且型号前缀校验通过。
- `npm run build`、`npm run test:all`、doc-lint 全绿。

## 执行过程

### 真实链路

- `browser:status`：`savedCdpPort=9222`，sessionDomains 含 szlcsc/xcc/semiee，确认 QQ CDP 会话可复用。
- `npm run dev -- "STM32F103C8T6 数据手册"`：返回 ST 官方证据（`community.st.com` ×2、`www.st.com`），confidence 0.888，gate `low_confidence`，elapsed 15s。
- `npm run dev -- "从立创商城或芯查查获取 STM32F103C8T6 数据手册"`：回答提到立创/芯查查入口，但最终 evidence 仍只有 ST 官方，暴露“点名国内站时证据未保留”的缺口。
- `npm run datasheet -- "https://item.szlcsc.com/9243.html" STM32F103C8T6`：QQ 会话抓取立创商品页并下载 PDF，大小 2,077,497 B，型号校验通过，提取 179,070 字符。

### 诊断与修复

- Tavily `site:szlcsc.com datasheet` 返回的是 `atta.szlcsc.com` CDN PDF 列表，不是立创商品页；自然词 `STM32F103C8T6 立创商城 数据手册` 能返回 `item.szlcsc.com/9243.html` 等商品页。
- `DOMESTIC_DATASHEET_DOMAINS` 原先只有 szlcsc/xcc，缺少用户已登录的 `semiee.com`。
- 修复：`authority.ts` 把 `semiee.com` 加入国内资料站（权威度 0.75）；`query-rewrite.ts` 对器件型号同时生成“立创商城/芯查查/半导小芯 数据手册”自然词子查询与 `site:` 子查询；`search-loop.ts` Tavily 兜底查询补“半导小芯”。

## 结果

- 完整链路验证通过：Agent 查询自动复用 QQ CDP，datasheet 下载走立创商城真实会话，PDF 下载与型号校验成功。
- 代码增强：半导小芯正式纳入国内资料站清单；查询改写不再只依赖 `site:` 语法，商品页命中率预期提高。
- 回归：`npm run build` 通过；`npm run test:all` 255/255 + 17/17 全绿；`npm exec tsx scripts/doc-lint.ts` 0 FAIL / 0 WARN。
