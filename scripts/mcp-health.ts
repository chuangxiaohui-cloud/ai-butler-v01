import { closeMcpAgents, createMcpAgents, loadMcpAgentConfig } from '../src/mcp/config.js';
import { checkMcpAgentHealth } from '../src/mcp/health.js';

const entries = loadMcpAgentConfig();
const { metas, clients } = createMcpAgents(entries);

try {
  const results = [];
  for (const meta of metas) {
    const client = clients.get(meta.id);
    if (client) results.push(await checkMcpAgentHealth(meta, client));
  }
  const skipped = entries
    .filter((entry) => !metas.some((meta) => meta.id === entry.id))
    .map((entry) => entry.id);
  const ok = entries.length > 0 && results.length > 0 && skipped.length === 0 && results.every((r) => r.ok);
  console.log(JSON.stringify({ ok, configured: entries.length, checked: results.length, skipped, results }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  closeMcpAgents(clients);
}
