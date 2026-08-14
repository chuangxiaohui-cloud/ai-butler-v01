# 进度交接 2026-08-14（v0.2b 续作）

> 当前分支：`v0.2b`｜最新提交：`b61c27f`（今日改动均在未提交工作区）

## 当前状态

- `npm run build` 通过。
- `npm run test:all` 全绿：单测 196/196 + 集成 17/17。
- 今日重点：把“搜索结果质量”从可用推进到“能答准实时/版本类问题”。

## 今日已收口

1. **紧急回复从冷冰冰兜底改为场景化秘书话术**
   - 新增 `src/search/emergency-reply.ts`：蛇咬、狗/猫咬伤、火灾、地震、溺水、触电、大出血、呼吸困难、心梗、中毒、人身危险、通用兜底。
   - 保留强制报警提示与“以专业救援/医生判断为准”。
   - 紧急路由关键词补全：蛇咬/中毒/昏迷/心梗/跟踪/遇袭等不再只靠 LLM 识别。

2. **Markdown 链接归一化**
   - `prepareQuery` 先把 `[文字](链接)` 转成干净文本，避免 `[` `]` 语法污染搜索。
   - 实跑 `[PaddleOCR 链接](...)` 正常回答项目用途。

3. **“是什么 + 写个例子”路由修正**
   - `qa` 优先级提前，避免 `写个` 被 `create` 抢走。
   - 合成层新增“用户要求举例时必须给可运行示例”的约束。
   - 实跑函数指针问题已给出可运行 C 代码示例。

4. **手机入网型号精确检索**
   - 查询改写：`MRT-AL10手机` 优先搜 `入网型号 对应手机型号`。
   - 修复 `s2.searchQuery` 未真正传给搜索层的问题。
   - 实跑 `MRT-AL10手机` 正确返回 `华为 nova 14 Ultra`。

5. **赛事/新闻实时性**
   - news 查询自动补当前年份与“最新”。
   - 体育类优先搜 `2026世界杯 决赛 比分 冠军 最新`，不再让“战报”干扰词带偏。
   - Tavily news 走 `topic=news + days=30 + advanced`，但 Tavily 本身仍经常超时，实时性主要靠 Bocha/AnySearch 兜住。
   - 实跑 `世界杯战报` 正确返回西班牙 1-0 阿根廷夺冠。

6. **软件最新版本查询（重点）**
   - 路由修复：同目标候选合并，`R008`/`R012` 不再重复澄清。
   - 版本查询固定走 `factual + 官方优先`，避免“最新”被误分类成 news。
   - 查询改写优先 `<项目> GitHub release latest version` 与 `<项目> npm latest version`。
   - 融合层改用实际检索子词算相关性，GitHub 官方 Release 不再被教程页挤出。
   - OpenClaw 的 GitHub/官方文档登记为官方源。
   - 实跑 `openclaw最新版本号是多少`：`v2026.7.1`，confidence 0.996，gate none，证据 [hard]。

## 主要改动文件

- `src/search/emergency-reply.ts`、`src/agent/intent-feature.ts`
- `src/search/stages/s1_prepare.ts`、`src/search/query-rewrite.ts`
- `src/search/stages/s2_classify.ts`、`src/search/pipeline.ts`
- `src/search/fusion.ts`、`src/search/authority.ts`
- `src/search/providers/tavily.ts`、`src/search/stages/s3_search.ts`
- `src/agent/router-v2.ts` 及对应测试

## 明天继续（按优先级）

1. 把今日修复登记进 v2.5 附录 A 变更记录（尚未做）。
2. 用真实使用 + `npm run route:feedback` 继续攒反馈样本，跑 `route:calibrate`。
3. 用其他开源项目复测版本查询泛化性：OpenWorker、Tauri、Electron、Arduino 等。
4. Tavily 实时通道仍不稳定，若后续要直播/秒级实时，需要评估专门赛事/发布源。
5. 当前工作区未提交，明天开工前先 review 今日改动，确认后提交。

## 常用命令

```bash
npm run build
npm run test:all
npm run dev -- "openclaw最新版本号是多少"
npm run dev -- "世界杯战报"
npm run route:cases
npm run route:feedback
npm run route:calibrate
```

---

## 续作更新（2026-08-14 同日）

1. **借鉴设计落地**：agent-skills → `delivery-workflow`；deepseek-harness →
   `TrajectoryLog` + `plan-validation`；新增 `docs/borrowed-designs.md` 长期登记。
   单测 211/211 + 集成 17/17 全绿。
2. **v2.5 附录 A 登记**：E60-E70 已登记；附录预算 600 → 950（含
   `scripts/doc-lint.ts` 同步），`doc-lint` 0 FAIL / 0 WARN。
3. **版本查询泛化复测**：OpenWorker `v0.1.7` / Tauri `v2.11.5` /
   Electron `v43.3.0` / Arduino IDE `2.3.10`，均答对；Arduino gate 仍触发
   `low_confidence`，已由 E71 修复：规则①不再把 Release 页面里的单位噪声
   当成版本冲突，复测 gate 已变 `none`。
