import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { createProjectPackagerSkill } from './index.js';

test('project-packager: 无路径时请求补充目录', async () => {
  const skill = createProjectPackagerSkill();
  const out = await skill.execute(
    {
      query: '把这个项目打包发给我',
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
    },
    { callVLM: async () => '' },
  );
  const result = out.result as string;
  assert.ok(result.includes('打包'));
  assert.ok(result.includes('目录'));
});

test('project-packager: 存在目录时生成 zip（Windows）', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('需要 Windows PowerShell Compress-Archive');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'pack-test-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'main.c'), 'int main(void){return 0;}\n');
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'node_modules', 'x.js'), 'x');
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, '.git', 'config'), 'fake');
  mkdirSync(join(dir, 'build'));
  writeFileSync(join(dir, 'build', 'out.bin'), 'binary');
  const extractDir = mkdtempSync(join(tmpdir(), 'pack-extract-'));
  let zipPath: string | null = null;
  try {
    const skill = createProjectPackagerSkill();
    const out = await skill.execute(
      {
        query: `打包 ${dir}`,
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as string;
    assert.ok(result.includes('已打包'));
    zipPath = result.match(/([A-Za-z]:\\[^\s（]+\.zip)/)?.[1] ?? null;
    assert.ok(zipPath, '应返回 zip 路径');
    assert.ok(existsSync(zipPath), 'zip 文件应存在');
    const expanded = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractDir}' -Force`,
      ],
      { encoding: 'utf-8' },
    );
    assert.equal(expanded.status, 0, expanded.stderr);
    assert.ok(existsSync(join(extractDir, 'src', 'main.c')), 'zip 应包含正常源码');
    assert.ok(!existsSync(join(extractDir, 'node_modules')), 'zip 不应包含 node_modules');
    assert.ok(!existsSync(join(extractDir, '.git')), 'zip 不应包含 .git');
    assert.ok(!existsSync(join(extractDir, 'build')), 'zip 不应包含 build');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(extractDir, { recursive: true, force: true });
    if (zipPath) rmSync(zipPath, { force: true });
  }
});
