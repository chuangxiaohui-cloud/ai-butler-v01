/**
 * E411：flash/串口人工门。默认拒绝；允许仅表示「契约通过」，本轮仍不执行硬件。
 */

import type { DeviceAuthStore } from './device-auth.js';
import type { HardwareAuditStore } from './hardware-audit.js';
import {
  flashTimeoutMs,
  isForbiddenAuthSource,
  type HardwareGateDecision,
  type HardwareGateRequest,
  validateFirmwareDigest,
} from './hardware-capability.js';
import { assertPortAvailable, defaultPortProbe, type PortProbe } from './port-probe.js';

export interface HardwareGateDeps {
  devices: Pick<DeviceAuthStore, 'isAuthorized'>;
  audit?: Pick<HardwareAuditStore, 'append'>;
  portProbe?: PortProbe;
}

export function evaluateHardwareGate(
  request: HardwareGateRequest,
  deps: HardwareGateDeps,
): HardwareGateDecision {
  const decision = decide(request, deps);
  deps.audit?.append(decision);
  return decision;
}

function decide(request: HardwareGateRequest, deps: HardwareGateDeps): HardwareGateDecision {
  const base = {
    action: request.action,
    timeoutMs: flashTimeoutMs(),
    audit: {
      deviceId: request.deviceId,
      port: request.port,
      firmwareSha256: request.firmware?.sha256 ?? null,
      perFlashConfirmed: request.perFlashConfirmed === true,
      serialMode: request.serialMode ?? null,
    },
  } as const;

  if (request.cancelled) {
    return deny(base, 'cancelled', '操作已取消；未执行任何硬件动作。');
  }
  if (request.timedOut) {
    return deny(base, 'timed_out', '操作已超时（契约层，引用 [P-39]）；未执行任何硬件动作。');
  }
  if (isForbiddenAuthSource(request.authorizationSource)) {
    return deny(
      base,
      'forbidden_auth_source',
      `授权来源 ${request.authorizationSource} 不能继承为硬件许可（含 E410 夹具与构建批准）。`,
    );
  }
  if (!request.deviceId || !request.deviceId.trim()) {
    return deny(base, 'missing_device', '缺少设备标识；默认无设备授权，零硬件动作。');
  }
  if (!deps.devices.isAuthorized(request.deviceId)) {
    return deny(base, 'device_not_authorized', `设备 ${request.deviceId} 未在白名单授权；零硬件动作。`);
  }

  if (request.action === 'flash') {
    if (!request.firmware || !validateFirmwareDigest(request.firmware)) {
      return deny(base, 'missing_firmware_digest', '烧录前必须提供本地固件 SHA-256 摘要；本轮只做摘要校验，不烧录。');
    }
    if (request.perFlashConfirmed !== true) {
      return deny(
        base,
        'flash_confirmation_required',
        '每次烧录须独立人工确认；构建批准或历史确认不能复用。',
      );
    }
    const portCheck = assertPortAvailable(request.port, deps.portProbe ?? defaultPortProbe);
    if (portCheck?.status === 'busy') {
      return deny(base, 'port_busy', `端口 ${portCheck.port} 被占用：${portCheck.reason ?? 'busy'}`);
    }
    // 契约通过仍不等于执行：E411 不启动烧录进程
    return {
      allowed: true,
      ...base,
      message: '硬件门禁通过（契约层）。E411 不连接设备、不执行烧录；后续轮次才可接入真实 flash 工具。',
    };
  }

  if (request.action === 'serial_read') {
    const mode = request.serialMode ?? 'read_only';
    if (mode !== 'read_only') {
      return deny(base, 'serial_write_denied', '串口默认只读；写/发字节须走 serial_write 并单独确认。');
    }
    const portCheck = assertPortAvailable(request.port, deps.portProbe ?? defaultPortProbe);
    if (portCheck?.status === 'busy') {
      return deny(base, 'port_busy', `端口 ${portCheck.port} 被占用：${portCheck.reason ?? 'busy'}`);
    }
    if (portCheck?.status === 'probe_disabled' && request.port) {
      // 只读意图允许在未探测时通过契约，但仍声明未打开端口
      return {
        allowed: true,
        ...base,
        message: '串口只读门禁通过（契约层）。默认探针未打开端口，未读取任何字节。',
      };
    }
    return {
      allowed: true,
      ...base,
      message: '串口只读门禁通过（契约层）。E411 不打开串口、不发送字节。',
    };
  }

  // serial_write
  if (request.serialWriteConfirmed !== true) {
    return deny(
      base,
      'serial_write_confirmation_required',
      '串口写/发字节须显式确认；默认只读且零发送。',
    );
  }
  return deny(
    base,
    'serial_write_denied',
    'E411 禁止串口写操作落地；即使确认也不发送字节。',
  );
}

function deny(
  base: {
    action: HardwareGateDecision['action'];
    timeoutMs: number;
    audit: HardwareGateDecision['audit'];
  },
  reason: NonNullable<HardwareGateDecision['reason']>,
  message: string,
): HardwareGateDecision {
  return { allowed: false, reason, message, ...base };
}
