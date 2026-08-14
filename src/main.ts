#!/usr/bin/env node
import { pipeline } from './search/pipeline.js';
import { ExperienceManager } from './memory/experience.js';
import { SkillLifecycle } from './skills/lifecycle.js';
import { SearchSourceStats } from './search/source-stats.js';
import { UserContextStore } from './memory/user-context-store.js';
import { RouteCaseStore } from './agent/route-case-store.js';
import { createHeavyClient, createVisionClient } from './search/llm.js';
import { parseDocumentFile } from './search/document-parser.js';
import type { SkillDeps } from './skills/deps.js';
import { TrajectoryLog } from './trajectory/trajectory-log.js';

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
  // 技能注册失败不阻塞 CLI
}

pipeline(arg, {
  tavily: { enabled: true },
  experienceManager,
  skillLifecycle,
  sourceStats,
  userContextStore,
  routeCaseStore,
  skillDeps,
  trajectory: trajectoryLog,
}, {
  userId: 'cli-user',
})
  .then((result) => {
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
  });
