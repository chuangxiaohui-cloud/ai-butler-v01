/**
 * 执行器注册表（§2.2 主镜片 vs 执行器分离）
 * available = 可执行；not_wired = 路由成功但执行器未接入。
 */

export type ExecutorStatus = 'available' | 'not_wired' | 'degraded';

export const EXECUTOR_REGISTRY: Record<string, { status: ExecutorStatus }> = {
  engineer: { status: 'available' },
  search_skill: { status: 'available' },
  content_writer: { status: 'not_wired' },
  calendar_skill: { status: 'not_wired' },
  im_dispatch: { status: 'not_wired' },
};

export function executorStatus(name: string | undefined): ExecutorStatus {
  return name ? (EXECUTOR_REGISTRY[name]?.status ?? 'not_wired') : 'available';
}
