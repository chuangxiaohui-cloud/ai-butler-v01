/** E413：KiCad 原理图有界编辑；经项目事务快照后才落盘。 */

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

export type KiCadSchematicEdit =
  | { kind: 'append_annotation'; text: string }
  | { kind: 'replace_text'; from: string; to: string };

export type PreviewKiCadSchematicEditResult =
  | { ok: true; transaction: PreparedProjectTransaction; summary: string }
  | { ok: false; error: string };

export function previewKiCadSchematicEdit(input: {
  schematicPath: string;
  edit: KiCadSchematicEdit;
  workspaceRoot?: string;
  snapshotRoot?: string;
  audit?: ProjectTransactionAudit;
}): PreviewKiCadSchematicEditResult {
  const preparedContent = buildEditedContent(input.schematicPath, input.edit, input.workspaceRoot);
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

export function applyKiCadSchematicEdit(input: {
  schematicPath: string;
  edit: KiCadSchematicEdit;
  workspaceRoot?: string;
  snapshotRoot?: string;
  audit?: ProjectTransactionAudit;
}): CommitProjectTransactionResult & { summary?: string } {
  const preview = previewKiCadSchematicEdit(input);
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
  schematicPath: string,
  edit: KiCadSchematicEdit,
  workspaceRoot = process.cwd(),
): { ok: true; absolutePath: string; content: string; summary: string } | { ok: false; error: string } {
  const check = isPathAllowed(schematicPath, workspaceRoot);
  if (!check.allowed || !check.resolved) {
    return { ok: false, error: check.reason ?? '原理图不在沙箱内' };
  }
  if (!check.resolved.toLowerCase().endsWith('.kicad_sch')) {
    return { ok: false, error: 'KiCad 编辑仅允许 .kicad_sch' };
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
    const annotation = `  (text "${escapeSExpr(text)}" (at 0 0 0) (effects (font (size 1.27 1.27))) (uuid "e413-annotation"))\n`;
    const content = insertBeforeClosing(original, annotation);
    if (!content.ok) return content;
    return {
      ok: true,
      absolutePath: check.resolved,
      content: content.text,
      summary: `向 ${basename(check.resolved)} 追加注解：${text}`,
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
    return { ok: false, error: '原理图 S 表达式结构异常，无法安全追加注解' };
  }
  return { ok: true, text: `${trimmed.slice(0, -1)}${chunk})\n` };
}

function escapeSExpr(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
