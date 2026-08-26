# 推进计划：受限「浏览器操作 Skill」实现（E252 落地）

> 日期：2026-08-26 · 分支：v0.2b · 状态：已实现（2026-08-27 代码批，全部依赖序步骤完成）
> 依据：§4.1.5 浏览器操作（读 + 交互双模，E252）；§10.4 安全 TDD 先行；[P-124]/[P-125]/[P-126]（provisional）。
> 外部参考：ego-lite（citrolabs/ego-lite）——独立 Space/登录态继承、代码底座组合多步、语义+视觉双工作流、深嵌套 iframe 快照（借思想已登记 borrowed-designs.md §2.11；不借整浏览器底座与 js/cdp 任意求值）。
> 形态：受限的浏览器操作 Skill——域名白名单（`domains`）+ 动作白名单（可收窄）+ 用户确认，非通用 agent。

## 计划

### 安全用例先行（§10.4，先红后绿）

| # | 安全边界 | 用例 | 验证目标 |
|---|---------|------|---------|
| A1 | 域名白名单 | 操作目标 URL 不在 Skill `domains` | 拒绝执行 + 提示授权 |
| A2 | 域名白名单 | `browser` 权限 Skill manifest 未声明 `domains` | 安装校验拒绝 |
| A3 | 域名白名单 | 用户授权域名后放行；撤销授权后恢复拒绝 | 授权持久化可撤销 |
| A4 | 域名白名单 | 子域归属（`szlcsc.com` 匹配 `so.szlcsc.com`；`evil-szlcsc.com` 不误放） | 匹配规则正确 |
| A5 | 动作白名单 | 白名单外动作（`execute_js`/`set_cookie`/`open_devtools`） | 拒绝 |
| A6 | 动作白名单 | Skill 收窄动作子集后，全局白名单内但子集外动作 | 拒绝 |
| A7 | 审批双闸 | 表单提交/下载/跨域导航/写操作未确认 | 拒绝执行 |
| A8 | 审批双闸 | 用户确认后执行，动作留痕（轨迹日志） | 可审查 |
| A9 | SSRF | `goto`/`download` URL 过 SSRF 黑名单（复用 url-safety） | 拒绝 |
| A10 | 有界 | 单任务动作数超 [P-124] | 中止 + 归因 |
| A11 | 有界 | 单步超时 [P-125] | 步骤失败归因，不静默继续 |
| A12 | 有界 | DOM 快照注入超 [P-126] | 截断/降级 |
| A13 | 注入 | 页面观察（AX 树/快照）归 untrusted_data，不进可执行上下文 | prompt 注入防御 |

### 模块落点

| 模块 | 改动 |
|------|------|
| `src/config/params.ts` | 登记 `browserOpMaxSteps=P-124`、`browserOpStepTimeoutMs=P-125`、`browserOpDomSnapshotMaxChars=P-126`（PARAMS + PARAM_IDS，C8 登记即生效，必须被引用） |
| `src/security/browser-actions.ts`（新） | 动作白名单 `checkBrowserAction(action, url)`：动作枚举 + URL SSRF（复用 `url-safety`）+ 高风险标记（form_submit/download/cross_domain/write） |
| `src/browser/dom-observe.ts`（新） | 观察器：AX 树序列化 + 可交互元素编号 + 视口/iframe 有界 + [P-126] 截断（对齐 §4.1.5 观察与寻址） |
| `src/browser/operations.ts`（新） | 交互层：`goto/click/type/select/scroll/hover/wait/download`，单步 [P-125] 超时、单任务 [P-124] 计数，动作日志进轨迹 |
| `src/skills/market/types.ts` | `MarketSkillManifest` 增 `domains?: string[]`（browser 权限专用） |
| `src/skills/market/manifest.ts` | `domains` 校验：声明 `browser` 权限必须带非空 `domains`；`command` 权限禁带（互斥） |
| `src/skills/market/runner.ts` | browser Skill 执行：加载 `domains` → 每步 URL/动作过 `checkBrowserAction` + Skill 动作子集 → 审批回调（默认拒绝） |
| 单测 | `browser-actions.test.ts`（A1-A9）、`dom-observe.test.ts`（A12/A13）、`operations.test.ts`（A10/A11）、`manifest.test.ts`（A2）、`params.test.ts`（P-124-126 引用） |
| 集成 | `tests/integration/market-skill-runner.test.ts` 增 INT-MARKET-006：安装受限 Skill → 授权域名操作成功 → 未授权域名拒绝 → 未声明 domains 安装拒绝 |
| 示例 Skill | `configs/market-skills/datasheet-fetch/`：`domains: [szlcsc.com, xcc.com, semiee.com, st.com]`，动作子集 `goto/click/download`，`npm run skill:market:run -- datasheet-fetch --query "型号"` |

### 分步执行顺序（依赖序）

