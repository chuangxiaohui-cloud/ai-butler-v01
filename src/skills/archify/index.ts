/**
 * Skill: archify（E352，系统架构图 / 流程图 / 时序图 / 数据流图 / 生命周期图）
 * 预置 Skill（lens system_architect）：用户描述系统/流程/时序后，
 * 主模型按选定图型的 vendor schema 产出 typed JSON IR → 本地 archify.mjs
 * validate（失败给诊断，≤2 轮按 supportedFixes 修复）→ deliver 渲染自包含交互 HTML，
 * 落盘 outputs/archify/ 并回复链接与校验摘要。属 content_generation（写本地产物前经 confirm 闸）。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';
import { guardSkillOutputPath } from '../../security/sandbox.js';
import type { LLMClient } from '../../search/llm.js';
import {
  archifyDeliver,
  archifyValidate,
  countDiagnostics,
  defaultArchifyRunner,
  defaultVendorDir,
  summarizeDiagnostics,
  type ArchifyQuality,
  type ArchifyRunner,
  type ArchifyType,
} from './render.js';
import {
  ARCHIFY_TYPE_LABEL,
  buildGenerationPrompt,
  buildRepairPrompt,
  buildRescuePrompt,
  buildSemanticRepairPrompt,
  parseModelJson,
} from './prompt.js';
import { checkArchitectureSemantics } from './semantics.js';
import { rescueArchitectureLayout } from './layout-rescue.js';

export const ARCHIFY_TRIGGERS = [
  '系统架构图',
  '架构图',
  '系统图',
  '组件图',
  '架构对比',
  '流程图',
  '时序图',
  '序列图',
  '数据流图',
  '数据管道图',
  '生命周期图',
  '状态机图',
  'architecture diagram',
  'sequence diagram',
];

/** 显式图型关键词 → Archify type（用户没点时由模型自行判定，默认 architecture） */
export function detectDiagramType(query: string): ArchifyType {
  const q = query.toLowerCase();
  if (/(时序图|序列图|sequence\s*diagram|调用顺序|请求时序)/i.test(q)) return 'sequence';
  if (/(数据流|数据管道|data\s*flow|etl|血缘|管道图)/i.test(q)) return 'dataflow';
  if (/(生命周期|状态机|状态图|lifecycle|life\s*cycle|state\s*machine)/i.test(q)) {
    return 'lifecycle';
  }
  if (/(流程|workflow|flow\s*chart|泳道|ci\s*\/\s*cd|时序)/i.test(q)) return 'workflow';
  return 'architecture';
}

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function stamp(): string {
  const now = new Date();
  return (
    `${two(now.getMonth() + 1)}${two(now.getDate())}-` +
    `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`
  );
}

export interface ArchifySkillOptions {
  /** 产物目录；缺省 outputs/archify（显式注入视为受信，测试用） */
  outDir?: string;
  /** vendor 根目录；缺省本模块 vendor/archify */
  vendorDir?: string;
  /** CLI runner 注入（测试用） */
  runner?: ArchifyRunner;
  /** 生成/修复用文本 LLM（测试注入；生产经 deps.complete） */
  complete?: LLMClient;
  /** 质量档；缺省 showcase */
  quality?: ArchifyQuality;
  /** 修复轮数上限；缺省 2（与 Archify SKILL 契约一致） */
  maxRepairRounds?: number;
}

function summarizeValidation(receipt: {
  checks?: Array<{ name: string; ok: boolean }>;
  validation?: { checksPassed?: number; checkCount?: number; errors?: number; warnings?: number };
}): { passed: number; total: number; errors: number; warnings: number } {
  const okChecks = receipt.checks?.filter((c) => c.ok).length;
  return {
    passed: okChecks ?? receipt.validation?.checksPassed ?? 0,
    total: receipt.checks?.length ?? receipt.validation?.checkCount ?? 0,
    errors: receipt.validation?.errors ?? 0,
    warnings: receipt.validation?.warnings ?? 0,
  };
}

