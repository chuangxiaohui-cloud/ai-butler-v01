import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeJsonl, readJsonlCached } from '../log/jsonl.js';
import { logPushEvent, type PushAuditEntry } from './push-audit.js';

function tmpPath() {
  const dir = mkdtempSync(join(tmpdir(), 'repo-audit-'));
  return { dir, file: join(dir, 'push-events.jsonl') };
}

test('push-audit: 每次 push 写 JSONL 审计事件（ts + 字段，§11.3/§11.4）', () => {
  const { dir, file } = tmpPath();
  try {
    logPushEvent(
      {
        host: 'github.com',
        owner: 'chuangxiaohui-cloud',
        repo: 'ai-butler-v01',
        branch: 'v0.2b',
        commit: 'abc123',
        url: 'https://github.com/chuangxiaohui-cloud/ai-butler-v01',
        ok: true,
      },
      file,
    );
    const entries = readJsonlCached<PushAuditEntry>(file, (line) => JSON.parse(line) as PushAuditEntry);
    assert.equal(entries.length, 1);
    assert.match(entries[0]?.ts ?? '', /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(entries[0]?.ok, true);
    assert.equal(entries[0]?.commit, 'abc123');
    assert.equal(entries[0]?.host, 'github.com');
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('push-audit: 失败条目含 error/conflict 且不写 token', () => {
  const { dir, file } = tmpPath();
  try {
    logPushEvent(
      { host: 'gitee.com', owner: 'cxv138', repo: 'hw', branch: 'main', ok: false, conflict: true, error: 'non-fast-forward' },
      file,
    );
    const entries = readJsonlCached<PushAuditEntry>(file, (line) => JSON.parse(line) as PushAuditEntry);
    assert.equal(entries[0]?.ok, false);
    assert.equal(entries[0]?.conflict, true);
    assert.equal(entries[0]?.error, 'non-fast-forward');
    const raw = readFileSync(file, 'utf-8');
    assert.equal(raw.includes('token'), false, '审计日志不落 token');
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});
