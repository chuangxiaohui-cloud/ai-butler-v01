/**
 * Skill: project-writer（工程落地执行）
 * 在沙箱白名单内写入/覆盖工程文件；覆盖前自动备份，支持回滚。
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import type { ExecutableSkill, SkillArtifact, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';
import { isPathAllowed, logSandboxAudit } from '../../security/sandbox.js';
import { appendOperation } from '../../security/operation-log.js';
import {
  prepareProjectTransaction,
  type PreparedProjectTransaction,
  type ProjectFileChange,
  type ProjectTransactionAudit,
} from '../../security/project-transaction.js';

export type StructuredProjectChangesResult =
  | { matched: false }
  | { matched: true; ok: false; error: string }
  | { matched: true; ok: true; changes: ProjectFileChange[] };

export type ProjectWriterTransactionPreview =
  | { matched: false }
  | { matched: true; ok: false; error: string }
  | {
      matched: true;
      ok: true;
      transaction: PreparedProjectTransaction;
      artifact: SkillArtifact;
      answer: string;
    };

export function parseStructuredProjectChanges(input: Pick<SkillInput, 'query' | 'params'>): StructuredProjectChangesResult {
  const fromParams = input.params?.fileChanges;
  if (fromParams !== undefined) return validateStructuredChanges(fromParams);
  const fenced = input.query.match(/```json\s*([\s\S]*?)```/i);
  if (!fenced?.[1]) return { matched: false };
  try {
    const parsed = JSON.parse(fenced[1]) as unknown;
    if (!parsed || typeof parsed !== 'object' || !('files' in parsed)) return { matched: false };
    return validateStructuredChanges((parsed as { files?: unknown }).files);
  } catch {
    return { matched: true, ok: false, error: '多文件变更 JSON 无法解析' };
  }
}

export function prepareProjectWriterTransactionPreview(
  input: Pick<SkillInput, 'query' | 'params'>,
  opts: { cwd?: string; snapshotRoot?: string; audit?: ProjectTransactionAudit } = {},
): ProjectWriterTransactionPreview {
  const parsed = parseStructuredProjectChanges(input);
  if (!parsed.matched || !parsed.ok) return parsed;
  const cwd = opts.cwd ?? process.cwd();
  const prepared = prepareProjectTransaction(parsed.changes, {
    workspaceRoot: cwd,
    snapshotRoot: opts.snapshotRoot,
    audit: opts.audit,
  });
  if (!prepared.ok) return { matched: true, ok: false, error: prepared.error };
  const changes = prepared.transaction.entries.map((entry) => ({
    path: entry.path,
    action: entry.existed ? 'update' : 'create',
    bytes: Buffer.byteLength(entry.content, 'utf-8'),
    snapshotSha256: entry.originalSha256,
    proposedSha256: entry.proposedSha256,
  }));
  const totalBytes = changes.reduce((sum, change) => sum + change.bytes, 0);
  const artifact: SkillArtifact = {
    kind: 'project-change-confirmation',
    title: `项目多文件变更确认（${changes.length} 个文件）`,
    data: {
      transactionId: prepared.transaction.id,
      snapshotDir: prepared.transaction.snapshotDir,
      fileCount: changes.length,
      totalBytes,
      changes,
      defaultChoice: 'cancel_all',
      requiresConfirmation: true,
    },
  };
  return {
    matched: true,
    ok: true,
    transaction: prepared.transaction,
    artifact,
    answer:
      `⏸ 已完成 ${changes.length} 个文件的整批预检和项目快照，尚未写入目标文件。\n` +
      changes.map((change) => `- ${change.action === 'create' ? '新建' : '修改'}：${change.path}（${change.bytes} 字节）`).join('\n') +
      '\n请到右侧「裁决」页选择“确认变更”或“取消整批”。',
  };
}

function validateStructuredChanges(value: unknown): StructuredProjectChangesResult {
  if (!Array.isArray(value) || value.length < 2) {
    return { matched: true, ok: false, error: '多文件变更清单至少需要 2 个文件' };
  }
  const changes: ProjectFileChange[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return { matched: true, ok: false, error: '多文件变更项必须是对象' };
    }
    const path = (item as { path?: unknown }).path;
    const content = (item as { content?: unknown }).content;
    if (typeof path !== 'string' || !path.trim() || typeof content !== 'string') {
      return { matched: true, ok: false, error: '每个多文件变更项都必须包含非空 path 和字符串 content' };
    }
    changes.push({ path: path.trim(), content });
  }
  return { matched: true, ok: true, changes };
}

function extractPath(query: string): string | null {
  const m = query.match(
    /(?:写入|保存到|写到|文件路径|目标路径|路径)[：: ]?\s*([^\s，。；,!！]+)/,
  );
  return m?.[1]?.trim() ?? null;
}

function extractContent(query: string): string | null {
  const block = query.match(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/);
  if (block?.[1]?.trim()) return block[1].trim();
  const inline = query.match(/内容[：:]\s*([\s\S]+)$/);
  return inline?.[1]?.trim() ?? null;
}

function extractCodeBlock(text: string): string | null {
  const block = text.match(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/);
  return block?.[1]?.trim() ?? null;
}

function extractContentFromMemory(input: SkillInput): string | null {
  for (const record of input.workingMemory ?? []) {
    const code = extractCodeBlock(record.answer);
    if (code) return code;
  }
  return null;
}

export function createProjectWriterSkill(opts?: {
  cwd?: string;
  backupDir?: string;
  replaceFile?: (from: string, to: string) => void;
}): ExecutableSkill {
  return {
    name: 'project-writer',
    version: '0.1.0',
    triggers: ['按你说的', '在我的工程', '写入', '保存到', '落地', '文件路径'],
    async execute(input: SkillInput, _deps: SkillDeps): Promise<SkillOutput> {
      const target = extractPath(input.query);
      if (!target) {
        return {
          result: {
            answer: '好的，我准备把刚才的方案落到你的工程里。请告诉我：1) 工程路径；2) 要写入的文件或模块；3) 是否先备份当前文件。我确认后再动手。',
          },
          confidence: 0.3,
        };
      }
      const inlineContent = extractContent(input.query);
      const content = inlineContent ?? extractContentFromMemory(input);
      const usedFromMemory = !inlineContent && content !== null;
      if (!content) {
        return {
          result: {
            answer: '内容还没收到，上一轮也没有可写入的代码块。请把要写入的内容贴给我，例如“内容：int main(void){return 0;}”。',
          },
          confidence: 0.3,
        };
      }

      const cwd = opts?.cwd ?? process.cwd();
      const check = isPathAllowed(target, cwd);
      if (!check.allowed || !check.resolved) {
        logSandboxAudit({
          requestedPath: target,
          allowed: false,
          reason: check.reason,
          ts: new Date().toISOString(),
        });
        return {
          result: {
            answer: `路径不在沙箱白名单内，未写入：${target}`,
          },
          confidence: 0.2,
        };
      }

      const filePath = resolve(check.resolved);
      const backupDir =
        opts?.backupDir ?? join(cwd, 'data', 'writer-backups');
      const backupPath = existsSync(filePath)
        ? join(backupDir, `${basename(filePath)}-${Date.now()}.bak`)
        : null;
      const tempPath = join(
        dirname(filePath),
        `.${basename(filePath)}.tmp-${process.pid}-${Date.now()}`,
      );
      try {
        if (backupPath) {
          mkdirSync(dirname(backupPath), { recursive: true });
          copyFileSync(filePath, backupPath);
        }
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(tempPath, content, 'utf-8');
        if (readFileSync(tempPath, 'utf-8') !== content) {
          throw new Error('临时文件回读校验不一致');
        }
        (opts?.replaceFile ?? renameSync)(tempPath, filePath);
        const verified = readFileSync(filePath, 'utf-8') === content;
        if (!verified) throw new Error('目标文件回读校验不一致');
        const backupText = backupPath
          ? `原文件已备份：${backupPath}`
          : '目标文件为新建，无原文件可备份';
        const memoryText = usedFromMemory ? '，已使用上一轮生成内容' : '';
        const verifiedText = verified ? '写入校验：内容一致' : '写入校验：内容不一致';
        try {
          appendOperation({
            userId: String(input.params?.userId ?? 'default'),
            conversationId: String(input.params?.conversationId ?? 'default'),
            action: 'write',
            status: 'completed',
            path: filePath,
            backup: backupPath,
            created: !backupPath,
          });
        } catch {
          // 操作日志失败不阻塞写入
        }
        return {
          result: {
            answer:
              `已写入：${filePath}（${backupText}，${verifiedText}${memoryText}，` +
              `文件大小 ${Buffer.byteLength(content, 'utf-8')} 字节）`,
            path: filePath,
            backup: backupPath,
            bytes: Buffer.byteLength(content, 'utf-8'),
            verified,
          },
          confidence: 0.9,
        };
      } catch (err) {
        let rolledBack = false;
        try {
          if (backupPath && existsSync(backupPath)) {
            copyFileSync(backupPath, filePath);
            rolledBack = true;
          } else if (!backupPath) {
            rmSync(filePath, { force: true });
            rolledBack = true;
          }
        } catch {
          rolledBack = false;
        }
        try {
          rmSync(tempPath, { force: true });
        } catch {
          // 临时文件清理失败不覆盖原始写入/回滚结果。
        }
        try {
          appendOperation({
            userId: String(input.params?.userId ?? 'default'),
            conversationId: String(input.params?.conversationId ?? 'default'),
            action: 'write',
            status: rolledBack ? 'rolled_back' : 'failed',
            path: filePath,
            backup: backupPath,
            created: !backupPath,
            error: err instanceof Error ? err.message : String(err),
          });
        } catch {
          // 状态日志失败不覆盖原始写入错误
        }
        const rollbackText = rolledBack ? '，已自动回滚' : '，自动回滚失败';
        return {
          result: {
            error: err instanceof Error ? err.message : String(err),
            answer: `写入失败${rollbackText}：${err instanceof Error ? err.message : String(err)}`,
          },
          confidence: 0.2,
        };
      }
    },
  };
}
