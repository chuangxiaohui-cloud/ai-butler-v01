#!/usr/bin/env node
/**
 * TurnLoop gateway 启动器（E106）
 * 默认监听 127.0.0.1:8787；复用 CLI 同款依赖，保证 UI/CLI 行为一致。
 */

import { createServer } from 'node:http';

import { RouteCaseStore } from '../agent/route-case-store.js';
import { browserSession } from '../browser/session.js';
import { ExperienceManager } from '../memory/experience.js';
import { UserContextStore } from '../memory/user-context-store.js';
import { parseDocumentFile } from '../search/document-parser.js';
import { createHeavyClient, createVisionClient } from '../search/llm.js';
import { SearchSourceStats } from '../search/source-stats.js';
import { SkillLifecycle } from '../skills/lifecycle.js';
import type { SkillDeps } from '../skills/deps.js';
import { TrajectoryLog } from '../trajectory/trajectory-log.js';
import { createGatewayApp } from './app.js';

const HOST = process.env.GATEWAY_HOST ?? '127.0.0.1';
const PORT = Number(process.env.GATEWAY_PORT ?? '8787');

const experienceManager = new ExperienceManager();
const skillLifecycle = new SkillLifecycle();
const sourceStats = new SearchSourceStats();
const userContextStore = new UserContextStore();
const routeCaseStore = new RouteCaseStore();
const trajectoryLog = new TrajectoryLog();
const skillDeps: SkillDeps = {
  callVLM: async (input, opts) => createVisionClient()(input, opts),
  complete: {
    complete: async (messages, opts) => createHeavyClient().complete(messages, opts),
  },
  parseDocument: parseDocumentFile,
};

try {
  skillLifecycle.ensureRegistered();
} catch {
  // 技能注册失败不阻塞 gateway
}

const app = createGatewayApp({
  defaultUserId: 'gateway-user',
  routeCaseStore,
  userContextStore,
  experienceManager,
  deps: {
    tavily: { enabled: true },
    experienceManager,
    skillLifecycle,
    sourceStats,
    userContextStore,
    routeCaseStore,
    skillDeps,
    trajectory: trajectoryLog,
    browserSession,
  },
});

const server = createServer(app);
server.listen(PORT, HOST, () => {
  console.log(`TurnLoop gateway: http://${HOST}:${PORT}`);
  console.log('POST /api/ask | GET /api/health | GET /api/model-providers');
});

function shutdown(): void {
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
