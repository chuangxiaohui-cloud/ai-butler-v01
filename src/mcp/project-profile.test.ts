import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldReplaceProfileValue,
  validateProjectMcpProfile,
  type ProjectMcpProfile,
} from './project-profile.js';

function profile(): ProjectMcpProfile {
  return {
    schemaVersion: 1,
    projectId: 'project-7f83',
    projectRoot: 'M:/projects/demo',
    platform: 'stm32',
    chip: null,
    targets: ['Debug'],
    selectedTarget: 'Debug',
    capabilities: [{ agentId: 'keil', platform: 'keil-mdk', build: null, evidence: { source: 'project_file', evidenceRef: 'demo.uvprojx', observedAt: 1 } }],
    build: { agentId: 'keil', toolName: 'keil.BuildProject', args: { target: 'Debug' } },
    flash: null,
    serial: { port: null, baud: null },
    sdkRoot: null,
    template: null,
    provenance: {
      build: { source: 'project_file', evidenceRef: '.uvprojx#TargetName', observedAt: 1 },
    },
    verifiedAt: null,
  };
}

test('项目画像接受显式 null 与结构化工具引用', () => {
  const result = validateProjectMcpProfile(profile());
  assert.equal(result.ok, true);
});

test('项目画像拒绝裸命令字段与模型候选授权动作', () => {
  assert.equal(validateProjectMcpProfile({ ...profile(), build_cmd: 'UV4 -b demo.uvprojx' }).ok, false);

  const candidate = profile();
  candidate.provenance.build = { source: 'model_candidate', evidenceRef: null, observedAt: 2 };
  const result = validateProjectMcpProfile(candidate);
  assert.deepEqual(result, { ok: false, reason: 'model_candidate 不能授权 build' });
});

test('更高证据优先级才替换已有画像值', () => {
  assert.equal(shouldReplaceProfileValue('tool_probe', 'user_confirmed'), true);
  assert.equal(shouldReplaceProfileValue('project_file', 'cache'), false);
  assert.equal(shouldReplaceProfileValue('tool_probe', 'tool_probe'), false);
});

test('项目画像拒绝重复 target 与未列出的 selectedTarget', () => {
  assert.equal(validateProjectMcpProfile({ ...profile(), targets: ['Debug', 'Debug'] }).ok, false);
  assert.equal(validateProjectMcpProfile({ ...profile(), selectedTarget: 'Release' }).ok, false);
});
