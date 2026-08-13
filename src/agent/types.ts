/**
 * 主 Agent 路由共享类型（§2.1 五主镜片，封闭枚举）
 */

export const PRIMARY_LENSES = [
  'secretary',
  'owner',
  'project_manager',
  'product_manager',
  'architect',
] as const;

export type PrimaryLens = (typeof PRIMARY_LENSES)[number];
