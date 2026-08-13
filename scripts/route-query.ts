#!/usr/bin/env node
/**
 * 主 Agent 意图路由 CLI
 * 用法: npm run route:query -- "帮我分析 STM32 芯片性能"
 */

import { routeV2 } from '../src/agent/router-v2.js';

const query = process.argv[2];
if (!query) {
  console.error('用法: npm run route:query -- "你的问题"');
  process.exit(1);
}

console.log(JSON.stringify(routeV2(query), null, 2));
