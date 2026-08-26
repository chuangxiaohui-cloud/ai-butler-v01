#!/usr/bin/env node
/**
 * E241：远程通道授权开关 CLI（§4.5 授权开关）。
 * 用法：npm run im:gate -- enable qq   /   npm run im:gate -- disable qq
 * 状态落盘 data/im-gate.json（ImGate，重启保持）。
 */

import { ImGate } from '../src/im/gate.js';

const [action, platformRaw] = process.argv.slice(2);
const platform = platformRaw?.toLowerCase() ?? '';

if ((action !== 'enable' && action !== 'disable') || !['wechat', 'qq', 'feishu'].includes(platform)) {
  console.error('用法：npm run im:gate -- enable|disable <wechat|qq|feishu>');
  process.exit(1);
}

const gate = new ImGate();
if (action === 'enable') gate.enable(platform as 'wechat' | 'qq' | 'feishu');
else gate.disable(platform as 'wechat' | 'qq' | 'feishu');

console.log(JSON.stringify({ action, platform, enabled: gate.isEnabled(platform as 'wechat' | 'qq' | 'feishu') }, null, 2));
