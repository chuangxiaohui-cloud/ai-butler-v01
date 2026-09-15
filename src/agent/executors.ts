/**
 * 执行器注册表（§2.2 主镜片 vs 执行器分离）
 * available = 可执行；not_wired = 路由成功但执行器未接入。
 */

export type ExecutorStatus = 'available' | 'not_wired' | 'degraded';

export const EXECUTOR_REGISTRY: Record<string, { status: ExecutorStatus }> = {
  engineer: { status: 'available' },
  search_skill: { status: 'available' },
  color_recognition: { status: 'available' },
  document_qa: { status: 'available' },
  image_analysis: { status: 'available' },
  knowledge_qa: { status: 'available' },
  content_writer: { status: 'available' },
  calendar_skill: { status: 'available' },
  im_dispatch: { status: 'available' },
  quote_compare: { status: 'available' },
  github_reader: { status: 'available' },
  project_packager: { status: 'available' },
  project_writer: { status: 'available' },
  schematic_bom: { status: 'available' },
  office_daily: { status: 'available' },
  video_learner: { status: 'available' },
  pm_xmind: { status: 'available' }, // E340：Xmind 思维导图生成/读取（预置 Skill pm-xmind）
  codegraph: { status: 'available' }, // E353：CodeGraph 本地代码影响/调用分析（预置 Skill codegraph，只读）
  layered_arch: { status: 'available' }, // E364：分层架构/框架/模块图（预置 Skill layered-arch，confirm 写类）
  archify: { status: 'available' }, // E352：Archify 系统图渲染（预置 Skill archify，confirm 写类）
  mcp_agent: { status: 'available' }, // E240：MCP 子 Agent（无可用 server 时 skill 内诚实提示）
};

export function executorStatus(name: string | undefined): ExecutorStatus {
  return name ? (EXECUTOR_REGISTRY[name]?.status ?? 'not_wired') : 'available';
}
