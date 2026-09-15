/**
 * Skill: layered-arch（E364，分层架构/框架/模块图——替代 Archify 架构类）
 * 预置 Skill（lens system_architect）：用户要求画系统架构图/框架图/分层图/模块图时，
 * 主模型按「分层图铁律 + 目标样板」输出轻量分层 JSON → 本地校验（结构/相邻层连线）→
 * 内联进固定 viewer.html 渲染成整宽泳道单文件 HTML，落盘 outputs/layered-arch/ 并回复路径。
 * 不走 Archify 图引擎：无自动布局/lint/救援/0.3/0.35 链条。属 content_generation（写本地产物前经 confirm 闸）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';
import type { LLMClient } from '../../search/llm.js';
import { guardSkillOutputPath } from '../../security/sandbox.js';
import {
  buildLayeredFixPrompt,
  buildLayeredGenPrompt,
  buildLayeredRescuePrompt,
  parseModelJson,
} from './prompt.js';
import { buildStandaloneHtml } from './render.js';
import { validateLayeredDiagram } from './validate.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export const LAYERED_TRIGGERS = [
  '系统架构图',
  '架构图',
  '系统图',
  '组件图',
  '模块图',
  '框架图',
  '分层图',
  '架构示意',
  'architecture diagram',
  'component diagram',
];

function defaultAssetDir(): string {
  const candidates = [join(HERE, 'assets'), join(HERE, '..', '..', '..', 'src', 'skills', 'layered-arch', 'assets')];
  for (const candidate of candidates) {
    try {
      if (existsSync(join(candidate, 'viewer.html'))) return candidate;
    } catch {
      // 探测失败尝试下一候选
    }
  }
  return candidates[0];
}

export interface LayeredArchSkillOptions {
  /** 产物目录；缺省 outputs/layered-arch（显式注入视为受信，测试用） */
  outDir?: string;
  /** 渲染器/样板目录；缺省本模块 assets */
  assetDir?: string;
  /** 生成/修复用文本 LLM（测试注入；生产经 deps.complete） */
  complete?: LLMClient;
  /** 修复轮数上限；缺省 1（本地校验只有结构错误，一次修复足够） */
  maxFixRounds?: number;
}

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function stamp(): string {
  const now = new Date();
  return `${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
}

export function createLayeredArchSkill(opts: LayeredArchSkillOptions = {}): ExecutableSkill {
  const outDir = opts.outDir ?? join(process.cwd(), 'outputs', 'layered-arch');
  const assetDir = opts.assetDir ?? defaultAssetDir();
  const maxFixRounds = opts.maxFixRounds ?? 1;

  const skill: ExecutableSkill = {
    name: 'layered-arch',
    version: '0.1.0',
    triggers: LAYERED_TRIGGERS,
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      const query = input.query.trim();
      if (!query) {
        return {
          result: '请描述你想画的分层内容，例如：画一个嵌入式 FreeRTOS 系统框架图。',
          confidence: 0.4,
        };
      }
      const viewerPath = join(assetDir, 'viewer.html');
      const exemplarPath = join(assetDir, 'example-freertos.json');
      if (!existsSync(viewerPath) || !existsSync(exemplarPath)) {
        return {
          result: 'layered-arch 渲染组件缺失（未找到 assets/viewer.html 或 example-freertos.json）。请先补全 src/skills/layered-arch/assets/ 后再试。',
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
            '文本模型未接入，暂时无法把描述整理成图。配置 Provider 后可再试（分层结构整理需一次模型调用）。',
          confidence: 0.2,
          followUpAction: '配置好 Provider 后，把要画的系统/框架描述发给我。',
        };
      }

      const viewerHtml = readFileSync(viewerPath, 'utf8');
      const exemplarText = readFileSync(exemplarPath, 'utf8');

      // ── 1) 生成分层 JSON（一次主模型调用；非法 JSON 救场一次）──
      let candidateObj: unknown;
      try {
        const generate = (prompt: string) =>
          complete.complete([{ role: 'user', content: prompt }], { temperature: 0.3, maxTokens: 4000, json: true });
        let raw = await generate(buildLayeredGenPrompt(query, exemplarText));
        try {
          candidateObj = parseModelJson(raw);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          raw = await generate(buildLayeredRescuePrompt(query, raw, reason));
          candidateObj = parseModelJson(raw);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          result: `把描述整理成分层图数据失败（${reason}）。可换个更简短/明确的描述再试。`,
          confidence: 0.3,
        };
      }

      // ── 2) 本地校验；不合格按 issues 让模型修复（≤maxFixRounds 轮）──
      let candidateText = JSON.stringify(candidateObj, null, 2);
      let validation = validateLayeredDiagram(candidateObj);
      let repaired = false;
      try {
        for (let round = 0; round < maxFixRounds && !validation.ok; round += 1) {
          const raw = await complete.complete(
            [{ role: 'user', content: buildLayeredFixPrompt(query, candidateText, validation.issues, exemplarText) }],
            { temperature: 0.2, maxTokens: 4000, json: true },
          );
          candidateObj = parseModelJson(raw);
          candidateText = JSON.stringify(candidateObj, null, 2);
          validation = validateLayeredDiagram(candidateObj);
          repaired = true;
        }
      } catch {
        // 修复调用失败按当前校验结果如实收据
      }
      if (!validation.ok) {
        return {
          result:
            `已整理成分层图但未通过本地校验（${validation.issues.length} 条）：\n` +
            validation.issues.slice(0, 6).map((issue) => `- ${issue}`).join('\n') +
            '\n可换个更简短/明确的描述再试。',
          confidence: 0.35,
        };
      }

      // ── 3) 落盘 JSON + 内联 HTML ──
      try {
        mkdirSync(outDir, { recursive: true });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return { result: `创建输出目录失败（${reason}），未生成图。`, confidence: 0.2 };
      }
      const id = `layered-${stamp()}`;
      const jsonPath = join(outDir, `${id}.json`);
      const htmlPath = join(outDir, `${id}.html`);
      try {
        writeFileSync(jsonPath, candidateText, 'utf8');
        writeFileSync(htmlPath, buildStandaloneHtml(viewerHtml, candidateObj), 'utf8');
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return { result: `写入产物文件失败（${reason}），未生成图。`, confidence: 0.2 };
      }

      const data = candidateObj as {
        meta?: { title?: string };
        layers?: Array<{ name: string }>;
        rules?: string[];
      };
      const title = data.meta?.title ?? '分层架构图';
      const layerNames = (data.layers ?? []).map((layer) => layer.name).join(' → ');
      const ruleCount = (data.rules ?? []).length;
      return {
        result: {
          answer:
            `已生成分层架构图「${title}」。分层：${layerNames}（底部原则 ${ruleCount} 条）。\n` +
            `产物：${htmlPath}（浏览器/面板可直接查看）\n改图：编辑 ${jsonPath} 后刷新 HTML 即可。`,
          path: htmlPath,
          jsonPath,
        },
        confidence: repaired ? 0.8 : 0.85,
      };
    },
  };
  return skill;
}
