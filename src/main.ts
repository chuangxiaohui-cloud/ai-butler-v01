#!/usr/bin/env node
import { pipeline } from './search/pipeline.js';
import { ExperienceManager } from './memory/experience.js';
import { SkillLifecycle } from './skills/lifecycle.js';
import { SearchSourceStats } from './search/source-stats.js';
import { UserContextStore } from './memory/user-context-store.js';
import { RouteCaseStore } from './agent/route-case-store.js';
import { createHeavyClient, createOptionalHeavyClient, createSkillHeavyClient, createVisionClient } from './search/llm.js';
import { SessionContextStore } from './memory/session-context.js';
import { handleSlashCommand, parseSlashCommand } from './slash/slash-commands.js';
import { parseDocumentFile } from './search/document-parser.js';
import type { SkillDeps } from './skills/deps.js';
import { TrajectoryLog } from './trajectory/trajectory-log.js';
import { browserSession } from './browser/session.js';
import { MarketSkillRunner } from './skills/market/runner.js';
import { bochaBalanceWarning, queryBochaBalance } from './search/balance.js';
import { closeMcpAgents, createMcpAgents } from './mcp/config.js';
import { SubAgentDispatcher } from './mcp/dispatcher.js';

const arg = process.argv[2];

if (!arg || arg === '--help' || arg === '-h') {
  console.log(JSON.stringify({
    usage: 'npm run dev -- "你的问题"',
    version: '0.1.0',
    output_format: 'structured_json',
    contract: 'answer(query) -> { answer, confidence, evidence[], gate_triggered }'
  }, null, 2));
  process.exit(arg ? 0 : 1);
}

const experienceManager = new ExperienceManager();
const skillLifecycle = new SkillLifecycle();
const sourceStats = new SearchSourceStats();
const userContextStore = new UserContextStore();
const routeCaseStore = new RouteCaseStore();
const trajectoryLog = new TrajectoryLog();
const sessionContext = new SessionContextStore();
// CLI 会话 ID：让 CLI 问答也进入 E193 上下文管理，/context 与 /compact 才能看到轮次。
const CLI_CONVERSATION_ID = 'cli';
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
process.on('exit', () => closeMcpAgents(mcpAgents.clients));
try {
  skillLifecycle.ensureRegistered();
} catch {
  // 技能注册失败不阻塞 CLI
}

async function warnBochaBalance(): Promise<void> {
  try {
    const balance = await queryBochaBalance();
    const warning = balance ? bochaBalanceWarning(balance) : null;
    if (warning) console.warn(`\n[预警] ${warning}\n`);
  } catch {
    // 余额探测失败不阻塞问答
  }
}


// P8：/context、/compact 等零网络斜杠命令跳过 Bocha 余额探测，白省一个 RTT+超时
const isSlashCommand = parseSlashCommand(arg) !== null;
const prelude: Promise<void> = isSlashCommand ? Promise.resolve() : warnBochaBalance();
prelude
  .then(() => handleSlashCommand(arg, CLI_CONVERSATION_ID, { sessionContext }))
  .then((slashResult) => {
    if (slashResult) {
      console.log(JSON.stringify(slashResult, null, 2));
      return null;
    }
    return pipeline(arg, {
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
  // E248 生产接线：已安装市场 Skill 触发词直连执行（复用率观察自此真实生效）
  marketSkillRunner: new MarketSkillRunner(),
  // H5：CLI 的 slash 与 pipeline 共用同一会话实例，避免双实例并发丢历史
  sessionContext,
}, {
  userId: 'cli-user',
  conversationId: CLI_CONVERSATION_ID,
});
})
  .then((result) => {
    if (!result) return;
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error(JSON.stringify({ error: err.message, stack: err.stack }, null, 2));
    process.exit(1);
  })
  .finally(() => {
    experienceManager.close();
    skillLifecycle.close();
    sourceStats.close();
    userContextStore.close();
    trajectoryLog.close(); // P15：关闭 JSONL 句柄
    browserSession.close();
    // E240：MCP 子进程 stdio pipe 会阻止事件循环退出，必须在流程结束主动 close
    closeMcpAgents(mcpAgents.clients);
  });
