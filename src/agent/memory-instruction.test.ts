import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { extractRememberInstruction } from './memory-instruction.js';

test('memory-instruction: 解析“记住：...”指令', () => {
  assert.equal(
    extractRememberInstruction('记住：日报格式是先汇总今日完成事项，再列明日计划。'),
    '日报格式是先汇总今日完成事项，再列明日计划。',
  );
  assert.equal(
    extractRememberInstruction('请帮我记住：导出嘉立创时要关闭钻孔文件。'),
    '导出嘉立创时要关闭钻孔文件。',
  );
});

test('memory-instruction: 普通问题不命中', () => {
  assert.equal(extractRememberInstruction('帮我记住哪些内容比较重要？'), null);
  assert.equal(extractRememberInstruction('STM32 的 ADC 怎么配置？'), null);
});
