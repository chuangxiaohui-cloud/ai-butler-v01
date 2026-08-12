/**
 * 三路心跳健康检查（§6.2.2，[P-37]）
 * Bocha / AnySearch / Tavily 各自健康状态；连续失败且超过检测窗口才标记 down。
 */

export interface HeartbeatState {
  ok: boolean;
  consecutiveFailures: number;
  lastCheckAt: number;
  lastSuccessAt: number | null;
  downAt: number | null;
}

const DETECT_WINDOW_MS = 5000; // [P-37]
const DOWN_THRESHOLD = 2;

export class HeartbeatMonitor {
  private readonly states = new Map<string, HeartbeatState>();

  record(id: string, ok: boolean, now = Date.now()): HeartbeatState {
    const prev = this.states.get(id) ?? {
      ok: true,
      consecutiveFailures: 0,
      lastCheckAt: 0,
      lastSuccessAt: null,
      downAt: null,
    };
    if (ok) {
      const state: HeartbeatState = {
        ok: true,
        consecutiveFailures: 0,
        lastCheckAt: now,
        lastSuccessAt: now,
        downAt: null,
      };
      this.states.set(id, state);
      return state;
    }
    const failures = prev.consecutiveFailures + 1;
    const sinceLastSuccess =
      prev.lastSuccessAt === null ? Number.POSITIVE_INFINITY : now - prev.lastSuccessAt;
    const down = failures >= DOWN_THRESHOLD && sinceLastSuccess >= DETECT_WINDOW_MS;
    const state: HeartbeatState = {
      ok: !down,
      consecutiveFailures: failures,
      lastCheckAt: now,
      lastSuccessAt: prev.lastSuccessAt,
      downAt: down ? (prev.downAt ?? now) : null,
    };
    this.states.set(id, state);
    return state;
  }

  isHealthy(id: string): boolean {
    return this.states.get(id)?.ok ?? true;
  }

  summary(): Record<string, HeartbeatState> {
    return Object.fromEntries(this.states);
  }
}

export const heartbeat = new HeartbeatMonitor();
