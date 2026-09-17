/** E413/E418：KiCad 原理图/PCB 有界编辑；经项目事务快照后才落盘。 */

import { readFileSync } from 'node:fs';
import { basename, relative } from 'node:path';

import {
  commitProjectTransaction,
  prepareProjectTransaction,
  type CommitProjectTransactionResult,
  type PreparedProjectTransaction,
  type ProjectTransactionAudit,
} from '../security/project-transaction.js';
import { isPathAllowed } from '../security/sandbox.js';

/** 有界编辑：追加注解或单次精确替换（原理图/PCB 共用形状）。 */
export type KiCadBoundedEdit =
  | { kind: 'append_annotation'; text: string }
  | { kind: 'replace_text'; from: string; to: string };

/** 语义同 KiCadBoundedEdit；保留别名避免破坏既有导入。 */
export type KiCadSchematicEdit = KiCadBoundedEdit;

export type PreviewKiCadEditResult =
  | { ok: true; transaction: PreparedProjectTransaction; summary: string }
  | { ok: false; error: string };

/** 兼容旧名 */
export type PreviewKiCadSchematicEditResult = PreviewKiCadEditResult;

type KiCadDocKind = 'schematic' | 'pcb';

export function previewKiCadSchematicEdit(input: {
  schematicPath: string;
  edit: KiCadBoundedEdit;
  workspaceRoot?: string;
  snapshotRoot?: string;
  audit?: ProjectTransactionAudit;
}): PreviewKiCadEditResult {
  return previewKiCadBoundedEdit({
    path: input.schematicPath,
    docKind: 'schematic',
    edit: input.edit,
    workspaceRoot: input.workspaceRoot,
    snapshotRoot: input.snapshotRoot,
    audit: input.audit,
  });
}

export function applyKiCadSchematicEdit(input: {
  schematicPath: string;
  edit: KiCadBoundedEdit;
  workspaceRoot?: string;
  snapshotRoot?: string;
  audit?: ProjectTransactionAudit;
}): CommitProjectTransactionResult & { summary?: string } {
  return applyKiCadBoundedEdit({
    path: input.schematicPath,
    docKind: 'schematic',
    edit: input.edit,
    workspaceRoot: input.workspaceRoot,
    snapshotRoot: input.snapshotRoot,
    audit: input.audit,
  });
}

/** E418：PCB 有界编辑（仅 .kicad_pcb）。 */
export function previewKiCadPcbEdit(input: {
  pcbPath: string;
  edit: KiCadBoundedEdit;
  workspaceRoot?: string;
  snapshotRoot?: string;
  audit?: ProjectTransactionAudit;
}): PreviewKiCadEditResult {
  return previewKiCadBoundedEdit({
    path: input.pcbPath,
    docKind: 'pcb',
    edit: input.edit,
    workspaceRoot: input.workspaceRoot,
    snapshotRoot: input.snapshotRoot,
    audit: input.audit,
  });
}

export function applyKiCadPcbEdit(input: {
  pcbPath: string;
  edit: KiCadBoundedEdit;
  workspaceRoot?: string;
  snapshotRoot?: string;
  audit?: ProjectTransactionAudit;
}): CommitProjectTransactionResult & { summary?: string } {
  return applyKiCadBoundedEdit({
    path: input.pcbPath,
    docKind: 'pcb',
    edit: input.edit,
    workspaceRoot: input.workspaceRoot,
    snapshotRoot: input.snapshotRoot,
    audit: input.audit,
  });
}

function previewKiCadBoundedEdit(input: {
  path: string;
  docKind: KiCadDocKind;
  edit: KiCadBoundedEdit;
  workspaceRoot?: string;
  snapshotRoot?: string;
  audit?: ProjectTransactionAudit;
}): PreviewKiCadEditResult {
  const preparedContent = buildEditedContent(input.path, input.docKind, input.edit, input.workspaceRoot);
  if (!preparedContent.ok) return preparedContent;
  const prepared = prepareProjectTransaction(
    [{ path: preparedContent.absolutePath, content: preparedContent.content }],
    {
      workspaceRoot: input.workspaceRoot,
      snapshotRoot: input.snapshotRoot,
      audit: input.audit,
    },
  );
  if (!prepared.ok) return { ok: false, error: prepared.error };
  return {
    ok: true,
    transaction: prepared.transaction,
    summary: preparedContent.summary,
  };
}

