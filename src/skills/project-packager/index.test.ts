import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import JSZip from 'jszip';

import { createProjectPackagerSkill } from './index.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'pack-test-'));
}

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
  const root = tempDir();
  const dir = join(root, 'projects', 'demo');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'main.c'), 'int main(void){return 0;}\n');
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'node_modules', 'x.js'), 'x');
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, '.git', 'config'), 'fake');
  mkdirSync(join(dir, 'build'));
  writeFileSync(join(dir, 'build', 'out.bin'), 'binary');
  let zipPath: string | null = null;
  try {
    const skill = createProjectPackagerSkill({ cwd: root, zipDir: join(root, 'data', 'packs') });
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
    const zip = await JSZip.loadAsync(readFileSync(zipPath));
    assert.ok(zip.file('src/main.c'), 'zip 应包含正常源码');
    assert.equal(zip.file('node_modules/x.js'), null, 'zip 不应包含 node_modules');
    assert.equal(zip.file('.git/config'), null, 'zip 不应包含 .git');
    assert.equal(zip.file('build/out.bin'), null, 'zip 不应包含 build');
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (zipPath) rmSync(zipPath, { force: true });
  }
});

test('project-packager: 越界目录（含 .env/data 聚合面）拒绝并写审计', async () => {
  const root = tempDir();
  const outside = join(root, 'sibling');
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'secret.txt'), 'top-secret');
  const auditPath = join(process.cwd(), 'data', 'audit-sandbox.jsonl');
  try {
    const skill = createProjectPackagerSkill({ cwd: root, zipDir: join(root, 'data', 'packs') });
    const out = await skill.execute(
      {
        query: `打包 ${outside}`,
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as string;
    assert.ok(result.includes('沙箱白名单'), `应拒绝越界，实际：${result}`);
    if (existsSync(auditPath)) {
      const audit = readFileSync(auditPath, 'utf-8');
      assert.ok(audit.includes('sibling'), '应写审计日志');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project-packager: 排除 .env 与 data/（H2 凭据聚合面）', async () => {
  const root = tempDir();
  const dir = join(root, 'projects', 'env-demo');
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(join(dir, 'data', 'mail-credentials.json'), '{"pass":"secret"}');
  writeFileSync(join(dir, '.env'), 'DEEPSEEK_API_KEY=sk-secret');
  writeFileSync(join(dir, '.env.local'), 'TAVILY_API_KEY=tv-secret');
  writeFileSync(join(dir, 'main.c'), 'int main(void){return 0;}');
  let zipPath: string | null = null;
  try {
    const skill = createProjectPackagerSkill({ cwd: root, zipDir: join(root, 'data', 'packs') });
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
    assert.ok(zipPath);
    const zip = await JSZip.loadAsync(readFileSync(zipPath));
    assert.ok(zip.file('main.c'), 'zip 应包含源码');
    assert.equal(zip.file('.env'), null, 'zip 不应包含 .env');
    assert.equal(zip.file('.env.local'), null, 'zip 不应包含 .env.local');
    assert.equal(zip.file('data/mail-credentials.json'), null, 'zip 不应包含 data/');
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (zipPath) rmSync(zipPath, { force: true });
  }
});

test('project-packager: 目录名含单引号/分号也能打包（H1 注入回归）', async () => {
  const root = tempDir();
  const dir = join(root, 'projects', "my'proj;ect");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'a.c'), 'int a;');
  let zipPath: string | null = null;
  try {
    const skill = createProjectPackagerSkill({ cwd: root, zipDir: join(root, 'data', 'packs') });
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
    assert.ok(result.includes('已打包'), `应正常打包，实际：${result}`);
    zipPath = result.match(/([A-Za-z]:\\[^\s（]+\.zip)/)?.[1] ?? null;
    assert.ok(zipPath);
    const zip = await JSZip.loadAsync(readFileSync(zipPath));
    assert.ok(zip.file('a.c'), 'zip 应包含源码');
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (zipPath) rmSync(zipPath, { force: true });
  }
});
