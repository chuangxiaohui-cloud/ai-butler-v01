#!/usr/bin/env node
import { pipeline } from './search/pipeline.js';

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

pipeline(arg)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error(JSON.stringify({ error: err.message, stack: err.stack }, null, 2));
    process.exit(1);
  });
