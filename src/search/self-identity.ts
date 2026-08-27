/**
 * E264：自我身份问答（“你现在是什么模型/你是谁”等 → 直达回答，不做搜索）
 * 从 modelSelection（provider:role）与模型目录取当前模型，构建秒回身份回答。
 */

import { buildModelCatalog } from '../config/model-catalog.js';
import type { ModelSelection } from './model-id.js';

export function buildSelfIdentityAnswer(selection: ModelSelection | undefined): string {
  const catalog = buildModelCatalog();
  const role = selection?.role ?? catalog.defaultTier;
  const preferred = selection?.provider
    ? catalog.models.find((m) => m.id === `${selection.provider}:${role}`)
    : undefined;
  const entry = preferred ?? catalog.models.find((m) => m.id.endsWith(`:${role}`));
  const provider = entry?.provider ?? 'DeepSeek';
  const label = entry?.label ?? 'deepseek-v4-flash';
  const note = entry?.note ?? '均衡';
  return (
    `我是「一人公司 AI-Agent」桌面助手，当前生效模型是 ${provider} 的 ${label}（${role} 档 · ${note}）。\n` +
    '身份/系统信息类问题由内置规则直接秒回，不消耗模型调用额度；普通问答按所选档位调用模型，' +
    '可在 UI 模型切换器选 light（快速）/ medium（均衡）/ heavy（旗舰 · 推理），新问题按新档位走。'
  );
}
