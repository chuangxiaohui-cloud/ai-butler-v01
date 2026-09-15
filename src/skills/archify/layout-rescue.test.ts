import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { rescueArchitectureLayout } from './layout-rescue.js';
import type { ArchifyReceipt, ArchifyRunner } from './render.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'archify-rescue-test-'));
}

function okReceipt(): ArchifyReceipt {
  return {
    ok: true,
    command: 'validate',
    checks: Array.from({ length: 6 }, () => ({ name: 'c', ok: true })),
    validation: { checksPassed: 6, checkCount: 6, errors: 0, warnings: 0 },
  };
}

function failReceipt(diagnostics: unknown[]): ArchifyReceipt {
  return { ok: false, command: 'validate', diagnostics: diagnostics as ArchifyReceipt['diagnostics'] };
}

function jsonRunner(
  jsonPath: string,
  decide: (candidate: unknown) => ArchifyReceipt,
): { run: ArchifyRunner } {
  const run: ArchifyRunner = async (args) => {
    if (args[0] !== 'validate') return { code: 0, stdout: JSON.stringify(okReceipt()), stderr: '' };
    const candidate = JSON.parse(readFileSync(args[2], 'utf8'));
    const receipt = decide(candidate);
    return { code: receipt.ok ? 0 : 1, stdout: JSON.stringify(receipt), stderr: '' };
  };
  return { run };
}

const SUGGEST_LABEL_DIAG = {
  code: 'layout/constraint',
  severity: 'error',
  message:
    'Label "写入缓存" overlaps component "order" — adjust labelDx/labelDy/labelSegment or set labelAt. Suggested fix: labelAt [520, 154] or labelDy +24 (below)',
  subject: {},
  evidence: {},
};

const ENDPOINT_SIDE_DIAG = {
  code: 'clean-flow/endpoint-side-direction',
  severity: 'error',
  message: 'does not honor inferred fromSide "left"',
  subject: { id: 'c1', from: 'order', to: 'cache' },
  evidence: { authoredField: 'fromSide', side: 'left', sideOrigin: 'inferred' },
};

