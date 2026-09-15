export type PersonaMemoryKind =
  | 'terminology'
  | 'language_preference'
  | 'technical_preference'
  | 'general';

export type PersonaMemoryLayer = 'L1' | 'L2';
export type PersonaMemoryScope = 'global' | 'engineering' | 'knowledge' | 'life';

export interface PersonaMemoryClassification {
  kind: PersonaMemoryKind;
  layer: PersonaMemoryLayer;
}

const TERMINOLOGY_RE =
  /(?:指的是|意思是|等于|(?:简称|别称|黑话).{0,8}(?:是|为)|[A-Za-z0-9_+.-]+\s*=\s*\S+)/i;
const LANGUAGE_PREFERENCE_RE =
  /(?:请叫我|称呼我|回复时|回答时|表达方式|习惯用语|常用缩写|偏好表述)/;
const PREFERENCE_RE = /(?:偏好|喜欢|习惯|常用|优先|使用|用)/;
const TECHNICAL_RE =
  /(?:芯片|平台|工具链|编译器|IDE|EDA|编码风格|命名风格|STM32|ESP32|Altium|Protel|KiCad|Keil|IAR|C\+\+|C语言)/i;
const RESOLVED_LIFE_MATERIAL_RE = /^用户已解决的(?:日常|情绪)话题：/;
const TECHNICAL_CORRECTION_RE = /^用户修改后的技术回复偏好：/;

export function classifyPersonaMemory(content: string): PersonaMemoryClassification {
  if (TECHNICAL_CORRECTION_RE.test(content)) return { kind: 'general', layer: 'L2' };
  if (RESOLVED_LIFE_MATERIAL_RE.test(content)) return { kind: 'general', layer: 'L2' };
  if (TERMINOLOGY_RE.test(content)) return { kind: 'terminology', layer: 'L1' };
  if (LANGUAGE_PREFERENCE_RE.test(content)) {
    return { kind: 'language_preference', layer: 'L1' };
  }
  if (PREFERENCE_RE.test(content) && TECHNICAL_RE.test(content)) {
    return { kind: 'technical_preference', layer: 'L2' };
  }
  return { kind: 'general', layer: 'L1' };
}

export function buildCorrectionPreferenceFact(correctedAnswer: string): string {
  return TECHNICAL_RE.test(correctedAnswer)
    ? `用户修改后的技术回复偏好：${correctedAnswer}`
    : `用户修改后的回复偏好：${correctedAnswer}`;
}

export function memoryConflictKey(content: string): string {
  const classification = classifyPersonaMemory(content);
  if (classification.kind === 'terminology') {
    const term = content
      .match(/^\s*([A-Za-z0-9_+.-]+|[\u4e00-\u9fff]{1,20})\s*(?:指的是|意思是|等于|=)/i)?.[1]
      ?.toLowerCase();
    return term ? 'terminology:' + term : '';
  }
  if (classification.kind === 'language_preference') {
    if (/(?:请叫我|称呼我)/.test(content)) return 'language_preference:address';
    if (/(?:回复时|回答时|表达方式|偏好表述)/.test(content)) {
      return 'language_preference:reply_style';
    }
    if (/(?:习惯用语|常用缩写)/.test(content)) return 'language_preference:vocabulary';
  }
  if (classification.kind === 'technical_preference') {
    if (/(?:EDA|Altium|Protel|KiCad|EasyEDA|嘉立创)/i.test(content)) {
      return 'technical_preference:eda';
    }
    if (/(?:工具链|编译器|IDE|Keil|IAR)/i.test(content)) {
      return 'technical_preference:toolchain';
    }
    if (/(?:平台|芯片|STM32|ESP32)/i.test(content)) {
      return 'technical_preference:platform';
    }
    if (/(?:编码风格|命名风格|C\+\+|C语言)/i.test(content)) {
      return 'technical_preference:coding';
    }
  }
  return '';
}
