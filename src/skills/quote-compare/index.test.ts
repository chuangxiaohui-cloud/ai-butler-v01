import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createQuoteCompareSkill } from './index.js';

test('quote-compare: 按型号返回对比与最低价', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quote-compare-'));
  const skill = createQuoteCompareSkill({ dbPath: join(dir, 'quotes.db') });
  const deps = { callVLM: async () => '' };
  try {
    const out = await skill.execute(
      {
        query: '帮我对比 STM32F103C8T6 的供应商报价',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'compare_vendor_quotes' },
      },
      deps,
    );
    const result = out.result as {
      part: string;
      quotes: unknown[];
      lowest: { vendor: string; unit_price: number };
    };
    assert.equal(result.part, 'STM32F103C8T6');
    assert.equal(result.quotes.length, 3);
    assert.equal(result.lowest.vendor, 'LCSC');
  } finally {
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
