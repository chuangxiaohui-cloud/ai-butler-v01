#!/usr/bin/env node
/**
 * TurnLoop gateway 启动器（E106）
 * 默认监听 127.0.0.1:8787；复用 CLI 同款依赖，保证 UI/CLI 行为一致。
 */

import { createServer } from 'node:http';

import { RouteCaseStore } from '../agent/route-case-store.js';
import { browserSession } from '../browser/session.js';
import { MarketSkillRunner } from '../skills/market/runner.js';
import { ExperienceManager } from '../memory/experience.js';
import { UserContextStore } from '../memory/user-context-store.js';
import { SessionContextStore } from '../memory/session-context.js';
import { parseDocumentFile } from '../search/document-parser.js';
import { createHeavyClient, createOptionalHeavyClient, createSkillCompleteClient, createSkillHeavyClient, createVisionClient } from '../search/llm.js';
import { SearchSourceStats } from '../search/source-stats.js';
import { SkillLifecycle } from '../skills/lifecycle.js';
import type { SkillDeps } from '../skills/deps.js';
import { createGithubApiCache } from '../skills/github-reader/cache.js';
import { TrajectoryLog } from '../trajectory/trajectory-log.js';
import { createGatewayApp } from './app.js';
import { recordProjectChanges } from './change-history.js';
import { publishArtifactEvent } from './artifact-bus.js';
import { startProjectWatcher } from './project-watcher.js';
import { ReminderStore } from '../reminder/reminder-store.js';
import { emitAiOpsDailyReport } from '../usage/ai-ops-notify.js';
import { bochaBalanceWarning, describeBochaBalance, queryBochaBalance } from '../search/balance.js';
import { closeMcpAgents, createMcpAgents } from '../mcp/config.js';
import { SubAgentDispatcher } from '../mcp/dispatcher.js';

const HOST = process.env.GATEWAY_HOST ?? '127.0.0.1';
const PORT = Number(process.env.GATEWAY_PORT ?? '8787');

const experienceManager = new ExperienceManager();
const skillLifecycle = new SkillLifecycle();
const sourceStats = new SearchSourceStats();
const userContextStore = new UserContextStore();
// H5：唯一会话上下文实例——slash（app opts）与 pipeline（deps）必须共用，避免跨实例丢历史
const sessionContext = new SessionContextStore();
const routeCaseStore = new RouteCaseStore();
const trajectoryLog = new TrajectoryLog();
const marketSkillRunner = new MarketSkillRunner();
const mcpAgents = createMcpAgents();
const mcpDispatcher = new SubAgentDispatcher(mcpAgents.metas, mcpAgents.clients);
const skillDeps: SkillDeps = {
  callVLM: async (input, opts) => createVisionClient()(input, opts),
  complete: {
    complete: async (messages, opts) => (createSkillHeavyClient() ?? createHeavyClient()).complete(messages, opts),
  },
  completeForSkill: createSkillCompleteClient,
  httpCache: createGithubApiCache(),
  parseDocument: parseDocumentFile,
  subAgent: { dispatch: (task, options) => mcpDispatcher.dispatch(task, options) },
};
process.on('exit', () => closeMcpAgents(mcpAgents.clients));

try {
  skillLifecycle.ensureRegistered();
  skillLifecycle.ensureMarketSkillsRegistered(marketSkillRunner.listInstalled());
} catch {
  // 技能注册失败不阻塞 gateway
}

const app = createGatewayApp({
  defaultUserId: 'gateway-user',
  routeCaseStore,
  userContextStore,
  experienceManager,
  sessionContext,
  deps: {
    tavily: { enabled: true },
    llm: createOptionalHeavyClient(),
    experienceManager,
    skillLifecycle,
    sourceStats,
    userContextStore,
    routeCaseStore,
    skillDeps,
    trajectory: trajectoryLog,
    browserSession,
    // E248 生产接线：市场 Skill 触发词直连执行（CLI 与 gateway 同一口径）
    marketSkillRunner,
    sessionContext,
  },
});

const server = createServer(app);
const reminderStore = new ReminderStore();
let projectWatcher: ReturnType<typeof startProjectWatcher> | null = null;
const reminderTimer = setInterval(() => {
  try {
    for (const reminder of reminderStore.dueReminders()) {
      publishArtifactEvent('reminder', {
        message: reminder.message,
        remindAt: reminder.remindAt,
        at: Date.now(),
      });
    }
  } catch {
    // 提醒检查失败不阻塞 gateway
  }
}, 30_000);
reminderTimer.unref();
let aiOpsReportTimer: NodeJS.Timeout | null = null;

/** E318：每日 22:00 生成 AI 运营日报（§COST C-7 / §11.3）；启动时已过 22:00 先补发一次（marker 去重） */
function scheduleAiOpsReport(): void {
  const target = new Date();
  target.setHours(22, 0, 0, 0);
  let delayMs = target.getTime() - Date.now();
  if (delayMs <= 0) {
    try {
      emitAiOpsDailyReport();
    } catch {
      // 通知旁路：失败不阻塞 gateway 启动
    }
    target.setDate(target.getDate() + 1);
    delayMs = target.getTime() - Date.now();
  }
  aiOpsReportTimer = setTimeout(() => {
    try {
      emitAiOpsDailyReport();
    } catch {
      // 通知旁路：失败不阻塞 gateway
    }
    scheduleAiOpsReport();
  }, delayMs);
  aiOpsReportTimer.unref();
}

server.listen(PORT, HOST, () => {
  console.log(`TurnLoop gateway: http://${HOST}:${PORT}`);
  console.log('POST /api/ask | GET /api/health | GET /api/model-providers');
  scheduleAiOpsReport();
  // E328：projects/ 目录变更监听 → files_changed SSE（UI 文件面板自动刷新外部改动）
  projectWatcher = startProjectWatcher({
    workspaceRoot: process.cwd(),
    onChange: (changes) => {
      // E339：watcher 差量入内存环（新增/修改/删除，新→旧），随 files_changed 供 UI 展示变更记录
      recordProjectChanges(changes);
      publishArtifactEvent('files_changed', { at: Date.now(), source: 'project_watch' });
    },
  });
  // §D.3 启动时资源包健康检查：余额告警写入日志，不阻塞启动
  queryBochaBalance()
    .then((balance) => {
      if (!balance) return;
      const warning = bochaBalanceWarning(balance);
      if (warning) console.warn(`[预警] ${warning}`);
      else console.log(`[资源包] ${describeBochaBalance(balance)}`);
    })
    .catch(() => {});
});

function shutdown(): void {
  if (aiOpsReportTimer) clearTimeout(aiOpsReportTimer);
  clearInterval(reminderTimer);
  projectWatcher?.stop();
  reminderStore.close();
  server.close(() => {
    experienceManager.close();
    skillLifecycle.close();
    sourceStats.close();
    userContextStore.close();
    browserSession.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