test('rescue: E359 降 standard + 留空列 + 照抄标签建议 → ok', async () => {
  const dir = tempDir();
  const jsonPath = join(dir, 'c.json');
  const seed = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 't', quality_profile: 'showcase' },
    layout: { mode: 'grid', cols: 2, gapX: 60, gapY: 80, cellW: 150, cellH: 60 },
    components: [
      { id: 'order', type: 'backend', label: '订单', row: 0, col: 0 },
      { id: 'cache', type: 'database', label: '缓存', row: 0, col: 1 },
    ],
    connections: [{ id: 'c1', from: 'order', to: 'cache', label: '写入缓存' }],
  };
  writeFileSync(jsonPath, JSON.stringify(seed), 'utf8');
  const { run } = jsonRunner(jsonPath, (c: any) => {
    if (c.meta?.quality_profile !== 'standard') return failReceipt([SUGGEST_LABEL_DIAG]);
    if (c.layout?.cols < 3) return failReceipt([SUGGEST_LABEL_DIAG]);
    const conn = c.connections?.find((x: any) => x.id === 'c1');
    if (!conn?.labelAt) return failReceipt([SUGGEST_LABEL_DIAG]);
    return okReceipt();
  });
  try {
    const result = await rescueArchitectureLayout({ jsonPath, run, vendorDir: dir, maxValidations: 10 });
    assert.equal(result.ok, true);
    const final = JSON.parse(result.candidateText);
    assert.equal(final.meta.quality_profile, 'standard');
    assert.equal(final.layout.cols, 3);
    assert.deepEqual(final.connections[0].labelAt, [520, 154]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rescue: E359 端点方向照抄诊断 fromSide/toSide → ok', async () => {
  const dir = tempDir();
  const jsonPath = join(dir, 'c.json');
  const seed = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 't', quality_profile: 'showcase' },
    layout: { mode: 'grid', cols: 2, gapX: 60, gapY: 80, cellW: 150, cellH: 60 },
    components: [
      { id: 'order', type: 'backend', label: '订单', row: 0, col: 0 },
      { id: 'cache', type: 'database', label: '缓存', row: 1, col: 1 },
    ],
    connections: [{ id: 'c1', from: 'order', to: 'cache', label: '写入' }],
  };
  writeFileSync(jsonPath, JSON.stringify(seed), 'utf8');
  const { run } = jsonRunner(jsonPath, (c: any) => {
    const conn = c.connections?.find((x: any) => x.id === 'c1');
    if (conn?.fromSide !== 'left') return failReceipt([ENDPOINT_SIDE_DIAG]);
    return okReceipt();
  });
  try {
    const result = await rescueArchitectureLayout({ jsonPath, run, vendorDir: dir, maxValidations: 10 });
    assert.equal(result.ok, true);
    const final = JSON.parse(result.candidateText);
    assert.equal(final.connections[0].fromSide, 'left');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
const ANTI_PAIR_DIAG = {
  code: 'composition/label-route-clearance',
  severity: 'error',
  message:
    'label "发布事件" on connections[0] "order" -> "mq" label "发布事件" is 0px from connections[1] "mq" -> "order" label "支付回调" segment 1 [415,124] -> [415,397] (label rect [391,241,48,14]; minimum 4px)',
  subject: {},
  evidence: {},
};

test('rescue: E362 反平行双线被 label-route-clearance 点名 → 合并为单条双向虚线通过', async () => {
  const dir = tempDir();
  const jsonPath = join(dir, 'c.json');
  const seed = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 't', quality_profile: 'showcase' },
    layout: { mode: 'grid', cols: 3, gapX: 60, gapY: 80, cellW: 150, cellH: 60 },
    components: [
      { id: 'order', type: 'backend', label: '订单服务', row: 0, col: 0 },
      { id: 'mq', type: 'messagebus', label: '消息队列', row: 1, col: 0 },
    ],
    connections: [
      { id: 'c1', from: 'order', to: 'mq', label: '发布事件' },
      { id: 'c2', from: 'mq', to: 'order', label: '支付回调', variant: 'dashed' },
    ],
  };
  writeFileSync(jsonPath, JSON.stringify(seed), 'utf8');
  const { run } = jsonRunner(jsonPath, (c: any) => {
    const hasReverse = c.connections?.some((x: any) => x.from === 'mq' && x.to === 'order');
    if (hasReverse) return failReceipt([ANTI_PAIR_DIAG]);
    return okReceipt();
  });
  try {
    const result = await rescueArchitectureLayout({ jsonPath, run, vendorDir: dir, maxValidations: 10 });
    assert.equal(result.ok, true);
    const final = JSON.parse(result.candidateText);
    assert.equal(final.connections.length, 1);
    assert.equal(final.connections[0].label, '发布事件/支付回调');
    assert.equal(final.connections[0].variant, 'dashed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rescue: E362 诊断未同时点名两个 label → 不合并（语义保留）', async () => {
  const dir = tempDir();
  const jsonPath = join(dir, 'c.json');
  const seed = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 't', quality_profile: 'showcase' },
    layout: { mode: 'grid', cols: 3, gapX: 60, gapY: 80, cellW: 150, cellH: 60 },
    components: [
      { id: 'order', type: 'backend', label: '订单服务', row: 0, col: 0 },
      { id: 'db', type: 'database', label: '订单库', row: 1, col: 0 },
      { id: 'mq', type: 'messagebus', label: '消息队列', row: 2, col: 0 },
    ],
    connections: [
      { id: 'c1', from: 'order', to: 'mq', label: '发布事件' },
      { id: 'c2', from: 'mq', to: 'order', label: '支付回调', variant: 'dashed' },
      { id: 'c3', from: 'order', to: 'db', label: '读写' },
    ],
  };
  writeFileSync(jsonPath, JSON.stringify(seed), 'utf8');
  const diag = {
    code: 'composition/label-route-clearance',
    severity: 'error',
    message:
      'label "读写" on connections[2] "order" -> "db" label "读写" is 0px from connections[0] "order" -> "mq" label "发布事件" segment 1 [415,124] -> [415,397] (label rect [412,158,48,14]; minimum 4px)',
    subject: {},
    evidence: {},
  };
  const { run } = jsonRunner(jsonPath, () => failReceipt([diag]));
  try {
    const result = await rescueArchitectureLayout({ jsonPath, run, vendorDir: dir, maxValidations: 20 });
    assert.equal(result.ok, false);
    const final = JSON.parse(result.candidateText);
    const pair = final.connections.filter(
      (x: any) => (x.from === 'order' && x.to === 'mq') || (x.from === 'mq' && x.to === 'order'),
    );
    assert.equal(pair.length, 2, '未被点名完整 label 的反平行对不得合并');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rescue: E362 label-route-clearance 端点进入 trouble 集合 → 挪位可释放走廊', async () => {
  const dir = tempDir();
  const jsonPath = join(dir, 'c.json');
  const seed = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 't', quality_profile: 'showcase' },
    layout: { mode: 'grid', cols: 3, gapX: 60, gapY: 80, cellW: 150, cellH: 60 },
    components: [
      { id: 'order', type: 'backend', label: '订单服务', row: 0, col: 0 },
      { id: 'db', type: 'database', label: '订单库', row: 1, col: 0 },
      { id: 'mq', type: 'messagebus', label: '消息队列', row: 0, col: 1 },
    ],
    connections: [
      { id: 'c1', from: 'order', to: 'db', label: '读写' },
      { id: 'c2', from: 'order', to: 'mq', label: '发布事件' },
    ],
  };
  writeFileSync(jsonPath, JSON.stringify(seed), 'utf8');
  const diag = {
    code: 'composition/label-route-clearance',
    severity: 'error',
    message:
      'label "读写" on connections[0] "order" -> "db" label "读写" is 0px from connections[1] "order" -> "mq" label "发布事件" segment 1 [415,124] -> [415,397] (label rect [412,158,48,14]; minimum 4px)',
    subject: {},
    evidence: {},
  };
  const { run } = jsonRunner(jsonPath, (c: any) => {
    const moved = (c.components ?? []).some(
      (x: any) => !(x.row === seed.components.find((s: any) => s.id === x.id)?.row && x.col === seed.components.find((s: any) => s.id === x.id)?.col),
    );
    if (!moved) return failReceipt([diag]);
    return okReceipt();
  });
  try {
    const result = await rescueArchitectureLayout({ jsonPath, run, vendorDir: dir, maxValidations: 20 });
    assert.equal(result.ok, true);
    const final = JSON.parse(result.candidateText);
    const moved = (final.components ?? []).some(
      (x: any) =>
        !(x.row === seed.components.find((s: any) => s.id === x.id)?.row &&
          x.col === seed.components.find((s: any) => s.id === x.id)?.col),
    );
    assert.ok(moved, '本地救援应能移动该诊断族的端点组件以释放走廊');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
