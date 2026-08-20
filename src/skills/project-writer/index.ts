/**
 * Skill: project-writer（工程落地执行）
 * 在沙箱白名单内写入/覆盖工程文件；覆盖前自动备份，支持回滚。
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';
import { isPathAllowed, logSandboxAudit } from '../../security/sandbox.js';
import { appendOperation } from '../../security/operation-log.js';

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
      try {
        if (backupPath) {
          mkdirSync(dirname(backupPath), { recursive: true });
          copyFileSync(filePath, backupPath);
        }
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, content, 'utf-8');
        let verified = false;
        try {
          verified = readFileSync(filePath, 'utf-8') === content;
        } catch {
          // 回读失败时保持 verified=false，避免误报已写入
        }
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
        return {
          result: {
            error: err instanceof Error ? err.message : String(err),
            answer: `写入失败：${err instanceof Error ? err.message : String(err)}`,
          },
          confidence: 0.2,
        };
      }
    },
  };
}
