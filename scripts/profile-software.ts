#!/usr/bin/env node

import { join } from 'node:path';

import { discoverInstalledSoftware, inferProfessionFromSoftware } from '../src/memory/software-profile.js';
import { UserContextStore } from '../src/memory/user-context-store.js';

const args = process.argv.slice(2);
const userIndex = args.indexOf('--user');
const userId = userIndex >= 0 ? args[userIndex + 1] : 'cli-user';
const dryRun = args.includes('--dry-run');

if (!userId || userId.startsWith('--')) {
  console.error('用法：npm run profile:software -- [--user <userId>] [--dry-run]');
  process.exit(1);
}

const installedSoftware = discoverInstalledSoftware();
const suggestedRole = inferProfessionFromSoftware(installedSoftware);

if (dryRun) {
  console.log(JSON.stringify({
    userId,
    softwareCount: installedSoftware.length,
    installedSoftware,
    suggestedRole,
    persisted: false,
  }, null, 2));
  process.exit(0);
}

const store = new UserContextStore(join(process.cwd(), 'data', 'user-context.db'));
try {
  const result = store.syncInstalledSoftware(userId, installedSoftware);
  console.log(JSON.stringify({
    userId,
    installedSoftware: result.profile.installedSoftware,
    suggestedRole: result.suggestedRole,
    activeRole: result.profile.role,
    roleSource: result.profile.roleSource,
    roleUpdated: result.roleUpdated,
    persisted: true,
  }, null, 2));
} finally {
  store.close();
}
