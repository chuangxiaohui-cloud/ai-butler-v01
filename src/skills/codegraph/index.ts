/**
 * Skill: codegraph（E353，架构师/工程开发：代码影响与调用关系解读）
 * 只读、本地、¥0：把「改 X 影响什么 / 谁调用 X / X 调用了什么 / 项目结构」类问题
 * 转发到本机 codegraph CLI（100% 本地 SQLite 索引，须先对目标目录执行过 codegraph init）。
 * 结果来自本地索引证据（文件行号），不做语义编造；索引缺失时给可执行引导。
 */

import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import { isPathAllowed } from '../../security/sandbox.js';

export interface CodegraphRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** CLI 运行器（测试注入；缺省 spawn 本机 codegraph 命令） */
export type CodegraphRunner = (args: string[], cwd: string) => Promise<CodegraphRunResult>;

export interface CodegraphSkillOptions {
  /** 默认分析目录（无显式路径时用）；缺省 process.cwd()（工作区根） */
  cwd?: string;
  /** 单条命令超时；缺省 30s */
  timeoutMs?: number;
  runner?: CodegraphRunner;
}

export const CODEGRAPH_TRIGGERS = [
  '代码影响',
  '影响分析',
  '调用关系',
  '调用链',
  '谁调用',
  '谁在调用',
  '谁调用了',
  'codegraph',
];

const ANSI_RE = /\u001b\[[0-9;]*m/g;
/** Windows 上 codegraph 是 npm .cmd/.ps1 shim，spawn 需走 shell；非 Win 直接用命令 */
const IS_WIN = process.platform === 'win32';

function clean(text: string): string {
  return text.replace(ANSI_RE, '').trim();
}

function quoteArg(arg: string): string {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/** 默认 runner：win 走 shell 命令串（.cmd shim），posix 直接 exec */
function defaultRunner(timeoutMs: number): CodegraphRunner {
  return (args, cwd) =>
    new Promise((resolveRun, reject) => {
      const child = IS_WIN
        ? spawn(`codegraph ${args.map(quoteArg).join(' ')}`, { cwd, shell: true, windowsHide: true })
        : spawn('codegraph', args, { cwd });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill(), timeoutMs);
      child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
      child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolveRun({ code: code ?? -1, stdout, stderr });
      });
    });
}

export type CodegraphMode =
  | 'explore' // 项目/符号速读（范围广）
  | 'impact' // 改 X 影响什么
  | 'callers' // 谁调用 X
  | 'callees' // X 调用了什么
  | 'node'; // 单符号详情/源码定位

