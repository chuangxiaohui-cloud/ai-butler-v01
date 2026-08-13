import type { VLMClient } from '../../../src/skills/deps.js';

export function createMockVLM(opts?: { delayMs?: number; reply?: string }) {
  const calls: Array<{ prompt: string; hasImage: boolean }> = [];
  const client: VLMClient = async (input) => {
    if (opts?.delayMs) await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
    calls.push({ prompt: input.prompt, hasImage: Boolean(input.image) });
    return opts?.reply ?? '截图：对话界面，含表格与代码块。';
  };
  return { client, calls };
}
