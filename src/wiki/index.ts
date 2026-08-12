/**
 * 预置 Wiki 种子（§12.1 冷启动来源②）
 * v0.1 占位：通用、可公开验证的器件踩坑经验库待后续版本填充，用户可自行导入笔记扩充。
 */

export interface WikiSeedEntry {
  id: string;
  topic: string;
  note: string;
}

export const wikiSeeds: WikiSeedEntry[] = [];
