import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildP10GapSnapshot,
  classifyProjectPath,
  defaultFixtureManifest,
  discoverBusinessProjects,
  mergeManifests,
  planAcceptance,
  summarizeAcceptanceFacts,
  userBusinessManifest,
} from './acceptance.js';

test('E414: 夹具路径分类与业务工程发现', () => {
  const root = mkdtempSync(join(tmpdir(), 'e414-accept-'));
  try {
    mkdirSync(join(root, 'projects', 'e410-mcp-evidence', 'keil'), { recursive: true });
    mkdirSync(join(root, 'projects', 'real-board'), { recursive: true });
    writeFileSync(join(root, 'projects', 'e410-mcp-evidence', 'keil', 'demo.uvprojx'), '<Project/>', 'utf8');
    writeFileSync(join(root, 'projects', 'real-board', 'app.uvprojx'), '<Project/>', 'utf8');
    assert.equal(classifyProjectPath('projects/e410-mcp-evidence/keil/demo.uvprojx', root), 'fixture');
    assert.equal(classifyProjectPath('projects/real-board/app.uvprojx', root), 'business');
    assert.deepEqual(discoverBusinessProjects(root), ['projects/real-board/app.uvprojx']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('E414: dry-run 默认要求确认且零执行意图', () => {
  const root = mkdtempSync(join(tmpdir(), 'e414-plan-'));
  try {
    const manifest = defaultFixtureManifest(root);
    for (const target of manifest.targets) {
      const abs = join(root, target.path);
      mkdirSync(join(abs, '..'), { recursive: true });
      if (target.agentId === 'stm32-gcc') {
        mkdirSync(abs, { recursive: true });
        writeFileSync(join(abs, 'CMakeLists.txt'), 'project(x)\n', 'utf8');
      } else {
        writeFileSync(abs, 'x', 'utf8');
      }
    }
    const plan = planAcceptance({ manifest, confirm: false, workspaceRoot: root, requireBusiness: true });
    assert.equal(plan.mode, 'dry_run');
    assert.ok(plan.blocked.some((item) => item.reason === 'confirmation_required'));
    assert.ok(plan.blocked.some((item) => item.reason === 'business_project_missing'));
    assert.equal(plan.businessTargetCount, 0);
    assert.ok(plan.fixtureTargetCount >= 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('E414: 确认执行夹具时仍标记业务缺口', () => {
  const root = mkdtempSync(join(tmpdir(), 'e414-exec-'));
  try {
    const manifest = defaultFixtureManifest(root);
    for (const target of manifest.targets) {
      const abs = join(root, target.path);
      mkdirSync(join(abs, '..'), { recursive: true });
      if (target.agentId === 'stm32-gcc') {
        mkdirSync(abs, { recursive: true });
        writeFileSync(join(abs, 'CMakeLists.txt'), 'project(x)\n', 'utf8');
      } else {
        writeFileSync(abs, 'x', 'utf8');
      }
    }
    const plan = planAcceptance({ manifest, confirm: true, workspaceRoot: root, requireBusiness: true });
    assert.equal(plan.mode, 'execute');
    assert.ok(plan.blocked.some((item) => item.reason === 'business_project_missing'));
    assert.match(plan.message, /真实业务工程仍缺失/);
    assert.equal(plan.executableTargets.length, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('E414: 用户业务清单四条路径可合并且 dry-run 可计划', () => {
  const root = 'M:/';
  const business = userBusinessManifest(root);
  assert.equal(business.targets.length, 4);
  assert.ok(business.targets.every((item) => item.class === 'business'));
  const merged = mergeManifests(defaultFixtureManifest(root), business);
  assert.ok(merged.targets.length >= 8);
  const plan = planAcceptance({
    manifest: business,
    confirm: false,
    includeFixture: false,
    requireBusiness: true,
    workspaceRoot: root,
  });
  assert.equal(plan.mode, 'dry_run');
  assert.ok(plan.businessTargetCount >= 1);
  assert.ok(plan.executableTargets.some((item) => item.id === 'business-stm32-led-key'));
  assert.ok(plan.executableTargets.some((item) => item.id === 'business-ltspice-lm741'));
});

test('E414: 事实摘要与 P-10 差距表诚实', () => {
  assert.deepEqual(summarizeAcceptanceFacts('erc', {
    ok: true,
    errorCount: 0,
    warningCount: 1,
    sourceUnchanged: true,
    reportRetained: false,
  }), {
    structuredOutput: true,
    ok: true,
    errorCount: 0,
    warningCount: 1,
    sourceUnchanged: true,
    reportRetained: false,
  });
  const gaps = buildP10GapSnapshot({
    maturityLevel: 'L1',
    docLintClean: false,
    fullRegressionRun: false,
    businessAccepted: false,
    fixtureExecuted: true,
    ownerSignoff: false,
  });
  assert.equal(gaps[0]?.status, 'fail');
  assert.match(gaps[0]?.note ?? '', /夹具/);
  assert.equal(gaps[2]?.status, 'fail');
  assert.equal(gaps[4]?.status, 'pending');
});
