import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canAccessMemoryAsset,
  memoryAssetsForMode,
  memoryItemAsset,
  parseMemoryAccessMode,
} from './asset-acl.js';

test('memory asset ACL 固化三栏装备矩阵', () => {
  assert.deepEqual(memoryAssetsForMode('engineering'), ['skill', 'wiki', 'codegraph']);
  assert.deepEqual(memoryAssetsForMode('knowledge'), ['chat_memory', 'skill', 'wiki']);
  assert.deepEqual(memoryAssetsForMode('life'), ['chat_memory']);
});

test('memory asset ACL 对缺失、非法栏位和未装备资产默认拒绝', () => {
  assert.equal(parseMemoryAccessMode(undefined), null);
  assert.equal(parseMemoryAccessMode('admin'), null);
  assert.equal(canAccessMemoryAsset(null, 'chat_memory'), false);
  assert.equal(canAccessMemoryAsset('engineering', 'chat_memory'), false);
  assert.equal(canAccessMemoryAsset('life', 'skill'), false);
  assert.equal(canAccessMemoryAsset('knowledge', 'skill'), true);
});

test('memory item 类型映射到可管理资产', () => {
  assert.equal(memoryItemAsset('fact'), 'chat_memory');
  assert.equal(memoryItemAsset('session'), 'chat_memory');
  assert.equal(memoryItemAsset('experience'), 'skill');
  assert.equal(memoryItemAsset('unknown'), null);
});
