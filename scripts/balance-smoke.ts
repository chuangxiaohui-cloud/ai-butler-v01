#!/usr/bin/env node
/**
 * Bocha 余额冒烟：真实调用 /v1/fund/remaining，展示余额与剩余次数估算（§D.3，E192）
 *
 * 用法:
 *   npm run balance:smoke
 */
import { bochaBalanceWarning, describeBochaBalance, queryBochaBalance } from '../src/search/balance.js';

const start = Date.now();
const balance = await queryBochaBalance({ force: true });
const elapsedMs = Date.now() - start;
if (!balance) {
  console.error('❌ 余额探测失败（网络/鉴权），请检查 BOCHA_API_KEY 与网络');
  process.exit(1);
}
console.log(`✅ ${describeBochaBalance(balance)}（探测 ${elapsedMs}ms）`);
const warning = bochaBalanceWarning(balance);
if (warning) console.warn(`⚠️  ${warning}`);
else console.log('✅ 余额健康，无需充值');
