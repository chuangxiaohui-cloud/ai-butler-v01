/**
 * Skill: document-qa（Week 3）
 * parseDocument → 结构化摘要 / 结构提取 / 基于全文的问答。
 * 无文本 LLM 时退化为确定性摘要与结构提取，不假装回答。
 */

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { RawFileLike, SkillDeps } from '../deps.js';

interface Heading {
  level: number;
  text: string;
}

function findDocument(input: SkillInput): RawFileLike | undefined {
  return input.rawFiles.find(
    (f) =>
      f.type === 'application/pdf' ||
      f.type.startsWith('text/') ||
      f.type.includes('wordprocessingml') ||
      /\.(md|txt|pdf|docx?)$/i.test(f.name),
  );
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function parseDocumentText(text: string): {
  title: string;
  headings: Heading[];
  paragraphs: string[];
  excerpt: string;
} {
  const headings: Heading[] = [];
  const headingRe = /^(#{1,6})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(text)) !== null) {
    headings.push({ level: m[1].length, text: m[2].trim() });
  }
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const excerpt = paragraphs.find((p) => p.length >= 20) ?? paragraphs[0] ?? '';
  return { title: headings[0]?.text ?? '', headings, paragraphs, excerpt };
}

function modeFrom(query: string): 'qa' | 'summarize' | 'extract_structure' {
  if (/总结|摘要|提炼|要点|概述|概括/.test(query)) return 'summarize';
  if (/结构|大纲|目录|框架|拆解|分节|章节/.test(query)) return 'extract_structure';
  return 'qa';
}

export function createDocumentQaSkill(): ExecutableSkill {
  return {
    name: 'document-qa',
    version: '0.1.0',
    triggers: ['文档', '总结', '摘要', '结构', '大纲', '要点', '解析', 'document'],
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      const file = findDocument(input);
      if (!file) {
        return {
          result: { error: 'need_document', text: '' },
          confidence: 0.2,
          followUpAction: '请上传 PDF/Markdown/Word/TXT 文档后重试。',
        };
      }
      if (!deps.parseDocument) {
        return {
          result: { error: 'document_parser_not_wired', text: '' },
          confidence: 0.2,
          followUpAction: '文档解析管道未接入，暂时无法读取文件内容。',
        };
      }

      try {
        const text = await deps.parseDocument(file);
        const { title, headings, paragraphs, excerpt } = parseDocumentText(text);
        const mode =
          typeof input.params?.mode === 'string' &&
          ['qa', 'summarize', 'extract_structure'].includes(input.params.mode)
            ? (input.params.mode as 'qa' | 'summarize' | 'extract_structure')
            : modeFrom(input.query);

        if (mode === 'extract_structure') {
          return {
            result: {
              title: title || stripExtension(file.name),
              answer: headings
                .map((h) => `${'#'.repeat(h.level)} ${h.text}`)
                .join('\n'),
              headings,
              paragraphCount: paragraphs.length,
              characterCount: text.length,
              text,
            },
            confidence: 0.85,
            followUpAction: '需要按章节生成大纲或继续展开某一节吗？',
          };
        }

        if (mode === 'summarize') {
          if (deps.complete) {
            const summary = await deps.complete.complete(
              [
                {
                  role: 'user',
                  content: `请用 3-5 条要点总结以下文档，保留原文中的关键术语。\n\n文档：\n${text.slice(0, 12000)}`,
                },
              ],
              { temperature: 0, maxTokens: 300 },
            );
            return {
            result: {
              title: title || stripExtension(file.name),
              answer: summary,
              summary,
              headings,
              text,
              },
              confidence: 0.85,
              followUpAction: '需要把摘要导出成文档或继续追问细节吗？',
            };
          }
          return {
            result: {
              title: title || stripExtension(file.name),
              answer: excerpt,
              summary: {
                excerpt,
                sectionCount: headings.length,
              },
              headings,
              text,
            },
            confidence: 0.6,
            followUpAction: '文本摘要器未接入，当前给出首段摘要；需要完整 LLM 摘要请稍后重试。',
          };
        }

        if (deps.complete) {
          const answer = await deps.complete.complete(
            [
              {
                role: 'user',
                content: `基于文档回答用户问题。若文档中没有答案，明确说明。\n\n用户问题：${input.query}\n\n文档：\n${text.slice(0, 12000)}`,
              },
            ],
            { temperature: 0, maxTokens: 300 },
          );
          return {
            result: { answer, text },
            confidence: 0.85,
            followUpAction: '需要我继续追问文档里的其他细节吗？',
          };
        }

        return {
          result: {
            answer: null,
            text,
            note: '文档已解析；LLM 问答合成未接入，暂无法直接回答。',
          },
          confidence: 0.5,
          followUpAction: '可以先把文档内容贴出来，我帮你整理。',
        };
      } catch (err) {
        return {
          result: {
            error: err instanceof Error ? err.message : String(err),
            text: '',
          },
          confidence: 0.2,
          followUpAction: '文档解析失败，可以换个格式重新上传。',
        };
      }
    },
  };
}
