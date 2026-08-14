/**
 * 真实 case 反馈工具：给 pipeline case 打 accept/reject/correct。
 * 交互：npm run route:feedback
 * 脚本：npm run route:feedback -- <caseId> a|r|c [primaryLens/intent]
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { RouteCaseStore, type RouteFeedback } from '../src/agent/route-case-store.js';

const store = new RouteCaseStore();
const records = store.list().filter((r) => r.source === 'pipeline');

if (records.length === 0) {
  console.log('还没有真实 pipeline case。先跑 npm run dev -- "你的问题"。');
  process.exit(0);
}

async function main(): Promise<void> {
  const caseId = process.argv[2]?.trim();
  const feedbackArg = process.argv[3]?.trim().toLowerCase();

  if (caseId && feedbackArg) {
    const feedback = feedbackArg === 'a' ? 'accept' : feedbackArg === 'r' ? 'reject' : feedbackArg === 'c' ? 'correct' : null;
    if (!feedback) {
      console.log('feedback 参数必须是 a / r / c');
      process.exit(1);
    }
    const correctedRoute =
      feedback === 'correct' && process.argv[4]
        ? { primaryLens: process.argv[4].split('/')[0], intent: process.argv[4].split('/')[1] ?? '' }
        : undefined;
    const ok = store.recordFeedback(caseId, feedback as RouteFeedback, correctedRoute);
    console.log(ok ? `已反馈 ${caseId} → ${feedback}` : `未找到 case：${caseId}`);
    process.exit(ok ? 0 : 1);
  }

  const rl = createInterface({ input, output });
  console.log('最近 10 条真实 case：');
  records.slice(-10).forEach((r, i) => {
    console.log(`${i + 1}. ${r.query}（${r.result.decision.type} / ${r.result.confidence.toFixed(2)}）`);
  });
  const pick = Number(await rl.question('选择序号（输入 0 退出）：'));
  if (pick <= 0 || !records[records.length - pick]) {
    rl.close();
    return;
  }
  const record = records[records.length - pick];
  const answer = (await rl.question('反馈 [a]ccept / [r]eject / [c]orrect：')).trim().toLowerCase();
  let feedback: RouteFeedback | null = null;
  if (answer.startsWith('a')) feedback = 'accept';
  else if (answer.startsWith('r')) feedback = 'reject';
  else if (answer.startsWith('c')) feedback = 'correct';
  if (!feedback) {
    console.log('无效输入，取消。');
    rl.close();
    return;
  }
  let correctedRoute: { primaryLens?: string; intent?: string } | undefined;
  if (feedback === 'correct') {
    const route = (await rl.question('正确路由（如 secretary/web_search）：')).trim();
    const [primaryLens, intent] = route.split('/');
    correctedRoute = { primaryLens: primaryLens?.trim(), intent: intent?.trim() };
  }
  store.recordFeedback(record.id, feedback, correctedRoute);
  console.log(`已反馈 ${record.query} → ${feedback}`);
  rl.close();
}

await main();
