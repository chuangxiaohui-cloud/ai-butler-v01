/**
 * Skill: chip-analysis（芯片/器件分析）
 * v0.1 核心项，与 §7 Datasheet 解析子系统联动
 */
export const skill = {
  name: 'chip-analysis',
  version: '0.1.0',
  triggers: ['chip', 'datasheet', '器件', '芯片', 'MOSFET', 'ADC'],
  handler: async (query: string) => {
    const partNumber = query.match(/[A-Z]{2,}[0-9A-Z-]{2,}/)?.[0] ?? null;
    return {
      partNumber,
      supported: Boolean(partNumber),
      note: 'v0.1 提供芯片参数速查指引；Datasheet 深度解析随 v0.2a datasheet-speed 启用',
    };
  },
};
