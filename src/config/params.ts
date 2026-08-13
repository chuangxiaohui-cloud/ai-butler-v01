/**
 * §5 PARAM 登记中心（Week 1 新建）
 * 纪律：
 *  - 只登记新参数，不迁移现有散落常量（迁移另立任务）；
 *  - 每个参数 = P-NN 编号 + camelCase key，编号全局唯一递增；
 *  - 本批起编 P-87（与现有最大编号衔接）。
 */

export const PARAMS = {
  /** P-87 路由层 fast description 总开关 */
  fastDescriptionEnabled: true,
  /** P-88 fast description 超时(ms)，超时静默降级 undefined */
  fastDescriptionTimeoutMs: 2000,
  /** P-89 wrapLegacySkill 包装旧 handler 的默认置信度 */
  legacySkillConfidence: 0.8,
  /** P-90 长期事实注入 prompt 的最低置信度 */
  injectMinConfidence: 0.6,
  /** P-91 单次注入长期事实条数上限 */
  injectMaxFacts: 10,
  /** P-92 30天未访问衰减系数(user_explicit/corrected 减半应用) */
  decayFactor30d: 0.9,
  /** P-93 90天未访问衰减系数 */
  decayFactor90d: 0.7,
  /** P-94 低于此值归档、不再注入 */
  archiveThreshold: 0.3,
} as const;

export type ParamKey = keyof typeof PARAMS;

/** camelCase key → P-NN，供 §5 追溯；Record 类型在编译期强制全覆盖 */
export const PARAM_IDS: Record<ParamKey, string> = {
  fastDescriptionEnabled: 'P-87',
  fastDescriptionTimeoutMs: 'P-88',
  legacySkillConfidence: 'P-89',
  injectMinConfidence: 'P-90',
  injectMaxFacts: 'P-91',
  decayFactor30d: 'P-92',
  decayFactor90d: 'P-93',
  archiveThreshold: 'P-94',
};
