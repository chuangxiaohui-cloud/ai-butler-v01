/**
 * 规则③ 关键词硬规则兜底（§6.1.3，独立于分类器部署）
 * query 命中药品名/税率/法规/统计口径词 → 强制严肃通道。
 */

export interface Rule3Result {
  serious: boolean;
  matched: string[];
}

export type Rule3Table = Record<string, string[]>;

const DEFAULT_RULE3_TABLE: Rule3Table = {
  drug: [
    '高血压',
    '降压药',
    '阿司匹林',
    '布洛芬',
    '头孢',
    '胰岛素',
    '二甲双胍',
    '奥美拉唑',
    '感冒药',
    '退烧药',
    '止痛药',
  ],
  tax: ['个税', '个人所得税', '增值税', '企业所得税', '税率', '专项附加扣除'],
  regulation: ['劳动法', '合同法', '民法典', '劳动合同', '经济补偿金', '劳动仲裁'],
  statistics: ['GDP', 'CPI', '人口', '统计局', '统计口径'],
};

export function applyRule3(query: string, table: Rule3Table = DEFAULT_RULE3_TABLE): Rule3Result {
  const matched: string[] = [];
  for (const [group, keywords] of Object.entries(table)) {
    for (const keyword of keywords) {
      if (query.includes(keyword)) matched.push(`${group}:${keyword}`);
    }
  }
  return { serious: matched.length > 0, matched };
}
