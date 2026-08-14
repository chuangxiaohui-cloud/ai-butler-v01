/**
 * Skill: plan-validation（计划编译校验）
 * 借鉴 DeepSeek Harness 分析中的“计划生成后做结构化校验”思路：
 * 任务必须带验收标准、验证步骤、依赖和文件范围，否则不进入执行。
 */

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';

export interface PlanTask {
  title: string;
  acceptanceCriteria: string[];
  verification: string[];
  dependencies: string[];
  files: string[];
}

export interface PlanValidationFinding {
  severity: 'critical' | 'warning' | 'info';
  taskIndex?: number;
  taskTitle?: string;
  message: string;
}

export interface PlanValidationResult {
  verdict: 'pass' | 'needs_review' | 'invalid';
  taskCount: number;
  findings: PlanValidationFinding[];
}

const MAX_FILES_PER_TASK = 5;

export function validatePlanTasks(tasks: PlanTask[]): PlanValidationResult {
  const findings: PlanValidationFinding[] = [];
  if (tasks.length === 0) {
    return {
      verdict: 'invalid',
      taskCount: 0,
      findings: [
        { severity: 'critical', message: '计划为空：至少需要一个可执行任务。' },
      ],
    };
  }

  const titles = new Set<string>();
  tasks.forEach((task, index) => {
    const where = {
      taskIndex: index,
      taskTitle: task.title,
    };
    if (!task.title?.trim()) {
      findings.push({
        ...where,
        severity: 'critical',
        message: '任务缺少标题。',
      });
    } else {
      const key = task.title.trim().toLowerCase();
      if (titles.has(key)) {
        findings.push({
          ...where,
          severity: 'critical',
          message: `任务标题重复：${task.title}。`,
        });
      }
      titles.add(key);
    }
    if (!Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length === 0) {
      findings.push({
        ...where,
        severity: 'critical',
        message: '任务缺少验收标准（acceptanceCriteria），无法判断“完成”是什么。',
      });
    }
    if (!Array.isArray(task.verification) || task.verification.length === 0) {
      findings.push({
        ...where,
        severity: 'critical',
        message: '任务缺少验证步骤（verification），无法证明已交付。',
      });
    }
    if (!Array.isArray(task.files) || task.files.length === 0) {
      findings.push({
        ...where,
        severity: 'warning',
        message: '任务未声明涉及文件（files），执行时可能越界。',
      });
    } else if (task.files.length > MAX_FILES_PER_TASK) {
      findings.push({
        ...where,
        severity: 'warning',
        message: `任务涉及 ${task.files.length} 个文件，超过建议的 ${MAX_FILES_PER_TASK} 个，建议拆细。`,
      });
    }
    if (index > 0 && (!Array.isArray(task.dependencies) || task.dependencies.length === 0)) {
      findings.push({
        ...where,
        severity: 'info',
        message: '任务未声明依赖（dependencies）；若确无前置依赖可忽略。',
      });
    }
  });

  const hasCritical = findings.some((f) => f.severity === 'critical');
  const hasWarning = findings.some((f) => f.severity === 'warning');
  return {
    verdict: hasCritical ? 'invalid' : hasWarning ? 'needs_review' : 'pass',
    taskCount: tasks.length,
    findings,
  };
}

export function formatPlanValidation(result: PlanValidationResult): string {
  const lines = [
    `计划校验：${result.verdict === 'pass' ? '通过' : result.verdict === 'needs_review' ? '需人工复核' : '不通过'}`,
    `任务数：${result.taskCount}`,
  ];
  if (result.findings.length === 0) {
    lines.push('未发现结构问题。');
  } else {
    lines.push('发现：');
    for (const finding of result.findings) {
      const target = finding.taskTitle ? `[${finding.taskTitle}] ` : '';
      lines.push(`- ${finding.severity} ${target}${finding.message}`);
    }
  }
  return lines.join('\n');
}

function extractJson(input: string): unknown | null {
  const text = input.trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeTasks(raw: unknown): PlanTask[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): PlanTask | null => {
      if (typeof item !== 'object' || item === null) return null;
      const task = item as Record<string, unknown>;
      const strArray = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
      const title = typeof task.title === 'string' ? task.title.trim() : '';
      if (!title) {
        return {
          title: '',
          acceptanceCriteria: strArray(task.acceptanceCriteria ?? task.acceptance_criteria),
          verification: strArray(task.verification),
          dependencies: strArray(task.dependencies),
          files: strArray(task.files),
        };
      }
      return {
        title,
        acceptanceCriteria: strArray(task.acceptanceCriteria ?? task.acceptance_criteria),
        verification: strArray(task.verification),
        dependencies: strArray(task.dependencies),
        files: strArray(task.files),
      };
    })
    .filter((task): task is PlanTask => task !== null);
}

const EXTRACTION_PROMPT = `你是计划编译器。把用户给出的项目计划或任务清单解析为 JSON。
只输出 JSON 对象，不要解释，格式：
{"tasks":[{"title":"任务标题","acceptanceCriteria":["可验证条件"],"verification":["验证命令或步骤"],"dependencies":["前置任务标题"],"files":["涉及文件路径"]}]}
无法解析的项也要保留 title，其余字段用空数组。`;

export function createPlanValidationSkill(): ExecutableSkill {
  return {
    name: 'plan-validation',
    version: '0.1.0',
    triggers: ['计划校验', '校验计划', '检查计划', '任务清单', 'plan validation', 'validate plan'],
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      const run = (rawTasks: unknown): SkillOutput => {
        const tasks = normalizeTasks(rawTasks);
        const validation = validatePlanTasks(tasks);
        return {
          result: {
            text: formatPlanValidation(validation),
            validation,
            tasks,
          },
          confidence: validation.verdict === 'pass' ? 0.85 : 0.7,
          followUpAction:
            validation.verdict === 'pass'
              ? '计划结构完整，可进入执行。'
              : '修复 Critical/Warning 后重新校验，再进入执行。',
        };
      };

      if (deps.complete) {
        try {
          const raw = await deps.complete.complete(
            [
              { role: 'system', content: EXTRACTION_PROMPT },
              { role: 'user', content: input.query },
            ],
            { temperature: 0, maxTokens: 1200, json: true },
          );
          const parsed = extractJson(raw);
          const rawTasks = parsed && typeof parsed === 'object'
            ? (parsed as { tasks?: unknown }).tasks
            : null;
          return run(rawTasks);
        } catch (err) {
          return {
            result: {
              error: err instanceof Error ? err.message : String(err),
              answer: '计划解析失败，请直接提供 JSON 或稍后重试。',
            },
            confidence: 0.3,
          };
        }
      }

      const parsed = extractJson(input.query);
      if (!parsed) {
        return {
          result: {
            error: 'plan_validation_requires_llm_or_structured_json',
            answer: '当前没有文本 LLM，请直接粘贴 JSON 格式的任务清单。',
          },
          confidence: 0.3,
          followUpAction: '接入 LLM 后可直接校验自然语言计划。',
        };
      }
      const rawTasks = typeof parsed === 'object' ? (parsed as { tasks?: unknown }).tasks : null;
      return run(rawTasks);
    },
  };
}
