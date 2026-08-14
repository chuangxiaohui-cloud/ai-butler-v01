import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  createDeliveryWorkflowSkill,
  pickWorkflow,
  workflowPromptBlock,
} from './index.js';

test('delivery-workflow: 按问题类型选择工作流', () => {
  assert.equal(pickWorkflow('帮我做项目规划').id, 'plan');
  assert.equal(pickWorkflow('写一份 PRD').id, 'spec');
  assert.equal(pickWorkflow('测试这个接口').id, 'tdd');
  assert.equal(pickWorkflow('代码审查一下改动').id, 'review');
  assert.equal(pickWorkflow('帮我看一下这个 bug').id, 'debug');
  assert.equal(pickWorkflow('性能优化').id, 'perf');
  assert.equal(pickWorkflow('安全审查').id, 'security');
  assert.equal(pickWorkflow('准备上线').id, 'ship');
  assert.equal(pickWorkflow('帮我实现登录').id, 'implement');
});

test('delivery-workflow: 执行返回可注入 LLM 的工作流文本', async () => {
  const skill = createDeliveryWorkflowSkill();
  const out = await skill.execute(
    {
      query: '帮我做项目规划',
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
    },
    { callVLM: async () => '' },
  );
  const result = out.result as {
    text: string;
    workflow: string;
    steps: string[];
    gates: string[];
  };
  assert.equal(result.workflow, 'plan');
  assert.ok(result.text.includes('任务拆解'));
  assert.ok(result.steps.length >= 4);
  assert.ok(result.gates.length >= 4);
});

test('delivery-workflow: prompt block 包含原则、步骤和质量门禁', () => {
  const block = workflowPromptBlock('准备上线');
  assert.ok(block.includes('安全上线'));
  assert.ok(block.includes('步骤'));
  assert.ok(block.includes('质量门禁'));
  assert.ok(block.includes('shipping-and-launch'));
});
