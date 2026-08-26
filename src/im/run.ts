#!/usr/bin/env node
/**
 * E241（S5 真实平台适配器）：IM 网关常驻入口。
 * 复用与 CLI/gateway 同一 pipeline 函数（§4.5/§4.2 接口复用，不另起一套问答链路），
 * 启动 configs/im-channels.json 声明的真实通道；gate 未授权平台消息不回复（§4.5 授权开关）。
 * 生命周期：SIGINT/SIGTERM 优雅关闭（关通道 server → 关依赖句柄）。
 */

import { ExperienceManager } from '../memory/experience.js';
import { SkillLifecycle } from '../skills/lifecycle.js';
import { SearchSourceStats } from '../search/source-stats.js';
import { UserContextStore } from '../memory/user-context-store.js';
import { RouteCaseStore } from '../agent/route-case-store.js';
import { createHeavyClient, createOptionalHeavyClient, createSkillHeavyClient, createVisionClient } from '../search/llm.js';
import { SessionContextStore } from '../memory/session-context.js';
import { parseDocumentFile } from '../search/document-parser.js';
import type { SkillDeps } from '../skills/deps.js';
import { TrajectoryLog } from '../trajectory/trajectory-log.js';
import { browserSession } from '../browser/session.js';
import { closeMcpAgents, createMcpAgents } from '../mcp/config.js';
import { SubAgentDispatcher } from '../mcp/dispatcher.js';
import { pipeline } from '../search/pipeline.js';
import { createImChannels, loadImChannelConfig } from './config.js';
import { ImGate } from './gate.js';
import { ImService } from './service.js';

const entries = loadImChannelConfig();
const channels = createImChannels(entries);

if (channels.length === 0) {
  console.log(JSON.stringify({
    message: '未配置 IM 通道，退出。',
    hint: '复制 configs/im-channels.json.example 为 configs/im-channels.json 并填写 OneBot 参数。',
  }, null, 2));
  process.exit(0);
}

const experienceManager = new ExperienceManager();
const skillLifecycle = new SkillLifecycle();
const sourceStats = new SearchSourceStats();
const userContextStore = new UserContextStore();
const routeCaseStore = new RouteCaseStore();
const trajectoryLog = new TrajectoryLog();
const sessionContext = new SessionContextStore();
const mcpAgents = createMcpAgents();
const mcpDispatcher = new SubAgentDispatcher(mcpAgents.metas, mcpAgents.clients);
const skillDeps: SkillDeps = {
  callVLM: async (input, opts) => createVisionClient()(input, opts),
  complete: {
    complete: async (messages, opts) => (createSkillHeavyClient() ?? createHeavyClient()).complete(messages, opts),
  },
  parseDocument: parseDocumentFile,
  subAgent: { dispatch: (task, options) => mcpDispatcher.dispatch(task, options) },
};

try {
  skillLifecycle.ensureRegistered();
} catch {
  // 技能注册失败不阻塞 IM 网关
}

const gate = new ImGate();
const service = new ImService({
  ask: async (text, conversationId) => {
    const result = await pipeline(text, {
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
      sessionContext,
    }, {
      userId: 'im-user',
      conversationId,
    });
    return { answer: result?.answer ?? '（无回答）' };
  },
  gate,
});

for (const channel of channels) {
  channel.onMessage(async (message) => {
    const result = await service.route(message);
    if (!result.ok || !result.reply) return null;
    return result.reply;
  });
  await channel.start();
}

console.log(`IM gateway 已启动：${channels.map((c) => `${c.platform}/${c.id}`).join(', ')}`);
console.log(`授权状态：${(['wechat', 'qq', 'feishu'] as const)
  .map((p) => `${p}=${gate.isEnabled(p) ? 'on' : 'off'}`)
  .join(' ')}（npm run im:gate -- enable <platform> 开启）`);

async function shutdown(): Promise<void> {
  for (const channel of channels) await channel.stop();
  closeMcpAgents(mcpAgents.clients);
  experienceManager.close();
  skillLifecycle.close();
  sourceStats.close();
  userContextStore.close();
  trajectoryLog.close();
  browserSession.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
