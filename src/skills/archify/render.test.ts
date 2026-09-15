import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  archifyValidate,
  countDiagnostics,
  defaultArchifyRunner,
  defaultVendorDir,
  summarizeDiagnostics,
  type ArchifyRunner,
} from './render.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'archify-render-test-'));
}

test('render: E352 解析 validate 收据（诊断计数与摘要）', async () => {
  const run: ArchifyRunner = async () => ({
    code: 1,
    stdout: JSON.stringify({
      ok: false,
      command: 'validate',
      type: 'architecture',
      checks: [{ name: 'single_svg', ok: true }],
      diagnostics: [
        {
          code: 'layout/constraint',
          severity: 'error',
          message: 'Label "下单" overlaps component "api" — adjust labelDy.',
          subject: { diagramType: 'architecture', id: 'c2a' },
          evidence: {},
          supportedFixes: ['labelDy +24'],
        },
        {
          code: 'clean-flow/edge-through-node',
          severity: 'error',
          message: 'crosses component "auth".',
          subject: { id: 'a2b' },
          evidence: {},
          supportedFixes: [],
        },
      ],
    }),
    stderr: '',
  });
  const dir = tempDir();
  const vendorDir = defaultVendorDir();
  try {
    const receipt = await archifyValidate(
      run,
      'architecture',
      join(dir, 'c.json'),
      'showcase',
      vendorDir,
      dir,
    );
    assert.equal(receipt.ok, false);
    assert.equal(receipt.command, 'validate');
    assert.equal(countDiagnostics(receipt.diagnostics), 2);
    const summary = summarizeDiagnostics(receipt.diagnostics ?? []);
    assert.ok(summary.includes('layout/constraint'));
    assert.ok(summary.includes('c2a'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('render: E352 输出非 JSON 时给出可读失败收据', async () => {
  const run: ArchifyRunner = async () => ({ code: 1, stdout: 'not json', stderr: 'boom' });
  const dir = tempDir();
  try {
    const receipt = await archifyValidate(run, 'workflow', join(dir, 'c.json'), 'showcase', defaultVendorDir(), dir);
    assert.equal(receipt.ok, false);
    assert.ok((receipt.error ?? '').includes('无法解析 archify 输出'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('render: E352 真实 vendor validate 官方 workflow 示例通过（确定性冒烟）', async () => {
  const vendorDir = defaultVendorDir();
  assert.ok(existsSync(join(vendorDir, 'bin', 'archify.mjs')), 'vendor 应随仓库存在');
  const example = join(vendorDir, 'examples', 'agent-tool-call.workflow.json');
  const receipt = await archifyValidate(
    defaultArchifyRunner(120_000),
    'workflow',
    example,
    'showcase',
    vendorDir,
    process.cwd(),
  );
  assert.equal(receipt.ok, true, receipt.error ?? '');
  assert.equal(receipt.checks?.length, 9);
  assert.equal(receipt.diagnostics?.length ?? 0, 0);
});