1. 参数登记：P-124/125/126 进 `params.ts` + `params.test.ts`（先落引用，防 C8 死参数）。
2. 安全用例骨架：A1-A13 测试先行（fake browser/CDP，先红）。
3. manifest：`domains` 字段 + 校验 + 单测（A2）。
4. `browser-actions.ts`：动作白名单 + SSRF + 高风险标记 + 单测（A1/A4/A5/A6/A7/A9）。
5. `dom-observe.ts`：AX 树 + 编号 + 有界 + 单测（A12/A13）。
6. `operations.ts`：交互层 + 计数/超时 + 单测（A8/A10/A11）。
7. `runner.ts` 接线：browser Skill 执行链 + 审批回调 + 单测。
8. 示例 Skill `datasheet-fetch` + INT-MARKET-006 集成。
9. 真实冒烟（`browser:open`/CDP 环境可用时）+ 验收样例集初测（datasheet 下载 / 器件参数对比 / 表格填写，登记附录 C）。
10. 全量验证：`npm run build` + `npm run test:all` + `npm run doc-lint`（0 FAIL 0 WARN）+ `npm run maturity:check`。
11. 文档收口：附录 A E252 补实现证据；[P-124]/[P-125]/[P-126] 实测后按 §0.3 状态机定稿或调整；handoff 更新。

### 风险与边界

- 单测全部 fake（Fake CDP/DOM）；真实 CDP 冒烟依赖本机 `browser:launch -- qq`/`browser:open` 环境，不可用时如实跳过。
- [P-124]/[P-125]/[P-126] 为 provisional@2026-08-26，定稿需真实任务实测样本（对齐 [P-10] 验收门）。
- 动作审批回调复用既有「高风险权限逐项 confirm」模式（E250 `installFromLocalDir` 同款），默认拒绝。
- 本机 `AppData` junction 陷阱不影响浏览器测试（git 专属），但集成测试临时目录保持既有 `git init` 规避模式。

## 执行

按依赖序 1-11 全部完成（2026-08-27）：
1. 参数登记 P-124/125/126（params.ts + C8 引用经 dom-observe/operations 落地）。
2. 安全用例 A1-A13：browser-actions（A5/A7/A9）、domain-auth（A1/A3/A4）、dom-observe（A12/A13）、operations（A6/A8/A10/A11）单测全绿（先红后绿）。
3. manifest：domains/actions 字段 + 校验（A2：browser 必带非空 domains、与 command 互斥、actions 仅 browser 且限白名单）。
4. browser-actions.ts：动作白名单 + SSRF 复用 url-safety + 高风险标记。
5. dom-observe.ts：AX 树 + 编号 + iframe 深度有界 + [P-126] 截断 + 文本归一（A13）。
6. operations.ts：DSL 解析（@query 编码/原样注入）+ [P-124] 计数 + [P-125] 超时 + 审批回调 + onAction 留痕。
7. runner.ts：runBrowser 异步链 + isBrowserSkill + 同步 run() 对 browser Skill 提示走 CLI/桌面入口。
8. 示例 Skill datasheet-fetch + INT-MARKET-006（安装校验 → 未授权拒绝 → 授权+确认执行 → 撤销恢复拒绝）。
9. 真实冒烟（本机 Edge + 联网）：datasheet-fetch --yes 全链通过（goto 2.7s + click 1.5s，AX 快照定位 PDF 链接）；[P-125] 单步超时与 [P-126] 快照截断实测生效。
9b. （续 2026-08-27）download 选择器路径：`driver.resolveHref`（CDP evaluate 解析页面内 href）+ operations 对非 http(s) 的 download 目标先解析再走统一域名/SSRF/审批后置门；单测新增 4 条（解析成功链 / 域名后置门 / SSRF 后置门 / 解析失败与超时）。
9c. （续 2026-08-27）样例集按 §4.1.5 场景扩充：新增 `configs/market-skills/part-spec-observe`（v0.1.0，器件参数对比只读链 goto → click a[href*="item.szlcsc.com"] → wait，纯只读无写操作）与 `configs/market-skills/lcsc-search-form`（v0.1.0，表格填写 goto → type #global-seach-input → click #search → wait，type 写操作需 --yes）；两 Skill 已安装 + szlcsc.com 授权；真实冒烟：B4a/B4b 全执行（7.2s / 7.5s），终态快照停留搜索页（商品详情 target=_blank 新标签不在当前 AX 快照，诚实边界登记附录 C.5）；B5 带 --yes 通过（8.7s）；B6 不带 --yes 被拦截（exit 1「高风险动作未获用户确认（写操作）」）；样例集附录 C.5 扩至 n=7。
10. 全量验证：单测 936/937（1 skip）+ 集成 32/32 + doc-lint 0 FAIL 0 WARN（C8 49 key）+ maturity L1（用户累积 Skill 5→6）。
11. 文档收口：附录 A E252 状态更新、code-directory/directory-structure/AGENTS.md 地图、docs/2026-08-27-progress-handoff.md。

## 结果

- 单测 936/937（1 skip，含新增 40 条）｜集成 32/32（含 INT-MARKET-006）｜doc-lint 0 FAIL 0 WARN｜真实冒烟通过（datasheet-fetch）。
- 遗留：无（[P-124]/[P-125]/[P-126] 已由 owner 2026-08-27 签认定稿，附录 A 有定稿记录）；样例集附录 C.5 扩至 n=7（B1-B6，三类真实场景：datasheet 下载 / 器件参数对比 / 表格填写，登记见 9c）。