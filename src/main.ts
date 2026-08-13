#!/usr/bin/env node
import { pipeline } from './search/pipeline.js';
import { ExperienceManager } from './memory/experience.js';
import { SkillLifecycle } from './skills/lifecycle.js';

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
try {
  skillLifecycle.ensureRegistered();
} catch {
  // 技能注册失败不阻塞 CLI
}

pipeline(arg, {
  tavily: { enabled: true },
  experienceManager,
  skillLifecycle,
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
  });
