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

## 下一步（按优先级）

1. 继续用 `npm run route:feedback` 攒够 10 条 accept/reject 后跑
   `npm run route:apply-calibration`。
2. 继续按 `push:hosts` 流程同步后续改动。
