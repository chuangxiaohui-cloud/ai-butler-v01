/**
 * 报价对比 CLI：直接查询本地报价库。
 * 用法：npm run quote:compare -- STM32F103C8T6
 */

import { createQuoteCompareSkill } from '../src/skills/quote-compare/index.js';

const part = process.argv[2]?.trim();
if (!part) {
  console.log('用法：npm run quote:compare -- STM32F103C8T6');
  process.exit(1);
}

const skill = createQuoteCompareSkill();
const out = await skill.execute(
  {
    query: `帮我对比 ${part} 的供应商报价`,
    attachmentSignals: [],
    rawFiles: [],
    memory: null,
    params: { mode: 'compare_vendor_quotes' },
  },
  { callVLM: async () => '' },
);
skill.close();
console.log(JSON.stringify(out.result, null, 2));
