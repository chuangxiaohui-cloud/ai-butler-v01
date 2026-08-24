import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRealToolName, type SubAgentMeta } from './types.js';

const placeholder: SubAgentMeta = {
  id: 'kicad',
  name: 'KiCad',
  category: 'eda',
  toolPrefix: 'kicad.',
  available: false,
  command: [],
};

const real: SubAgentMeta = {
  id: 'windows',
  name: 'Windows 桌面控制',
  category: 'system',
  toolPrefix: 'windows.',
  available: true,
  command: ['C:\\windows-mcp.exe', 'serve'],
  allowedTools: ['Process'],
  toolMap: { 'windows.Process': 'Process' },
  defaultTool: 'windows.Process',
};

test('resolveRealToolName: 占位 agent 透传内部工具名（E222 骨架语义）', () => {
  assert.equal(resolveRealToolName(placeholder, 'kicad.sch_export'), 'kicad.sch_export');
  assert.equal(resolveRealToolName(placeholder, 'kicad.run'), 'kicad.run');
});

test('resolveRealToolName: 前缀外工具名拒绝', () => {
  assert.equal(resolveRealToolName(real, 'altium.open'), null);
  assert.equal(resolveRealToolName(placeholder, 'altium.open'), null);
});

test('resolveRealToolName: 真实接入按 toolMap 映射', () => {
  assert.equal(resolveRealToolName(real, 'windows.Process'), 'Process');
});

test('resolveRealToolName: 真实接入无 toolMap 时剥前缀', () => {
  const noMap: SubAgentMeta = { ...real, toolMap: undefined };
  assert.equal(resolveRealToolName(noMap, 'windows.Process'), 'Process');
});

test('resolveRealToolName: 真实接入白名单外拒绝（allowedTools 缺省全拒语义）', () => {
  assert.equal(resolveRealToolName(real, 'windows.PowerShell'), null);
  const allowAll: SubAgentMeta = { ...real, allowedTools: ['Process', 'App'] };
  assert.equal(resolveRealToolName(allowAll, 'windows.App'), 'App');
});