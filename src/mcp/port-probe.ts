/**
 * E411：串口占用检查接口。默认探针不打开真实端口，避免误连硬件。
 */

export type PortProbeStatus = 'free' | 'busy' | 'unknown' | 'probe_disabled';

export interface PortProbeResult {
  status: PortProbeStatus;
  port: string;
  reason?: string;
}

export type PortProbe = (port: string) => PortProbeResult;

/** 默认实现：零硬件副作用，仅声明本轮不做真实探测 */
export const defaultPortProbe: PortProbe = (port) => ({
  status: 'probe_disabled',
  port,
  reason: 'E411 默认不打开真实串口；注入 PortProbe 后才允许占用探测',
});

export function assertPortAvailable(
  port: string | null,
  probe: PortProbe = defaultPortProbe,
): PortProbeResult | null {
  if (!port) return null;
  return probe(port);
}
