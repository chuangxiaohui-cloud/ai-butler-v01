/**
 * Skill: project-packager（项目打包）
 * 复制项目目录到临时目录（排除 .git/node_modules/build/dist），再压缩为 zip 返回路径。
 *
 * H1+H2（架构审计 2026-08-23）：弃用 PowerShell Compress-Archive 字符串拼装（命令注入面），
 * 改用 jszip 纯 JS 压缩；执行前过 §10.1 沙箱白名单，越界拒绝并写审计日志；
 * 排除集扩到 .env 与 data/，防凭据聚合打包。
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';
import { isPathAllowed, logSandboxAudit } from '../../security/sandbox.js';

// 目录类排除：构建产物、VCS 元数据、运行时数据（含凭据聚合面）
const EXCLUDE_DIR_RE = /(^|\/|\\)(node_modules|\.git|build|dist|target|data)(\/|\\)?$/;
// 文件类排除：.env / .env.local 等环境变量文件
const EXCLUDE_FILE_RE = /(^|\/|\\)\.env(\.[A-Za-z0-9_-]+)?$/;

function extractPath(query: string): string | null {
  const m = query.match(/(?:打包|压缩)\s*(?:项目|目录|工程)?\s*[：: ]?\s*([^\s，。；,!！]+)/);
  const candidate = m?.[1]?.trim();
  if (!candidate) return null;
  if (/^(发给我|一下|发送|给我|项目|这个项目|工程|目录)$/.test(candidate)) return null;
  return candidate;
}

function isExcluded(source: string): boolean {
  return EXCLUDE_DIR_RE.test(source) || EXCLUDE_FILE_RE.test(source);
}

async function createZip(srcDir: string, zipPath: string): Promise<boolean> {
  try {
    const zip = new JSZip();
    const walk = (dir: string, prefix: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const rel = prefix ? `${prefix}/${name}` : name;
        if (statSync(full).isDirectory()) walk(full, rel);
        else zip.file(rel, readFileSync(full));
      }
    };
    walk(srcDir, '');
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    writeFileSync(zipPath, buffer);
    return true;
  } catch {
    return false;
  }
}

export function createProjectPackagerSkill(opts?: {
  cwd?: string;
  zipDir?: string;
}): ExecutableSkill {
  return {
    name: 'project-packager',
    version: '0.1.0',
    triggers: ['打包', '压缩项目', '项目压缩'],
    async execute(input: SkillInput, _deps: SkillDeps): Promise<SkillOutput> {
      const raw = extractPath(input.query);
      if (!raw) {
        return {
          result: '请告诉我要打包哪个项目目录，例如“打包 M:/projects/demo”。我会排除 .git、node_modules、build/dist、data、.env 后生成压缩包。',
          confidence: 0.5,
        };
      }
      const cwd = opts?.cwd ?? process.cwd();
      const check = isPathAllowed(resolve(raw), cwd);
      if (!check.allowed || !check.resolved) {
        logSandboxAudit({
          requestedPath: raw,
          allowed: false,
          reason: check.reason,
          ts: new Date().toISOString(),
        });
        return {
          result: `路径不在沙箱白名单内，未打包：${raw}。仅允许 projects/、sandbox/、outputs/ 或已授权目录（§10.1）。`,
          confidence: 0.2,
        };
      }
      const srcDir = check.resolved;
      if (!existsSync(srcDir)) {
        return {
          result: `未找到目录：${srcDir}。请确认路径后重试。`,
          confidence: 0.3,
        };
      }
      const workDir = mkdtempSync(join(tmpdir(), 'packager-'));
      const copiedDir = join(workDir, 'project');
      const packsDir = opts?.zipDir ?? join(cwd, 'data', 'packs');
      mkdirSync(packsDir, { recursive: true });
      const zipPath = join(packsDir, `project-${Date.now()}.zip`);
      try {
        cpSync(srcDir, copiedDir, {
          recursive: true,
          filter: (source) => !isExcluded(source),
        });
        if (!(await createZip(copiedDir, zipPath))) {
          return {
            result: '压缩失败：目录读取或 zip 生成异常。',
            confidence: 0.3,
          };
        }
        return {
          result: `已打包：${zipPath}（已排除 .git、node_modules、build/dist、data、.env）。`,
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
