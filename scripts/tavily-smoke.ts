#!/usr/bin/env node
/**
 * Tavily 触发冒烟 + 配额报告（§6.2.1，E195）
 *
 * 1) TAVILY_API_KEY 配置检查（不显示值）
 * 2) shouldTriggerTavily 触发判定样例（news / english / low_confidence_hint / 严肃禁区）
 * 3) 真实链路冒烟：runSearchStage 注入 Tavily（走真实月配额 + provider，1 次调用）
 * 4) 月度配额报告：[P-64]=1000，已用/剩余，剩余 <20% 预警
 *
 * 用法: npm run tavily:smoke
 */
import { join } from 'path';

import { loadEnvFile } from '../src/config/env.js';
import { readMonthlyQuota, TAVILY_MONTHLY_LIMIT } from '../src/search/quota.js';
import { tavilyProvider } from '../src/search/providers/tavily.js';
import { runSearchStage } from '../src/search/stages/s3_search.js';
import type { IntentKey } from '../src/search/stages/s2_classify.js';
import { shouldTriggerTavily } from '../src/search/tavily-trigger.js';

loadEnvFile();

const quotaFile = join(process.cwd(), 'data', 'tavily-monthly.json');

interface TriggerSample {
  query: string;
  intent: IntentKey;
  serious?: boolean;
}

const TRIGGER_SAMPLES: TriggerSample[] = [
  { query: 'openclaw最新版本号是多少', intent: 'factual' },
  { query: 'STM32F103C8T6 最大主频是多少', intent: 'factual' },
  { query: '今天 A 股行情', intent: 'news' },
  { query: 'embedded linux 编译报错 undefined reference', intent: 'troubleshooting' },
  { query: '如何避免 PCB 布局踩坑', intent: 'experience' },
  { query: '高血压患者应该吃什么药', intent: 'factual', serious: true },
];

async function main(): Promise<void> {
  let failed = false;
  console.log('Tavily 触发冒烟 + 配额报告（§6.2.1 / [P-64]）\n');

  // 1) key 配置检查
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    console.error('❌ TAVILY_API_KEY 未配置（.env），请先复制 .env.example 并填入');
    process.exit(1);
  }
  console.log(`✅ TAVILY_API_KEY 已配置（${apiKey.length} 字符，不显示值）`);

  // 2) 触发判定样例
  console.log('\n触发判定（shouldTriggerTavily）：');
  for (const s of TRIGGER_SAMPLES) {
    const trigger = shouldTriggerTavily(s.query, s.intent, s.serious ?? false);
    console.log(`  ${trigger ? `✅ ${trigger}` : '⏭️  none'}  ${s.query}`);
  }

  // 3) 真实链路冒烟（英文技术触发，走真实月配额 + provider）
  console.log('\n真实链路冒烟（runSearchStage 注入 Tavily）：');
  const smokeQuery = 'STM32F103C8T6 datasheet 72MHz';
  const r = await runSearchStage(smokeQuery, {
    intent: 'factual',
    providers: [tavilyProvider],
    cacheKey: `tavily:smoke:${Date.now()}`,
    tavily: { enabled: true, trigger: 'english' },
  });
  const att = r.attempts.find((a) => a.provider === 'tavily');
  const ok = att?.ok === true && r.results.length > 0;
  if (ok) {
    console.log(
      `  ✅ tavily=ok(${att.latencyMs}ms) 结果=${r.results.length} 条` +
        `${r.aiAnswers.length > 0 ? '，AI answer 有' : '，无 AI answer'}`,
    );
  } else {
    failed = true;
    const quotaLimited = (att?.error ?? '').includes('432');
    const tag = quotaLimited ? '⚠️' : '❌';
    console.error(
      `  ${tag} tavily=${att?.ok ? 'ok' : 'fail'}(${att?.latencyMs ?? '-'}ms)` +
        ` ${att?.error ?? ''} 结果=${r.results.length}`,
    );
    if (quotaLimited) {
      console.warn('    → Tavily 计划用量超限：key 有效但本月额度已耗尽，需升级或等下月重置');
    }
  }

  // 4) 月度配额报告（结合实测：远端 432 说明本地计数口径低于实际额度消耗）
  const quotaLimited = (att?.error ?? '').includes('432');
  const q = readMonthlyQuota(quotaFile, 'tavily', TAVILY_MONTHLY_LIMIT);
  const pct = Math.round(q.ratio * 100);
  console.log(
    `\n月度配额（[P-64]=${q.limit} 次/月）：本月 ${q.month} 已用 ${q.used}（${pct}%），剩余 ${q.remaining}`,
  );
  if (quotaLimited) {
    console.warn('⚠️  实测远端已超限（HTTP 432）：本地计数未到 [P-64] 但额度耗尽，');
    console.warn('    说明实际计划额度 <1000 或 news/advanced 等按多倍计费，需按实测复算 [P-64]');
  } else if (q.remaining < 0.2 * q.limit) {
    console.warn(`⚠️  Tavily 月配额剩余 <20%（${q.remaining}），按需关注成本/提前熔断`);
  } else {
    console.log('✅ 配额健康（剩余 ≥20%）');
  }

  console.log(`\n${failed ? '❌ 冒烟失败' : '✅ 冒烟通过'}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }, null, 2));
  process.exit(1);
});