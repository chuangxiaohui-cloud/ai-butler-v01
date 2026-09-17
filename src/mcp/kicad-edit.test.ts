import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { applyKiCadSchematicEdit, applyKiCadPcbEdit, previewKiCadSchematicEdit, previewKiCadPcbEdit } from './kicad-edit.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'kicad-edit-'));
  const project = join(root, 'projects', 'board');
  mkdirSync(project, { recursive: true });
  const schematicPath = join(project, 'demo.kicad_sch');
  writeFileSync(schematicPath, '(kicad_sch (version 20231120)\n  (symbol (lib_id "Device:R"))\n)\n', 'utf8');
  return { root, schematicPath };
}

test('E413: 预览注解编辑走项目事务且不改源文件', () => {
  const { root, schematicPath } = fixture();
  try {
    const before = readFileSync(schematicPath, 'utf8');
    const preview = previewKiCadSchematicEdit({
      schematicPath,
      edit: { kind: 'append_annotation', text: 'E413-note' },
      workspaceRoot: root,
      snapshotRoot: join(root, 'snapshots'),
    });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.match(preview.summary, /追加注解/);
    assert.equal(readFileSync(schematicPath, 'utf8'), before);
    assert.ok(preview.transaction.entries[0]?.proposedSha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('E413: 确认后追加注解落盘；歧义替换拒绝', () => {
  const { root, schematicPath } = fixture();
  try {
    const applied = applyKiCadSchematicEdit({
      schematicPath,
      edit: { kind: 'append_annotation', text: 'gate-ok' },
      workspaceRoot: root,
      snapshotRoot: join(root, 'snapshots'),
    });
    assert.equal(applied.ok, true);
    assert.match(readFileSync(schematicPath, 'utf8'), /gate-ok/);

    writeFileSync(schematicPath, '(kicad_sch (text "dup") (text "dup"))\n', 'utf8');
    const ambiguous = applyKiCadSchematicEdit({
      schematicPath,
      edit: { kind: 'replace_text', from: 'dup', to: 'one' },
      workspaceRoot: root,
      snapshotRoot: join(root, 'snapshots'),
    });
    assert.equal(ambiguous.ok, false);
    assert.match(ambiguous.error ?? '', /多次/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('E418: PCB 追加丝印注解经事务落盘；拒绝原理图后缀', () => {
  const root = mkdtempSync(join(tmpdir(), 'kicad-pcb-edit-'));
  const project = join(root, 'projects', 'board');
  mkdirSync(project, { recursive: true });
  const pcbPath = join(project, 'demo.kicad_pcb');
  writeFileSync(pcbPath, '(kicad_pcb (version 20240108) (generator pcbnew)\n)\n', 'utf8');
  try {
    const preview = previewKiCadPcbEdit({
      pcbPath,
      edit: { kind: 'append_annotation', text: 'E418-silk' },
      workspaceRoot: root,
      snapshotRoot: join(root, 'snapshots'),
    });
    assert.equal(preview.ok, true);
    assert.equal(readFileSync(pcbPath, 'utf8').includes('E418-silk'), false);

    const applied = applyKiCadPcbEdit({
      pcbPath,
      edit: { kind: 'append_annotation', text: 'E418-silk' },
      workspaceRoot: root,
      snapshotRoot: join(root, 'snapshots'),
    });
    assert.equal(applied.ok, true);
    const body = readFileSync(pcbPath, 'utf8');
    assert.match(body, /gr_text "E418-silk"/);
    assert.match(body, /F\.SilkS/);

    const wrong = applyKiCadPcbEdit({
      pcbPath: join(project, 'demo.kicad_sch'),
      edit: { kind: 'append_annotation', text: 'nope' },
      workspaceRoot: root,
      snapshotRoot: join(root, 'snapshots'),
    });
    assert.equal(wrong.ok, false);
    assert.match(wrong.error ?? '', /\.kicad_pcb/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
