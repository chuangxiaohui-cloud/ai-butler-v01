import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ImGate } from './gate.js';

function tmpPath() {
  const dir = mkdtempSync(join(tmpdir(), 'im-gate-'));
  return { dir, file: join(dir, 'gate.json') };
}

test('im-gate: 远程通道默认关闭（§4.5 授权开关）', () => {
  const { dir, file } = tmpPath();
  try {
    const gate = new ImGate(file);
    assert.equal(gate.isEnabled('wechat'), false);
    assert.equal(gate.isEnabled('qq'), false);
    assert.equal(gate.isEnabled('feishu'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('im-gate: enable/disable 后状态切换且落盘重载保持', () => {
  const { dir, file } = tmpPath();
  try {
    const gate = new ImGate(file);
    gate.enable('wechat');
    assert.equal(gate.isEnabled('wechat'), true);
    gate.disable('wechat');
    assert.equal(gate.isEnabled('wechat'), false);
    gate.enable('feishu');

    const reloaded = new ImGate(file);
    assert.equal(reloaded.isEnabled('feishu'), true, '落盘后重载保持');
    assert.equal(reloaded.isEnabled('wechat'), false);
    assert.equal(existsSync(file), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