function applyKiCadBoundedEdit(input: {
  path: string;
  docKind: KiCadDocKind;
  edit: KiCadBoundedEdit;
  workspaceRoot?: string;
  snapshotRoot?: string;
  audit?: ProjectTransactionAudit;
}): CommitProjectTransactionResult & { summary?: string } {
  const preview = previewKiCadBoundedEdit(input);
  if (!preview.ok) {
    return {
      ok: false,
      status: 'stage_failed',
      transactionId: '',
      snapshotDir: '',
      committedPaths: [],
      pendingPaths: [],
      error: preview.error,
    };
  }
  const committed = commitProjectTransaction(preview.transaction);
  return { ...committed, summary: preview.summary };
}

function buildEditedContent(
  filePath: string,
  docKind: KiCadDocKind,
  edit: KiCadBoundedEdit,
  workspaceRoot = process.cwd(),
): { ok: true; absolutePath: string; content: string; summary: string } | { ok: false; error: string } {
  const check = isPathAllowed(filePath, workspaceRoot);
  if (!check.allowed || !check.resolved) {
    return { ok: false, error: check.reason ?? '文件不在沙箱内' };
  }
  const lower = check.resolved.toLowerCase();
  if (docKind === 'schematic' && !lower.endsWith('.kicad_sch')) {
    return { ok: false, error: 'KiCad 原理图编辑仅允许 .kicad_sch' };
  }
  if (docKind === 'pcb' && !lower.endsWith('.kicad_pcb')) {
    return { ok: false, error: 'KiCad PCB 编辑仅允许 .kicad_pcb' };
  }
  let original: string;
  try {
    original = readFileSync(check.resolved, 'utf8');
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  if (edit.kind === 'append_annotation') {
    const text = edit.text.trim();
    if (!text) return { ok: false, error: '注解文本不能为空' };
    if (text.length > 500) return { ok: false, error: '注解文本过长（上限 500 字符）' };
    if (/[()\r\n]/.test(text)) return { ok: false, error: '注解文本不能包含括号或换行' };
    const annotation =
      docKind === 'pcb'
        ? `  (gr_text "${escapeSExpr(text)}" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1.27 1.27))) (uuid "e418-annotation"))\n`
        : `  (text "${escapeSExpr(text)}" (at 0 0 0) (effects (font (size 1.27 1.27))) (uuid "e413-annotation"))\n`;
    const content = insertBeforeClosing(original, annotation);
    if (!content.ok) return content;
    return {
      ok: true,
      absolutePath: check.resolved,
      content: content.text,
      summary: `向 ${basename(check.resolved)} 追加${docKind === 'pcb' ? '丝印' : ''}注解：${text}`,
    };
  }

  const from = edit.from;
  const to = edit.to;
  if (!from) return { ok: false, error: 'replace_text.from 不能为空' };
  if (from.length > 200 || to.length > 200) return { ok: false, error: '替换文本过长（上限 200 字符）' };
  if (/[\r\n]/.test(from) || /[\r\n]/.test(to)) return { ok: false, error: '替换文本不能包含换行' };
  const occurrences = original.split(from).length - 1;
  if (occurrences === 0) return { ok: false, error: '未找到要替换的原文' };
  if (occurrences > 1) return { ok: false, error: '原文出现多次，拒绝歧义替换' };
  return {
    ok: true,
    absolutePath: check.resolved,
    content: original.replace(from, to),
    summary: `在 ${relative(workspaceRoot, check.resolved)} 替换 1 处文本`,
  };
}

function insertBeforeClosing(source: string, chunk: string): { ok: true; text: string } | { ok: false; error: string } {
  const trimmed = source.replace(/\s*$/, '');
  if (!trimmed.endsWith(')')) {
    return { ok: false, error: 'S 表达式结构异常，无法安全追加注解' };
  }
  return { ok: true, text: `${trimmed.slice(0, -1)}${chunk})\n` };
}

function escapeSExpr(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
