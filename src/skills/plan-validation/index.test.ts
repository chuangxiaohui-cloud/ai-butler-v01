import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  checkMilestoneDone,
  createPlanValidationSkill,
  formatPlanValidation,
  validatePlanTasks,
  type PlanTask,
} from './index.js';

const completeTask: PlanTask = {
  title: '实现登录接口',
  acceptanceCriteria: ['未登录用户返回 401'],
  verification: ['npm test'],
  dependencies: [],
  files: ['src/auth.ts'],
};

test('plan-validation: 完整计划通过', () => {
  const result = validatePlanTasks([completeTask]);
  assert.equal(result.verdict, 'pass');
  assert.equal(result.findings.length, 0);
});

test('plan-validation: 缺验收/验证/文件范围时给出分级问题', () => {
  const result = validatePlanTasks([
    {
      ...completeTask,
      acceptanceCriteria: [],
      verification: [],
      files: [],
    },
  ]);
  assert.equal(result.verdict, 'invalid');
  assert.ok(result.findings.some((f) => f.severity === 'critical' && f.message.includes('验收标准')));
  assert.ok(result.findings.some((f) => f.severity === 'critical' && f.message.includes('验证步骤')));
  assert.ok(result.findings.some((f) => f.severity === 'warning' && f.message.includes('涉及文件')));
});

test('plan-validation: 文件过多提示拆细', () => {
  const result = validatePlanTasks([
    completeTask,
    {
      ...completeTask,
      title: '实现退出接口',
      files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
    },
  ]);
  assert.equal(result.verdict, 'needs_review');
  assert.ok(result.findings.some((f) => f.severity === 'warning' && f.message.includes('超过建议')));
});

test('plan-validation: JSON 输入无需 LLM 即可校验', async () => {
  const skill = createPlanValidationSkill();
  const out = await skill.execute(
    {
      query: JSON.stringify({ tasks: [completeTask] }),
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
    },
    { callVLM: async () => '' },
  );
  const result = out.result as { text: string; validation: { verdict: string } };
  assert.equal(result.validation.verdict, 'pass');
  assert.ok(result.text.includes('计划校验：通过'));
});

test('plan-validation: LLM 解析自然语言计划并校验', async () => {
  const skill = createPlanValidationSkill();
  const out = await skill.execute(
    {
      query: '做一个登录功能：先建接口，再写测试，最后联调',
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
    },
    {
      callVLM: async () => '',
      complete: {
        complete: async () =>
          JSON.stringify({
            tasks: [
              {
                title: '实现登录接口',
                acceptanceCriteria: ['未登录返回 401'],
                verification: ['npm test'],
                dependencies: [],
                files: ['src/auth.ts'],
              },
            ],
          }),
      },
    },
  );
  const result = out.result as { validation: { verdict: string } };
  assert.equal(result.validation.verdict, 'pass');
});

test('plan-validation: 纯文本且无 LLM 时诚实降级', async () => {
  const skill = createPlanValidationSkill();
  const out = await skill.execute(
    {
      query: '做一个登录功能',
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
    },
    { callVLM: async () => '' },
  );
  const result = out.result as { error: string };
  assert.equal(result.error, 'plan_validation_requires_llm_or_structured_json');
});

test('plan-validation: 格式化输出可读', () => {
  const text = formatPlanValidation(validatePlanTasks([completeTask]));
  assert.ok(text.includes('任务数：1'));
  assert.ok(text.includes('未发现结构问题'));
});

test('plan-validation: 全部子任务 done → milestoneDone 自动触发复盘（E312）', () => {
  const result = validatePlanTasks([
    { ...completeTask, status: 'done' },
    { ...completeTask, title: '实现退出接口', status: 'done' },
  ]);
  assert.equal(result.milestoneDone, true);
  const text = formatPlanValidation(result);
  assert.ok(text.includes('自动触发里程碑复盘'));
});

test('plan-validation: 存在未完成子任务 → milestoneDone false（E312）', () => {
  const result = validatePlanTasks([
    { ...completeTask, status: 'done' },
    { ...completeTask, title: '实现退出接口', status: 'todo' },
  ]);
  assert.equal(result.milestoneDone, false);
  assert.ok(!formatPlanValidation(result).includes('自动触发'));
});

test('plan-validation: 中文已完成 识别 + checkMilestoneDone 汇总（E312）', () => {
  const result = validatePlanTasks([
    { ...completeTask, status: '已完成' },
    { ...completeTask, title: '实现退出接口' },
  ]);
  assert.equal(result.milestoneDone, false);
  const allDone = checkMilestoneDone([
    { ...completeTask, status: '已完成' },
    { ...completeTask, title: '实现退出接口', status: 'done' },
  ]);
  assert.equal(allDone.allDone, true);
  assert.equal(allDone.doneCount, 2);
  assert.equal(allDone.totalCount, 2);
  assert.deepEqual(allDone.pendingTitles, []);
  const mixed = checkMilestoneDone([
    { ...completeTask, status: 'done' },
    { ...completeTask, title: '实现退出接口', status: 'todo' },
  ]);
  assert.equal(mixed.allDone, false);
  assert.deepEqual(mixed.pendingTitles, ['实现退出接口']);
  assert.equal(checkMilestoneDone([]).allDone, false);
});

test('plan-validation: 全部 done 时 followUpAction 提示自动触发复盘（E312）', async () => {
  const skill = createPlanValidationSkill();
  const out = await skill.execute(
    {
      query: JSON.stringify({
        tasks: [
          { ...completeTask, status: 'done' },
          { ...completeTask, title: '实现退出接口', status: 'done' },
        ],
      }),
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
    },
    { callVLM: async () => '' },
  );
  const result = out.result as { text: string };
  assert.ok(result.text.includes('自动触发里程碑复盘'));
  assert.ok((out.followUpAction ?? '').includes('里程碑复盘'));
});
