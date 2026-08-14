# 路由规则进化工作流

一人公司模式下，规则由“真实 case + 人工审核”驱动，不靠我一个人硬编。

## 完整闭环

1. **收集**
   - CLI/接口每次请求自动写入 `data/route-cases.jsonl`
   - 查看进度：`npm run route:cases`

2. **生成候选**
   - 确定性候选：`npm run route:calibrate`
   - LLM 提案（有 API Key 时）：`npm run route:calibrate -- --llm`

3. **人工审核**
   - 终端交互：`npm run route:review`
   - 或 CSV：`data/rule-candidates.review.csv`，填 `score / verdict / comment`

4. **导入结论**
   - `npm run route:import-review`
   - 结果：accept/reject 回写 case 库，生成 `rule-review-summary.md` 与 `rule-accepted.json`

5. **生成补丁**
   - `npm run route:apply-rules` → `data/routing-patch.ts`
   - 人工确认后写入 `src/agent/routing-table.ts`，并补回归测试

6. **阈值校准**
   - `npm run route:apply-calibration`
   - 样本不足 10 条时会拒绝；达标后生成 `data/calibration-proposal.json`

## 当前状态

- R13（PCB 安全审查 → owner/risk_review）已入库
- R14 会议安排 → secretary/create_calendar：已入库，calendar_skill 本地 SQLite 已可用（创建/查询日程）
- 报价对比：R15 已入库（owner/compare_vendor_quotes），quote-compare 本地报价库已可用
- 发消息：im-dispatch 本地待发送队列已可用（真实 IM 待接）
- 代码实现：engineer 执行器已接（文本 LLM 接入后可直接生成代码）
- 校准样本：4/10，未回写阈值