4. **case 库**：pipeline 累计 135 条，校准样本 3/10。
5. **提交推送**：本地提交 `72e3e90`、`6e4593a`、`3d5af9a`；Gitee 与 GitHub
   `v0.2b` 均已推送成功。
6. **官方源主动检索（E72）**：器件型号自动补原厂域查询；无官方源时用
   Tavily `include_domains` 兜底；`domainAuthority` 参与非官方来源评分。
   STM32F103C8T6 主频查询证据已变为 `community.st.com / www.st.com /
   estore.st.com`，单测 217/217 + 集成 17/17 全绿。
7. **国内资料站兜底（E73）**：器件型号追加 `site:szlcsc.com` 与
   `site:xcc.com` 子查询；立创商城 0.8 / 芯查查 0.75 / alldatasheet 0.7
   已登记权威度；搜索循环把“原厂或国内资料站命中”视为高可信覆盖，未覆盖
   时才用 Tavily 兜底，避免券商/贴吧/淘宝聚合页抢答。对应人类找 datasheet
   的路径：官网不可达/需登录时，去立创商城与芯查查。已补 authority/rewrite/
   search-loop 测试，单测 221/221 + 集成 17/17 全绿。
8. **浏览器会话继承（E74）**：新增 `src/browser/session.ts`（持久化
   Chromium profile）与 `browser-session` Skill；首次 `npm run browser:open`
   可视登录一次，之后 Agent 复用 Session/Cookie 抓网页；`npm run
   browser:fetch -- "URL"` 可带会话取正文。技能 17 → 18，真实抓取
   example.com 成功；单测 225/225 + 集成 17/17 全绿。
9. **CDP 直连复用日常浏览器（E75）**：新增 `browser:cdp -- 9222` 与
   `browser:launch -- thorium|qq`；完全关闭 QQ浏览器/Thorium 后用调试
   端口启动，Agent 直接复用其已登录会话，不需要在独立 profile 重登。
   真实 CDP 冒烟连接成功；单测 226/226 + 集成 17/17 全绿。
10. **浏览器会话自动兜底（E76）**：器件型号查询无高可信源时，自动用
   浏览器会话抓取搜索结果前 2 个 URL 正文；抓到官方/立创/芯查查则跳过
   Tavily，失败继续走 Tavily。CLI 默认接入，已连 CDP 时自动复用登录态。
   单测 228/228 + 集成 17/17 全绿。
11. **CDP 端口持久化自动复用（E77）**：`browser:cdp` 保存调试端口到
   `data/browser-session-cdp.json`，Agent 每次启动自动连接；新增
   `browser:cdp-off` 解除关联；浏览器未运行自动回退独立浏览器。
   真实端到端通过；单测 229/229 + 集成 17/17 全绿。
12. **推进计划文档流程（E78）**：新增 `docs/plans/` 目录、README 与
   `_template.md`；以后每次推进先写计划文档，完成后登记到当日交接。

13. **datasheet 下载与证据补强（E79）**：新增 `npm run datasheet -- "URL" [型号]`，
    从立创商品页自动提取 TI 官方 datasheet PDF 下载到 `data/datasheets/`；
    浏览器兜底扩展为证据不足也补证。真实下载 TPS5430.pdf（2.48MB）成功；
    GD32 查询置信度 0.414 → 0.505；单测 231/231 + 集成 17/17 全绿。

14. **low_confidence 二次取证（E80）**：融合后低置信且含器件型号时，
    用浏览器抓高可信 HTML 或下载解析 PDF 重新融合；浏览器取证页不再被
    SEO 降权误伤。GD32 数据手册 confidence 0.505 → 0.652，gate 变 none；
    单测 236/236 + 集成 17/17 全绿。

## 下一步（按优先级）

1. 继续用 `npm run route:feedback` 攒够 10 条 accept/reject 后跑
   `npm run route:apply-calibration`。
2. 继续按 `push:hosts` 流程同步后续改动。
3. 真实复测 `npm run dev -- "STM32F103C8T6 最大主频是多少"` 与
   `npm run dev -- "GD32F103C8T6 数据手册"`，确认国内资料站来源出现在
   结果集；后续可把立创商城/芯查查的商品页 datasheet 下载纳入 MCP 工具。
4. 执行 `npm run browser:open`，在打开窗口里登录立创商城/芯查查等站点后
   回车，再用 `npm run browser:fetch -- "需要登录的URL"` 验证会话继承。
5. 若想直接复用 QQ浏览器/Thorium 现有登录：先完全关闭该浏览器，再
   `npm run browser:launch -- thorium`（或 qq），然后 `npm run browser:cdp -- 9222`。
6. 验证自动兜底：连接 QQ浏览器 CDP 后，直接问 Agent 一个需登录站点相关
   的型号/资料问题，确认证据里出现浏览器抓取的正文。

7. 增强 PDF 解析（复杂排版/扫描件 OCR），支持 datasheet 全文二次取证。
