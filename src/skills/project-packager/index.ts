/**
 * Skill: project-packager（项目打包）
 * 复制项目目录到临时目录（排除 .git/node_modules/build/dist），再压缩为 zip 返回路径。
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';

const EXCLUDE_RE = /(^|\/|\\)(node_modules|\.git|build|dist|target)(\/|\\)?$/;

function extractPath(query: string): string | null {
  const m = query.match(/(?:打包|压缩)\s*(?:项目|目录|工程)?\s*[：: ]?\s*([^\s，。；,!！]+)/);
  const candidate = m?.[1]?.trim();
  if (!candidate) return null;
  if (/^(发给我|一下|发送|给我|项目|这个项目|工程|目录)$/.test(candidate)) return null;
  return candidate;
}

function isExcluded(source: string): boolean {
  return EXCLUDE_RE.test(source);
}

function createZip(srcDir: string, zipPath: string): boolean {
  if (process.platform !== 'win32') return false;
  const r = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${zipPath}' -Force`,
    ],
    { encoding: 'utf-8' },
  );
  return r.status === 0;
}

export function createProjectPackagerSkill(): ExecutableSkill {
  return {
    name: 'project-packager',
    version: '0.1.0',
    triggers: ['打包', '压缩项目', '项目压缩'],
    async execute(input: SkillInput, _deps: SkillDeps): Promise<SkillOutput> {
      const raw = extractPath(input.query);
      if (!raw) {
        return {
          result: '请告诉我要打包哪个项目目录，例如“打包 M:/projects/demo”。我会排除 .git、node_modules、build 后生成压缩包。',
          confidence: 0.5,
        };
      }
      const srcDir = resolve(raw);
      if (!existsSync(srcDir)) {
        return {
          result: `未找到目录：${srcDir}。请确认路径后重试。`,
          confidence: 0.3,
        };
      }
      const workDir = mkdtempSync(join(tmpdir(), 'packager-'));
      const copiedDir = join(workDir, 'project');
      const packsDir = join(process.cwd(), 'data', 'packs');
      mkdirSync(packsDir, { recursive: true });
      const zipPath = join(packsDir, `project-${Date.now()}.zip`);
      try {
        cpSync(srcDir, copiedDir, {
          recursive: true,
          filter: (source) => !isExcluded(source),
        });
        if (!createZip(copiedDir, zipPath)) {
          return {
            result: '当前环境不支持自动压缩（需 Windows PowerShell Compress-Archive）。',
            confidence: 0.3,
          };
        }
        return {
          result: `已打包：${zipPath}（已排除 .git、node_modules、build/dist）。`,
          confidence: 0.8,
        };
      } catch (err) {
        return {
          result: `打包失败：${err instanceof Error ? err.message : String(err)}`,
          confidence: 0.2,
        };
      } finally {
        rmSync(workDir, { recursive: true, force: true });
      }
    },
  };
}
