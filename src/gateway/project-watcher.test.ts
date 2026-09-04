import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  diffSnapshots,
  snapshotProjects,
  startProjectWatcher,
  type ProjectChange,
} from './project-watcher.js';

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'project-watcher-'));
  mkdirSync(join(dir, 'projects'), { recursive: true });
  return dir;
}

test('project-watcher: snapshotProjects 只取 projects/ 且剔除编辑器临时文件', () => {
  const dir = makeWorkspace();
  try {
    mkdirSync(join(dir, 'sandbox'), { recursive: true });
    writeFileSync(join(dir, 'projects', 'a.txt'), 'a');
    writeFileSync(join(dir, 'projects', 'sub'), 'x'); // 非目录文件在 projects 下也纳入
    writeFileSync(join(dir, 'sandbox', 'b.txt'), 'b');
    writeFileSync(join(dir, 'projects', '~$note.docx'), 'temp');
    writeFileSync(join(dir, 'projects', 'draft.tmp'), 'temp');
    const snap = snapshotProjects(dir);
    assert.deepEqual(
      snap.map((f) => f.path).sort(),
      ['projects/a.txt', 'projects/sub'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('project-watcher: diffSnapshots 区分新增/修改(大小或 mtime)/删除且按路径排序', () => {
  const m1 = 1_000_000;
  const stamp = (path: string, size: number, mtime: number) => ({ path, size, mtime });
  const prev = [stamp('projects/a.txt', 1, m1), stamp('projects/old.txt', 2, m1)];
  const next = [
    stamp('projects/a.txt', 2, m1), // size 变化 → modified
    stamp('projects/b.txt', 1, m1), // 新增
    stamp('projects/c.txt', 1, m1 + 5000), // 新增
  ];
  const changes = diffSnapshots(prev, next);
  assert.deepEqual(changes, [
    { path: 'projects/a.txt', kind: 'modified' },
    { path: 'projects/b.txt', kind: 'added' },
    { path: 'projects/c.txt', kind: 'added' },
    { path: 'projects/old.txt', kind: 'removed' },
  ]);
  // 完全相同 → 无变更
  assert.deepEqual(diffSnapshots([stamp('projects/x', 1, m1)], [stamp('projects/x', 1, m1)]), []);
  // mtime 变化 → modified
  assert.deepEqual(
    diffSnapshots([stamp('projects/x', 1, m1)], [stamp('projects/x', 1, m1 + 2000)]),
    [{ path: 'projects/x', kind: 'modified' }],
  );
});

test('project-watcher: startProjectWatcher 轮询广播新增/修改/删除，stop 后停止', async () => {
  const dir = makeWorkspace();
  const seen: ProjectChange[][] = [];
  const watcher = startProjectWatcher({
    workspaceRoot: dir,
    intervalMs: 30,
    onChange: (changes) => seen.push(changes),
  });
  const waitFor = async (predicate: () => boolean, ms = 3000): Promise<void> => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    assert.fail('timed out waiting for watcher event');
  };
  const all = () => seen.flat();
  try {
    const a = join(dir, 'projects', 'a.txt');
    writeFileSync(a, 'hello');
    await waitFor(() => all().some((c) => c.path === 'projects/a.txt' && c.kind === 'added'));

    // 同长内容改写只改 mtime → modified
    const future = new Date(Date.now() + 10_000);
    writeFileSync(a, 'world');
    utimesSync(a, future, future);
    await waitFor(() => all().some((c) => c.path === 'projects/a.txt' && c.kind === 'modified'));

    // 编辑器临时文件不触发
    const beforeTemp = all().length;
    writeFileSync(join(dir, 'projects', '~$note.docx'), 'x');
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(all().length, beforeTemp);

    // 删除 → removed
    rmSync(a);
    await waitFor(() => all().some((c) => c.path === 'projects/a.txt' && c.kind === 'removed'));

    // stop 后不再广播
    watcher.stop();
    const beforeStop = all().length;
    writeFileSync(join(dir, 'projects', 'after-stop.txt'), 'x');
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(all().length, beforeStop);
  } finally {
    watcher.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