export function createArchifySkill(opts: ArchifySkillOptions = {}): ExecutableSkill {
  const outDir = opts.outDir ?? join(process.cwd(), 'outputs', 'archify');
  const vendorDir = opts.vendorDir ?? defaultVendorDir();
  const run: ArchifyRunner = opts.runner ?? defaultArchifyRunner();
  const quality: ArchifyQuality = opts.quality ?? 'showcase';
  const maxRepairRounds = opts.maxRepairRounds ?? 2;

  const skill: ExecutableSkill = {
    name: 'archify',
    version: '0.1.0',
    triggers: ARCHIFY_TRIGGERS,
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      const query = input.query.trim();
      if (!query) {
        return {
          result: '请描述你想画的内容，例如：把订单系统的组件和调用关系画成系统架构图。',
          confidence: 0.4,
        };
      }
      const vendorBin = join(vendorDir, 'bin', 'archify.mjs');
      if (!existsSync(vendorBin)) {
        return {
          result:
            'Archify 渲染组件缺失（未找到 vendor/bin/archify.mjs）。请先补全 src/skills/archify/vendor/ 后再试。',
          confidence: 0.2,
        };
      }

      const gate = guardSkillOutputPath(outDir, { explicit: Boolean(opts.outDir) });
      if (!gate.allowed) {
        return {
          result: `输出目录不在沙箱白名单内，未生成：${outDir}`,
          confidence: 0.2,
        };
      }

      const complete = deps.complete ?? opts.complete;
      if (!complete) {
        return {
          result:
            '文本模型未接入，暂时无法把描述整理成图。配置 Provider 后可再试（图型判定与生成需一次模型调用）。',
          confidence: 0.2,
          followUpAction: '配置好 Provider 后，把要画的系统/流程描述发给我。',
        };
      }

      const type = detectDiagramType(query);
      const label = ARCHIFY_TYPE_LABEL[type];

      // ── 1) 生成 typed JSON IR（一次主模型调用；输出非法 JSON 时救场一次）──
      let candidateObj: unknown;
      try {
        const genPrompt = buildGenerationPrompt(query, type, { vendorDir, quality });
        const generation = (prompt: string) =>
          complete.complete(
            [{ role: 'user', content: prompt }],
            // E358：≤7 节点单图 JSON 约 1.5-2k token，4000 足够；6000 上限让慢模型长输出拖时间
            { temperature: 0.3, maxTokens: 4000, json: true },
          );
        let raw = await generation(genPrompt);
        try {
          candidateObj = parseModelJson(raw);
        } catch (err) {
          // E356：模型偶发输出非法 JSON——给一次「只重出合法 JSON」救场，避免直接 0.3 收场
          const reason = err instanceof Error ? err.message : String(err);
          const rescuePrompt = buildRescuePrompt(query, type, raw, reason, { vendorDir, quality });
          raw = await generation(rescuePrompt);
          candidateObj = parseModelJson(raw);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          result: `把描述整理成 ${label} 图数据失败（${reason}）。可换个更简短/明确的描述再试。`,
          confidence: 0.3,
        };
      }

      // ── 2) 落盘候选 → validate（失败 ≤2 轮修复）──
      try {
        mkdirSync(outDir, { recursive: true });
      } catch {
        // 已在上方 guard 过；这里建目录失败走 catch 兜底
      }
      const id = `${type}-${stamp()}`;
      const jsonPath = join(outDir, `${id}.json`);
      const htmlPath = join(outDir, `${id}.html`);
      let candidateText: string;
      try {
        candidateText = JSON.stringify(candidateObj, null, 2);
        writeFileSync(jsonPath, candidateText, 'utf8');
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          result: `写入候选文件失败（${reason}），未生成图。`,
          confidence: 0.2,
        };
      }

      let receipt = await archifyValidate(run, type, jsonPath, quality, vendorDir);
      let bestCount = countDiagnostics(receipt.diagnostics);

      // ── 2.1) 布局修复单轮（可重入）：LLM 按诊断整份重出；architecture 候选须先过拓扑语义守卫
      const repairRoundOnce = async (): Promise<boolean> => {
        const diagnostics = receipt.diagnostics ?? [];
        const before = bestCount;
        let repairedText = '';
        try {
          const repairPrompt = buildRepairPrompt(query, type, candidateText, diagnostics, {
            vendorDir,
            quality,
          });
          const raw = await complete.complete(
            [{ role: 'user', content: repairPrompt }],
            { temperature: 0.2, maxTokens: 4000, json: true },
          );
          repairedText = JSON.stringify(parseModelJson(raw), null, 2);
        } catch {
          return false;
        }
        // E361：布局修复不得牺牲拓扑语义（语义错但版式过会被 E360 判死，别白修）
        if (type === 'architecture') {
          try {
            const sem = checkArchitectureSemantics(JSON.parse(repairedText));
            if (!sem.ok) return false;
          } catch {
            return false;
          }
        }
        candidateText = repairedText;
        try {
          writeFileSync(jsonPath, candidateText, 'utf8');
        } catch {
          return false;
        }
        const next = await archifyValidate(run, type, jsonPath, quality, vendorDir);
        const nextCount = countDiagnostics(next.diagnostics);
        receipt = next;
        if (nextCount < before || next.ok) {
          bestCount = next.ok ? 0 : nextCount;
          return true;
        }
        // 不再改善：停止修复，如实报告最后一张收据
        return false;
      };
      for (let round = 0; round < maxRepairRounds && !receipt.ok; round += 1) {
        const improved = await repairRoundOnce();
        if (!improved) break;
      }

      // ── 2.5) E360 语义自检（architecture）：validate 不查「谁连谁的库/回调落库/服务死胡同」等语义，
      //        本地确定性检查不合格先给一次 LLM 语义修复；仍不合格不交付（如实收据），杜绝「版式合格但拓扑画错」的图。
      let semanticIssues: string[] = [];
      if (type === 'architecture') {
        try {
          const semCheck = checkArchitectureSemantics(JSON.parse(candidateText));
          if (!semCheck.ok) {
            const issues = semCheck.issues.map((i) => i.message);
            const priorText = candidateText;
            try {
              const semPrompt = buildSemanticRepairPrompt(query, type, priorText, issues, { vendorDir, quality });
              const raw = await complete.complete(
                [{ role: 'user', content: semPrompt }],
                { temperature: 0.2, maxTokens: 4000, json: true },
              );
              const fixedText = JSON.stringify(parseModelJson(raw), null, 2);
              const fixedCheck = checkArchitectureSemantics(JSON.parse(fixedText));
              if (fixedCheck.ok) {
                candidateText = fixedText;
                writeFileSync(jsonPath, candidateText, 'utf8');
                // E361：语义修复候选必然保留（语义是硬门槛）；版式劣化由后续布局修复轮兜底，不回滚到语义错的版本
                const after = await archifyValidate(run, type, jsonPath, quality, vendorDir);
                const afterCount = countDiagnostics(after.diagnostics);
                receipt = after;
                bestCount = after.ok ? 0 : afterCount;
              } else {
                semanticIssues = fixedCheck.issues.map((i) => i.message);
              }
            } catch {
              semanticIssues = issues;
            }
          }
        } catch {
          // candidateText 解析失败已在上游收口，这里忽略
        }
      }

      // ── 2.6) E361：语义修复后若版式仍不过，继续 LLM 布局修复轮（≤maxRepairRounds，候选须过语义守卫），再不行才本地救援
      if (semanticIssues.length === 0 && !receipt.ok && type === 'architecture') {
        for (let extra = 0; extra < maxRepairRounds && !receipt.ok; extra += 1) {
          const improved = await repairRoundOnce();
          if (!improved) break;
        }
      }

      let activeQuality = quality;
      if (semanticIssues.length === 0 && !receipt.ok && type === 'architecture') {
        const rescue = await rescueArchitectureLayout({ jsonPath, run, vendorDir });
        if (rescue.ok) {
          candidateText = rescue.candidateText;
          receipt = rescue.receipt;
          activeQuality = 'standard';
        }
      }

      if (semanticIssues.length > 0 || !receipt.ok) {
        const summary = summarizeDiagnostics(receipt.diagnostics ?? []);
        const semPart =
          semanticIssues.length > 0
            ? `内容语义问题（Archify 版式校验不查，本地自检确认）：\n${semanticIssues.map((s) => `- ${s}`).join('\\n')}\n\n`
            : '';
        const reason = receipt.ok
          ? '版式校验已通过，但内容语义未达标'
          : `仍未通过 Archify 校验（剩余 ${countDiagnostics(receipt.diagnostics)} 条诊断）`;
        return {
          result: {
            answer:
              `已把描述整理成 ${label} 并尝试修正：${reason}，未生成 HTML。\n\n${semPart}${summary}\n\n` +
              '建议：简化描述（减少组件/连线数量）后重试；或把内容拆成更小的两张图。',
            path: jsonPath,
          },
          confidence: semanticIssues.length > 0 ? 0.3 : 0.35,
          followUpAction: '简化描述再发一次，或直接告诉我图中哪些组件/连线要调整。',
        };
      }

      // ── 3) deliver 最终渲染 ──
      const del = await archifyDeliver(run, type, jsonPath, htmlPath, activeQuality, vendorDir);
      if (!del.ok) {
        const summary = summarizeDiagnostics(del.diagnostics ?? []);
        return {
          result: {
            answer: `校验通过但渲染 HTML 失败：${del.error ?? summary}\n\n未写入 HTML。`,
            path: jsonPath,
          },
          confidence: 0.4,
        };
      }
      const v = summarizeValidation(del);
      const sha = del.specification?.sha256?.slice(0, 12);
      const rescueNote =
        activeQuality !== quality
          ? '\n\n（说明：LLM 修复轮未收敛，本次由本地版式救援按 standard 档通过后交付。）'
          : '';
      const answer =
        `老板，${label}已生成：${htmlPath}\n\n` +
        `渲染校验：${v.passed}/${v.total} 项通过（${v.errors} 错误 / ${v.warnings} 警告）${sha ? `｜规格 SHA-256 ${sha}` : ''}。${rescueNote}\n\n` +
        `HTML 为自包含交互式图：浏览器打开可缩放/搜索/切换主题；源数据 JSON 已保留在 ${jsonPath}。`;
      return {
        result: {
          answer,
          path: htmlPath,
          jsonPath,
          type,
          diagramType: type,
          quality: activeQuality,
        },
        confidence: activeQuality === 'standard' && quality !== 'standard' ? 0.72 : 0.85,
        followUpAction:
          '要对图做调整（加/删组件、改连线、改配色主题），直接描述即可；也可以把 JSON 改后让我重新渲染。',
      };
    },
  };
  return skill;
}
