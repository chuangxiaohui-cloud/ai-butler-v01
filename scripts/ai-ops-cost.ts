/**
 * AI 运营成本报告 CLI（§COST v1，npm run cost:today）
 * 读取 E113 usage 记账（data/usage.jsonl），输出今日/本月人民币消耗与预算状态。
 */

import { readUsage } from '../src/usage/usage-store.js';
import { formatAiOpsReport } from '../src/usage/cost.js';

console.log(formatAiOpsReport(readUsage()));
