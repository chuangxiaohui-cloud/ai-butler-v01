/**
 * AI 运营成本单价表（§COST C-3，来源：DeepSeek 官方价目，owner 2026-09-02 提供）
 * 单位：¥ / 百万 token。价格为「高峰时段」价；空闲时段 = 高峰 × 0.5
 * （官方口径：高峰 = 北京时间周一至周五 9:00-12:00、14:00-18:00，其余为空闲）。
 * 输入分「缓存命中 / 未命中」两档；未知/未提供价模型返回 null 诚实不计价。
 * 单价为 Provider 外部价目快照（登记于本表 + plan doc，月度校准）；§COST 阈值类参数在 §5
 * 注册表（P-143~P-148），本表引用 [P-148]（空闲折价系数）。
 */

export interface ModelPriceCny {
  /** 输入缓存命中 · 高峰价（¥/百万 token） */
  inputCacheHitPerMTok: number;
  /** 输入缓存未命中 · 高峰价（¥/百万 token） */
  inputCacheMissPerMTok: number;
  /** 输出 · 高峰价（¥/百万 token） */
  outputPerMTok: number;
  /** 空闲时段系数（空闲 = 高峰 × 此系数）：DeepSeek 官方 0.5；智谱无时段差价 = 1 */
  offpeakFactor: number;
  /**
   * 可选：按单次请求输入 token 整单跳档（非分段累进；输出价跟随输入档位）。
   * 命中最小的 minInputTokens 档；未命中任何档时用本档价。
   */
  byInputTiers?: Array<{
    minInputTokens: number;
    inputCacheHitPerMTok: number;
    inputCacheMissPerMTok: number;
    outputPerMTok: number;
  }>;
}

/** 空闲时段系数（[P-148]：DeepSeek 官方空闲 = 高峰 × 0.5；智谱/MiniMax 无时段差价取 1） */
export const OFFPEAK_FACTOR = 0.5;

/** 高峰时段定义：北京时间周一至周五 9:00-12:00、14:00-18:00 */
export function isPeakHourBeijing(ts: number): boolean {
  const bj = new Date(ts + 8 * 60 * 60 * 1000); // Asia/Shanghai = UTC+8，无夏令时
  const weekday = bj.getUTCDay(); // 0=周日
  const hour = bj.getUTCHours();
  if (weekday === 0 || weekday === 6) return false;
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

/** 已知单价模型表（key = usage.jsonl 中实际 model 名） */
export const MODEL_PRICING_CNY: Record<string, ModelPriceCny> = {
  // .env 默认 light/medium（官方 DeepSeek-V4-Flash-0731）
  'deepseek-v4-flash': { inputCacheHitPerMTok: 0.1, inputCacheMissPerMTok: 3.0, outputPerMTok: 9.0, offpeakFactor: OFFPEAK_FACTOR },
  // .env 默认 heavy（官方 DeepSeek-V4-Pro-0813，思考模式）
  'deepseek-v4-pro': { inputCacheHitPerMTok: 0.3, inputCacheMissPerMTok: 9.0, outputPerMTok: 27.0, offpeakFactor: OFFPEAK_FACTOR },
  // .env 默认 vision（官方 DeepSeek-V4-Flash-Vision-Exp；图片按尺寸折 token，上游已含）
  'deepseek-v4-flash-vision-exp': { inputCacheHitPerMTok: 0.1, inputCacheMissPerMTok: 3.0, outputPerMTok: 9.0, offpeakFactor: OFFPEAK_FACTOR },
  // 智谱 GLM-5 旗舰（registry 默认 light = glm-5-turbo、medium/vision = glm-5.2、heavy = glm-5.3，官方价目 2026-09-02）
  // glm-5.3-Flash（含限时 5 折）非默认档，未登记（owner 2026-09-02 拍板：不登记）。
  'glm-5.2': { inputCacheHitPerMTok: 2.0, inputCacheMissPerMTok: 8.0, outputPerMTok: 28.0, offpeakFactor: 1 },
  'glm-5.3': { inputCacheHitPerMTok: 2.0, inputCacheMissPerMTok: 8.0, outputPerMTok: 28.0, offpeakFactor: 1 },
  // glm-5-turbo（registry 默认 light）：按单次请求输入长度整单跳档，[0,32K) 低价 / ≥32K 高价（owner 2026-09-02 口径）
  'glm-5-turbo': {
    inputCacheHitPerMTok: 1.2,
    inputCacheMissPerMTok: 5.0,
    outputPerMTok: 22.0,
    offpeakFactor: 1,
    byInputTiers: [
      { minInputTokens: 32_000, inputCacheHitPerMTok: 1.8, inputCacheMissPerMTok: 7.0, outputPerMTok: 26.0 },
    ],
  },
  // MiniMax API 按量计费（官方价目 2026-09-02；repo 直连 api.minimax.chat）。
  // 输入含多模态；缓存读取 = 缓存命中输入价，未命中按普通输入价；缓存写入 ¥2.625/百万暂不计（未跟踪）；
  // 每格为「划线原价 / 实际收（永久五折）」：以下取实际收价；
  // M3 上下文 >512K 时价翻倍（输入 4.2 / 输出 16.8 / 缓存 0.84），当前请求预算远低于 512K，
  // 未做自动分档（owner 2026-09-02 拍板：不登记）。
  'MiniMax-M2.7': { inputCacheHitPerMTok: 0.42, inputCacheMissPerMTok: 2.1, outputPerMTok: 8.4, offpeakFactor: 1 },
  'MiniMax-M2.7-highspeed': { inputCacheHitPerMTok: 0.42, inputCacheMissPerMTok: 4.2, outputPerMTok: 16.8, offpeakFactor: 1 },
  'MiniMax-M3': { inputCacheHitPerMTok: 0.42, inputCacheMissPerMTok: 2.1, outputPerMTok: 8.4, offpeakFactor: 1 },
};

/** 查高峰价；无登记返回 null（该调用计入 unpriced，不估算费用） */
export function modelPriceCny(model: string): ModelPriceCny | null {
  return MODEL_PRICING_CNY[model] ?? null;
}
