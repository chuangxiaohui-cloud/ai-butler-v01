import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  buildConfirmHoldAnswer,
  estimateConfirmCostYuan,
  executorActionLabel,
  executorRiskGrade,
  isConfirmWriteExecutor,
  parseApprovalReply,
  restateForUser,
} from './confirm-gate.js';

test('confirm-gate: E324 写类执行器试点清单命中与文案', () => {
  for (const executor of [
    'project_writer',
    'content_writer',
    'office_daily',
    'calendar_skill',
    'im_dispatch',
    'project_packager',
    'pm_xmind',
    'layered_arch',
    'archify',
  ]) {
    assert.equal(isConfirmWriteExecutor(executor), true, `${executor} 应命中试点清单`);
  }
  assert.equal(isConfirmWriteExecutor(undefined), false);
  assert.equal(isConfirmWriteExecutor('knowledge_qa'), false, '知识问答执行器不拦');
  assert.equal(isConfirmWriteExecutor('project_writer '), false, '带空白不误命中（executor 来自路由，原样比较）');
  const answer = buildConfirmHoldAnswer('office_daily', '给张三发一封邮件约下周会议');
  assert.ok(answer.includes('发送/处理邮件'), answer);
  assert.ok(answer.includes('执行'), answer);
  assert.ok(answer.includes('取消'), answer);
  assert.ok(executorActionLabel('calendar_skill').includes('日程'));

  const writerAnswer = buildConfirmHoldAnswer(
    'project_writer',
    '写入 M:/projects/demo/src/main.c，内容：int main(void){return 0;}',
  );
  assert.ok(writerAnswer.includes('变更清单：'), writerAnswer);
  assert.ok(writerAnswer.includes('创建或修改文件：M:/projects/demo/src/main.c'), writerAnswer);
  assert.ok(writerAnswer.includes('将运行的命令：无'), writerAnswer);
});

test('confirm-gate: E334 挂起文案带风险分级与本次操作预估成本', () => {
  // [executor, 风险标签, 预估成本行]（成本行与 [P-149]/[P-150] + deepseek-v4-flash 高峰价联动）
  const cases: Array<[string, string, string]> = [
    ['project_writer', '中', '¥0.00（本地确定性执行，无外部模型调用）'],
    ['content_writer', '中', '≤ ¥0.03（单次内容生成上界，按 /cost 单价估算）'],
    ['office_daily', '高', '≤ ¥0.03（单次内容生成上界，按 /cost 单价估算）'],
    ['calendar_skill', '低', '¥0.00（本地确定性执行，无外部模型调用）'],
    ['im_dispatch', '高', '¥0.00（本地确定性执行，无外部模型调用）'],
    ['project_packager', '中', '¥0.00（本地确定性执行，无外部模型调用）'],
    ['pm_xmind', '低', '¥0.00（本地确定性执行，无外部模型调用）'],
    ['layered_arch', '低', '≤ ¥0.03（单次内容生成上界，按 /cost 单价估算）'],
    ['archify', '低', '≤ ¥0.03（单次内容生成上界，按 /cost 单价估算）'],
  ];
  for (const [executor, risk, cost] of cases) {
    const answer = buildConfirmHoldAnswer(executor, '帮我执行一次该操作');
    assert.ok(answer.includes('风险等级：' + risk), executor + ' 风险应为「' + risk + '」: ' + answer);
    assert.ok(
      answer.includes('本次操作预估成本：' + cost),
      executor + ' 成本应为「' + cost + '」: ' + answer,
    );
    assert.equal(
      executorRiskGrade(executor),
      risk === '高' ? 'high' : risk === '中' ? 'medium' : 'low',
    );
  }
  // 成本纯函数：local ¥0，content_generation 按参数与单价给出分向上取整上界
  assert.equal(estimateConfirmCostYuan('calendar_skill'), 0);
  assert.ok(estimateConfirmCostYuan('office_daily') > 0);
  assert.ok(estimateConfirmCostYuan('layered_arch') > 0, 'layered_arch 为内容生成，预估成本应 > 0');
  assert.ok(estimateConfirmCostYuan('archify') > 0, 'archify 为内容生成，预估成本应 > 0');
  assert.ok(executorActionLabel('layered_arch').includes('分层架构图'));
  assert.ok(executorActionLabel('archify').includes('系统架构图'));
});
