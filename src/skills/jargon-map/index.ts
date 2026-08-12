/**
 * Skill: jargon-map（黑话映射）
 * v0.1 核心项，例如 Protel→Altium Designer、"大殖子"等
 */
export const skill = {
  name: 'jargon-map',
  version: '0.1.0',
  triggers: ['jargon', '黑话', 'Protel', '大殖子'],
  handler: async (_query: string) => {
    // WP9 实现
    return null;
  },
};
