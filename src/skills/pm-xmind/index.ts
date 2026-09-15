/**
 * Skill: pm-xmind（E340，PM 角色 Xmind 思维导图）
 * 生成：把文本大纲（WBS 编号 / 缩进 / - 列表）落盘为 .xmind（zip 组包，纯本地 jszip）；
 * 读取：把已有 .xmind（沙箱路径或附件）读回文本大纲。全程本地确定性、零外部模型。
 * 输出目录默认 outputs/pm-xmind/（沙箱白名单 outputs 根内，UI 产物区可见）。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { isAbsolute, join } from 'path';

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';
import { guardSkillOutputPath, isPathAllowed } from '../../security/sandbox.js';
import {
  buildXmindBuffer,
  parseOutlineToTree,
  parseXmindBuffer,
  treeToOutlineText,
} from './format.js';

export interface PmXmindSkillOptions {
  /** 输出目录；缺省 outputs/pm-xmind（显式注入视为受信，测试用） */
  outDir?: string;
}

const TRIGGERS = ['思维导图', 'xmind', '脑图', 'mind map', 'WBS', '任务拆解'];

/** 读取意图提示词（避免“生成 Xmind”被误判为读回） */
function isReadIntent(query: string, hasAttached: boolean): boolean {
  if (hasAttached) return true;
  const pathMatch = query.match(/[^\s，。；:："']+\.xmind/i);
  if (!pathMatch) return false;
  return /读取|读一下|读回|打开|解析|提取|看看|查看|大纲|内容|转成文字/u.test(query);
}

function findPathToken(query: string): string | null {
  const m = query.match(/[^\s，。；:："']+\.xmind/i);
  return m ? m[0].replace(/[，。；:：]+$/u, '') : null;
}

function truncate(text: string, max = 900): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function createPmXmindSkill(opts: PmXmindSkillOptions = {}): ExecutableSkill {
  const skill: ExecutableSkill = {
    name: 'pm-xmind',
    version: '0.1.0',
    triggers: TRIGGERS,
    async execute(input: SkillInput, _deps: SkillDeps): Promise<SkillOutput> {
      const query = input.query.trim();
      const attached = input.rawFiles.find((f) => /\.xmind$/i.test(f.name));

      // ── 读取已有 .xmind（附件优先，其次沙箱路径）──
      if (isReadIntent(query, Boolean(attached))) {
        let buf: Buffer | null = null;
        let sourceName = '';
        if (attached) {
          try {
            buf = Buffer.from(await attached.arrayBuffer());
            sourceName = attached.name;
          } catch {
            return {
              result: '读取附件失败：无法读取该 .xmind 文件内容。',
              confidence: 0.2,
            };
          }
        } else {
          const pathToken = findPathToken(query);
          if (pathToken) {
            const resolved = isAbsolute(pathToken)
              ? pathToken
              : join(process.cwd(), pathToken);
            const gate = isPathAllowed(resolved);
            if (!gate.allowed) {
              return {
                result: `只能读取沙箱目录内的文件（projects/、sandbox/、outputs/）：${pathToken}`,
                confidence: 0.3,
                followUpAction: '请把 .xmind 文件拖到对话里，或放进 projects/outputs 目录后告诉我路径。',
              };
            }
            try {
              buf = readFileSync(resolved);
              sourceName = pathToken;
            } catch {
              return {
                result: `无法读取文件：${pathToken}。请确认路径存在，或直接上传 .xmind 附件。`,
                confidence: 0.3,
              };
            }
          }
        }
        if (!buf) {
          return {
            result: '请上传 .xmind 附件，或告诉我沙箱内的 .xmind 路径（例如 outputs/pm-xmind/xxx.xmind）。',
            confidence: 0.4,
          };
        }
        const tree = await parseXmindBuffer(buf);
        if (!tree) {
          return {
            result: '这个文件不是可解析的 .xmind（缺少 content.json 或结构损坏）。',
            confidence: 0.3,
          };
        }
        const outline = treeToOutlineText(tree);
        return {
          result: {
            answer: `已读取 Xmind（${sourceName}）大纲：\n\n${outline}`,
            path: sourceName,
            outline,
          },
          confidence: 0.85,
          followUpAction: '要基于这份大纲生成/调整内容，或把大纲转成文档，随时说。',
        };
      }

      // ── 生成 .xmind ──
      const tree = parseOutlineToTree(query);
      if (!tree || tree.children.length === 0) {
        return {
          result:
            '要生成 Xmind 思维导图，需要您先给内容大纲。支持三种写法（可混用）：\n' +
            '1. WBS 编号：中心主题换行后写 1. / 1.1. / 1.2.\n' +
            '2. 缩进：子层级缩进两个空格\n' +
            '3. 列表：- 一级 / - 二级（缩进区分层级）',
          confidence: 0.5,
          followUpAction: '把要做成思维导图的文本按上面格式发给我。',
        };
      }

      const outDir = opts?.outDir ?? join(process.cwd(), 'outputs', 'pm-xmind');
      const gate = guardSkillOutputPath(outDir, { explicit: Boolean(opts?.outDir) });
      if (!gate.allowed) {
        return {
          result: `输出目录不在沙箱白名单内，未生成 Xmind：${outDir}`,
          confidence: 0.2,
        };
      }
      try {
        mkdirSync(outDir, { recursive: true });
        const now = new Date();
        const stamp = `${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
        const filePath = join(outDir, `pm-xmind-${stamp}.xmind`);
        const buf = await buildXmindBuffer(tree);
        writeFileSync(filePath, buf);
        const outline = treeToOutlineText(tree);
        return {
          result: {
            answer: `已生成 Xmind 思维导图：${filePath}\n\n大纲预览：\n${truncate(outline)}`,
            path: filePath,
            outline,
          },
          confidence: 0.85,
          followUpAction: '可用 Xmind 打开该文件编辑；要调整结构、改主题或读回大纲，随时说。',
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          result: `生成 Xmind 文件失败（${reason}），未写入任何文件。`,
          confidence: 0.3,
        };
      }
    },
  };
  return skill;
}