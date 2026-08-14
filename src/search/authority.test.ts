import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { isOfficialForQuery, officialSourceHintForQuery } from './authority.js';

test('authority: 器件型号前缀映射官方域', () => {
  assert.deepEqual(
    officialSourceHintForQuery('STM32F103C8T6 最大主频是多少'),
    { vendor: 'STM32', domain: 'st.com' },
  );
  assert.deepEqual(
    officialSourceHintForQuery('ESP32-C3-MINI-1 引脚'),
    { vendor: 'ESP32', domain: 'espressif.com' },
  );
  assert.equal(officialSourceHintForQuery('世界杯战报'), null);
});

test('authority: Tauri GitHub 仓库识别为官方源', () => {
  assert.equal(
    isOfficialForQuery('https://github.com/tauri-apps/tauri', 'Tauri 框架 架构 技术栈'),
    true,
  );
  assert.equal(
    isOfficialForQuery('https://medium.example/tauri', 'Tauri 框架 架构 技术栈'),
    false,
  );
});

test('authority: OpenWorker GitHub 仓库识别为官方源', () => {
  assert.equal(
    isOfficialForQuery('https://github.com/andrewyng/openworker', 'OpenWorker 项目 用途'),
    true,
  );
});

test('authority: OpenClaw GitHub 与官方文档识别为官方源', () => {
  assert.equal(
    isOfficialForQuery('https://github.com/openclaw/openclaw/releases', 'openclaw最新版本号是多少'),
    true,
  );
  assert.equal(
    isOfficialForQuery('https://docs.openclaw.ai/releases', 'openclaw最新版本号是多少'),
    true,
  );
});

test('authority: 型号变体页面不误判为官方源', () => {
  assert.equal(
    isOfficialForQuery('https://item.szlcsc.com/515651.html', 'TPS5430 输入电压范围'),
    false,
  );
});
