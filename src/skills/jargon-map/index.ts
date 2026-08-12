/**
 * Skill: jargon-map（黑话映射）
 * v0.1 核心项，例如 Protel→Altium Designer、"大殖子"等
 */
export const skill = {
  name: 'jargon-map',
  version: '0.1.0',
  triggers: ['jargon', '黑话', 'Protel', '大殖子'],
  handler: async (query: string) => {
    const map: Record<string, string> = {
      protel: 'Altium Designer',
    };
    const matched = Object.entries(map)
      .filter(([term]) => query.toLowerCase().includes(term.toLowerCase()))
      .map(([term, normalized]) => ({ term, normalized }));
    const normalizedQuery = matched.reduce(
      (out, m) => out.replace(new RegExp(m.term, 'ig'), m.normalized),
      query,
    );
    return { matched, normalizedQuery };
  },
};
