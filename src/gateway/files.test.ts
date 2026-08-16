import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { listProjectFiles } from './files.js';

test('files: 只扫描沙箱根目录，跳过 node_modules', () => {
  const dir = mkdtempSync(join(tmpdir(), 'files-'));
  try {
    mkdirSync(join(dir, 'projects', 'p1'), { recursive: true });
    mkdirSync(join(dir, 'data', 'datasheets'), { recursive: true });
    mkdirSync(join(dir, 'projects', 'node_modules'), { recursive: true });
    writeFileSync(join(dir, 'projects', 'p1', 'a.kicad_sch'), 'x');
    writeFileSync(join(dir, 'data', 'datasheets', 'b.pdf'), 'y');
    writeFileSync(join(dir, 'projects', 'node_modules', 'skip.txt'), 'z');
    writeFileSync(join(dir, 'outside.txt'), 'no');

    const files = listProjectFiles(dir, 50, 3);
    const paths = files.map((f) => f.path);
    assert.ok(paths.includes('projects/p1/a.kicad_sch'));
    assert.ok(paths.includes('data/datasheets/b.pdf'));
    assert.ok(!paths.some((p) => p.includes('node_modules')));
    assert.ok(!paths.some((p) => p.includes('outside.txt')));
    assert.equal(files.find((f) => f.path === 'projects/p1/a.kicad_sch')?.kind, '原理图/PCB');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
