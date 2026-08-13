import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { isOfficialForQuery } from './authority.js';

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

test('authority: 型号变体页面不误判为官方源', () => {
  assert.equal(
    isOfficialForQuery('https://item.szlcsc.com/515651.html', 'TPS5430 输入电压范围'),
    false,
  );
});
