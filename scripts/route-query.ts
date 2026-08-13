#!/usr/bin/env node
/**
 * 主 Agent 意图路由 CLI
 * 用法: npm run route:query -- "帮我分析 STM32 芯片性能"
 */

import { createLightClient } from '../src/search/llm.js';
import {
  P83_ROUTE_LLM_TIMEOUT_MS,
  routeV2,
  routeV2WithLLM,
} from '../src/agent/router-v2.js';

const query = process.argv[2];
const useLlm = process.argv.includes('--llm');
if (!query) {
  console.error('用法: npm run route:query -- "你的问题" [--llm]');
  process.exit(1);
}

async function main(): Promise<void> {
  if (useLlm) {
    const llm = createLightClient({ timeoutMs: P83_ROUTE_LLM_TIMEOUT_MS });
    console.log(JSON.stringify(await routeV2WithLLM(query, llm), null, 2));
  } else {
    console.log(JSON.stringify(routeV2(query), null, 2));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
