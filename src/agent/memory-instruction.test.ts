import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { extractMemoryCorrection, extractRememberInstruction } from './memory-instruction.js';

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

test('memory-instruction: 解析严格的记忆纠正指令', () => {
  assert.deepEqual(extractMemoryCorrection('纠正记忆：我使用 KiCad → 我偏好 Altium 工具链'), {
    oldContent: '我使用 KiCad',
    newContent: '我偏好 Altium 工具链',
  });
  assert.deepEqual(extractMemoryCorrection('请更正记忆：Protel 是独立软件改为Protel 指的是 Altium Designer'), {
    oldContent: 'Protel 是独立软件',
    newContent: 'Protel 指的是 Altium Designer',
  });
  assert.equal(extractMemoryCorrection('更正一下这个答案'), null);
  assert.equal(extractMemoryCorrection('纠正记忆：只有旧内容 →'), null);
});
