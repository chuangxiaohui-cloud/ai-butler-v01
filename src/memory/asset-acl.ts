export type MemoryAccessMode = 'engineering' | 'knowledge' | 'life';
export type MemoryAsset = 'chat_memory' | 'skill' | 'wiki' | 'codegraph';

const MODE_ASSETS: Record<MemoryAccessMode, readonly MemoryAsset[]> = {
  engineering: ['skill', 'wiki', 'codegraph'],
  knowledge: ['chat_memory', 'skill', 'wiki'],
  life: ['chat_memory'],
};

export function parseMemoryAccessMode(value: unknown): MemoryAccessMode | null {
  return value === 'engineering' || value === 'knowledge' || value === 'life' ? value : null;
}

export function memoryAssetsForMode(mode: MemoryAccessMode): readonly MemoryAsset[] {
  return MODE_ASSETS[mode];
}

export function canAccessMemoryAsset(
  mode: MemoryAccessMode | null,
  asset: MemoryAsset,
): boolean {
  return mode !== null && MODE_ASSETS[mode].includes(asset);
}

export function memoryItemAsset(type: unknown): MemoryAsset | null {
  if (type === 'fact' || type === 'session') return 'chat_memory';
  if (type === 'experience') return 'skill';
  return null;
}
