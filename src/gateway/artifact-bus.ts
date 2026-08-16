/**
 * Artifact 事件总线（E118）
 * gateway 内内存广播；问答完成/文件变化时向 SSE 订阅者推送。
 */

export interface ArtifactEvent {
  type: string;
  data: Record<string, unknown>;
}

type Listener = (event: ArtifactEvent) => void;

const listeners = new Set<Listener>();

export function publishArtifactEvent(type: string, data: Record<string, unknown> = {}): void {
  const event: ArtifactEvent = { type, data };
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // 单个订阅者失败不影响其他订阅者
    }
  }
}

export function subscribeArtifactEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
