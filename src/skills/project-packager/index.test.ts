import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    const zipPath = result.match(/([A-Za-z]:\\[^\s（]+\.zip)/)?.[1];
    assert.ok(zipPath, '应返回 zip 路径');
    assert.ok(existsSync(zipPath), 'zip 文件应存在');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