/** 显式目录 token：Windows 绝对路径 或 沙箱相对路径 或 quoted 路径 */
function extractDir(query: string): string | null {
  const abs = query.match(/([A-Za-z]:[\\/][^\s，。；:：""']+)/);
  if (abs) return abs[1].replace(/[，。；、]+$/u, '');
  const rel = query.match(/(?:^|\s)((?:projects|sandbox|outputs|data)[\\/][^\s，。；:：""']+)/);
  if (rel) return rel[1].trim();
  const quoted = query.match(/["'`]([^"'`]*[\\/][^"'`]+)["'`]/);
  return quoted ? quoted[1].trim() : null;
}

function extractSymbol(query: string): string | null {
  const quoted = query.match(/["'`]([\w./\\-]+\.?[\w-]*)["'`]/);
  if (quoted) return quoted[1];
  const fileLike = query.match(
    /[A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx|c|cpp|cc|cxx|h|hpp|py|rs|go|java|kt|v|sv|zig)\b/i,
  );
  if (fileLike) return fileLike[0];
  const afterLabel = query.match(
    /(?:函数|方法|变量|符号|接口|类|模块|文件)\s*[“"]?([A-Za-z_][\w.]{1,60})/u,
  );
  if (afterLabel) return afterLabel[1];
  const ident = query.match(/\b([A-Za-z_][A-Za-z0-9_]{1,40})\b/);
  return ident ? ident[1] : null;
}

export function detectMode(query: string, symbol: string | null): CodegraphMode {
  const q = query.replace(/\s+/gu, '');
  if (/(谁|哪些|哪个).*调用|被谁.*调用|调用方|callers/i.test(q)) return 'callers';
  if (/(调用.*(了|哪些|什么|链|关系)|callees|里面.*调|内部.*调)/i.test(q)) return 'callees';
  if (/(影响|波及|连累|impact|affected)/i.test(q)) return 'impact';
  if (/(详情|定义|位置|源码|行号|\bnode\b)/i.test(q)) return 'node';
  if (symbol) return 'impact';
  return 'explore';
}

const MODE_LABEL: Record<CodegraphMode, string> = {
  explore: '符号/结构速读',
  impact: '改动影响分析',
  callers: '调用方（谁调用）',
  callees: '被调用关系',
  node: '符号详情',
};

/** 判定路径是否允许：白名单沙箱根内，或等于工作区根 */
function isDirAllowed(dir: string, workspaceRoot: string): boolean {
  try {
    if (realpathSync(dir) === realpathSync(workspaceRoot)) return true;
  } catch {
    // 目录不存在交给 status 前检查兜底
  }
  return isPathAllowed(dir, workspaceRoot).allowed;
}

function truncate(text: string, max = 6000): string {
  return text.length > max ? `${text.slice(0, max)}\n…（输出过长已截断）` : text;
}

export function createCodegraphSkill(opts: CodegraphSkillOptions = {}): ExecutableSkill {
  const workspaceRoot = opts.cwd ?? process.cwd();
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const run: CodegraphRunner = opts.runner ?? defaultRunner(timeoutMs);

  const skill: ExecutableSkill = {
    name: 'codegraph',
    version: '0.1.0',
    triggers: CODEGRAPH_TRIGGERS,
    async execute(input: SkillInput, _deps): Promise<SkillOutput> {
      const query = input.query.trim();
      const dirToken = extractDir(query);
      const targetDir = dirToken
        ? (isAbsolute(dirToken) ? dirToken : resolve(workspaceRoot, dirToken))
        : workspaceRoot;
      if (!existsSync(targetDir)) {
        return {
          result: `目标目录不存在：${targetDir}。请确认路径后再问。`,
          confidence: 0.3,
        };
      }
      if (dirToken && !isDirAllowed(targetDir, workspaceRoot)) {
        return {
          result:
            '只能分析沙箱白名单内的目录（projects/、sandbox/、outputs/，或工作区根）。\n' +
            '如要分析工作区外的嵌入式工程，请把项目放进 projects/ 目录，或在 .env 里用 SANDBOX_ALLOWED_DIRS 追加该目录。',
          confidence: 0.4,
          followUpAction: '把目标工程放到 projects/ 下再告诉我相对路径，或直接问工作区内项目。',
        };
      }

      // 前置：CLI 存在 + 索引已初始化（未 init 给可执行引导，不做后台自动建索引）
      let status: CodegraphRunResult;
      try {
        status = await run(['status'], targetDir);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        if (/ENOENT|not found|不是内部或外部命令/i.test(reason)) {
          return {
            result:
              '本机未检测到 CodeGraph CLI（codegraph）。请先安装：npm i -g @colbymchenry/codegraph，装好后我会用它做本地代码分析。',
            confidence: 0.3,
          };
        }
        return {
          result: `调用 CodeGraph 失败：${reason}。可稍后重试。`,
          confidence: 0.3,
        };
      }
      if (/not initialized|Not initialized/i.test(clean(status.stdout + status.stderr))) {
        return {
          result:
            `目标目录还没有 CodeGraph 索引：${targetDir}\n` +
            `先用 codegraph init 建索引（本地、免费、按 .gitignore 排除，约几秒到几分钟）：\n\n` +
            `  cd ${targetDir}\n  codegraph init\n\n` +
            '建好后直接再问我同样的问题即可。',
          confidence: 0.5,
          followUpAction: `对 ${targetDir} 执行 codegraph init 后回来问。`,
        };
      }

      const symbol = extractSymbol(query);
      const mode = detectMode(query, symbol);
      let args: string[];
      if (mode === 'explore') {
        const phrase = query
          .replace(dirToken ?? '', '')
          .replace(/(解读|速读|分析|梳理|看看|一下|项目|代码|仓库|源码|的|结构|组成|模块|依赖|关系|用codegraph|codegraph)/gu, '')
          .trim();
        args = ['explore', phrase || symbol || 'main'];
      } else {
        const target = (symbol ?? '').trim();
        if (!target) {
          return {
            result: '要分析具体影响/调用，请带上符号或文件名，例如：\n「改了 helper 会影响哪些模块」「谁调用了 helper」「helper 的调用链」。',
            confidence: 0.4,
          };
        }
        const safeTarget = /^[A-Za-z0-9_.\-/\\]+$/.test(target) ? target : target.replace(/[^A-Za-z0-9_.\-/\\]/g, '');
        args = [mode, safeTarget];
      }

      let res: CodegraphRunResult;
      try {
        res = await run(args, targetDir);
      } catch (err) {
        return {
          result: `CodeGraph 执行失败：${err instanceof Error ? err.message : String(err)}`,
          confidence: 0.3,
        };
      }
      const text = clean(res.stdout || res.stderr);
      if (res.code !== 0 || !text) {
        return {
          result: text
            ? `CodeGraph 未能完成分析（退出码 ${res.code}）：\n${truncate(text, 800)}`
            : `CodeGraph 未能完成分析（退出码 ${res.code}，无输出）。`,
          confidence: 0.3,
        };
      }
      return {
        result:
          `已用 CodeGraph 本地索引分析「${mode === 'explore' ? '项目/符号' : symbol}」（${MODE_LABEL[mode]}）：\n\n` +
          `${truncate(text)}\n\n` +
          '（以上为本地索引证据：文件行号与调用关系均来自代码本体，非猜测；索引随文件改动自动同步。）',
        confidence: 0.82,
        followUpAction: '需要细化哪条调用链、或针对某个函数做影响分析，直接点名即可。',
      };
    },
  };
  return skill;
}
