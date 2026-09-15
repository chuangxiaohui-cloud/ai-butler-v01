import type { SubAgentCategory } from './types.js';

export type SubAgentRunStatus = 'planned' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type SubAgentPlanStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type SubAgentProgressPhase = 'planned' | 'running' | 'retrying' | 'degraded' | 'completed' | 'failed' | 'cancelled';

export interface SubAgentTaskRef {
  description: string;
  requestedTool?: string;
  category?: SubAgentCategory;
}

export interface SubAgentPlanStep {
  id: 'select_agent' | 'validate_call' | 'execute_tool';
  title: string;
  status: SubAgentPlanStepStatus;
}

export interface SubAgentProgressEvent {
  phase: SubAgentProgressPhase;
  message: string;
  elapsedMs: number;
  agentId?: string;
  attempt?: number;
}

export interface SubAgentArtifact {
  kind: 'text';
  content: string;
  untrusted: true;
}

export interface SubAgentEvidence {
  kind: 'mcp_tool_call';
  agentId: string;
  toolName: string;
  attempt: number;
  untrusted: true;
}

export interface SubAgentFailure {
  code: 'no_agent' | 'validation_error' | 'tool_error' | 'timeout' | 'cancelled';
  message: string;
  retryable: boolean;
}

export interface SubAgentHandoff {
  required: boolean;
  reason?: string;
  nextAction?: string;
}
