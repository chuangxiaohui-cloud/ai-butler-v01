/**
 * Skill: chip-analysis（芯片/器件分析）
 * v0.1 核心项，与 §7 Datasheet 解析子系统联动
 */
export const skill = {
  name: 'chip-analysis',
  version: '0.1.0',
  triggers: ['chip', 'datasheet', '器件', '芯片', 'MOSFET', 'ADC'],
  handler: async (_query: string) => {
    // WP9 实现
    return null;
  },
};
