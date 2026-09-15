import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  createProjectWriterSkill,
  parseStructuredProjectChanges,
  prepareProjectWriterTransactionPreview,
} from './index.js';

function tempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'project-writer-test-'));
}

test('project-writer: 结构化多文件清单 prepare 后返回无正文确认卡且目标零写入', () => {
  const dir = tempWorkspace();
  const old = process.env.SANDBOX_ALLOWED_DIRS;
  process.env.SANDBOX_ALLOWED_DIRS = dir;
  try {
    const first = join(dir, 'projects', 'demo', 'a.txt');
    const second = join(dir, 'projects', 'demo', 'b.txt');
    mkdirSync(join(dir, 'projects', 'demo'), { recursive: true });
    writeFileSync(first, 'old-a', 'utf-8');
    const preview = prepareProjectWriterTransactionPreview(
      {
        query: '写入多个文件',
        params: {
          fileChanges: [
            { path: first, content: 'secret-new-a' },
            { path: second, content: 'secret-new-b' },
          ],
        },
      },
      { cwd: dir, snapshotRoot: join(dir, 'data', 'writer-transactions') },
    );
    assert.equal(preview.matched, true);
    assert.equal(preview.ok, true);
    if (!preview.matched || !preview.ok) return;
    assert.equal(readFileSync(first, 'utf-8'), 'old-a');
    assert.equal(existsSync(second), false);
    assert.ok(existsSync(preview.transaction.manifestPath));
    assert.deepEqual(
      (preview.artifact.data.changes as Array<{ action: string }>).map((item) => item.action),
      ['update', 'create'],
    );
    const serialized = JSON.stringify(preview.artifact);
    assert.doesNotMatch(serialized, /secret-new-a|secret-new-b/);
    assert.equal(preview.artifact.data.defaultChoice, 'cancel_all');
  } finally {
    if (old === undefined) delete process.env.SANDBOX_ALLOWED_DIRS;
    else process.env.SANDBOX_ALLOWED_DIRS = old;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('project-writer: fenced JSON 多文件输入可解析且非法重复路径整批拒绝', () => {
  const dir = tempWorkspace();
  const old = process.env.SANDBOX_ALLOWED_DIRS;
  process.env.SANDBOX_ALLOWED_DIRS = dir;
  try {
    const target = join(dir, 'projects', 'demo', 'a.txt');
    const query = `请写入多个文件\n\`\`\`json\n${JSON.stringify({
      files: [
        { path: target, content: 'one' },
        { path: join(dir, 'projects', 'demo', 'b.txt'), content: 'two' },
      ],
    })}\n\`\`\``;
    const parsed = parseStructuredProjectChanges({ query });
    assert.equal(parsed.matched, true);
    assert.equal(parsed.ok, true);
    const duplicate = prepareProjectWriterTransactionPreview(
      {
        query: '写入多个文件',
        params: {
          fileChanges: [
            { path: target, content: 'one' },
            { path: target, content: 'two' },
          ],
        },
      },
      { cwd: dir, snapshotRoot: join(dir, 'data', 'writer-transactions') },
    );
    assert.equal(duplicate.matched, true);
    assert.equal(duplicate.ok, false);
    assert.match(duplicate.matched && !duplicate.ok ? duplicate.error : '', /重复路径/);
    assert.equal(existsSync(join(dir, 'data', 'writer-transactions')), false);
  } finally {
    if (old === undefined) delete process.env.SANDBOX_ALLOWED_DIRS;
    else process.env.SANDBOX_ALLOWED_DIRS = old;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('project-writer: 缺路径时请求工程信息', async () => {
  const skill = createProjectWriterSkill();
  const out = await skill.execute(
    { query: '按你说的在我的工程里加上', attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '' },
  );
  const result = out.result as { answer?: string };
  assert.ok(result.answer?.includes('工程路径'));
});

test('project-writer: 有路径但缺内容时请求内容', async () => {
  const skill = createProjectWriterSkill();
  const out = await skill.execute(
    { query: '写入 M:/projects/demo/src/main.c', attachmentSignals: [], rawFiles: [], memory: null },
    { callVLM: async () => '' },
  );
  const result = out.result as { answer?: string };
  assert.ok(result.answer?.includes('上一轮'));
});

test('project-writer: 沙箱外路径拒绝写入', async () => {
  const dir = tempWorkspace();
  const old = process.env.SANDBOX_ALLOWED_DIRS;
  process.env.SANDBOX_ALLOWED_DIRS = dir;
  try {
    const skill = createProjectWriterSkill({ cwd: dir });
    const out = await skill.execute(
      {
        query: '写入 C:/Windows/system32/x.txt，内容：bad',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('沙箱白名单'));
  } finally {
    process.env.SANDBOX_ALLOWED_DIRS = old;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('project-writer: 覆盖前备份并写入新内容', async () => {
  const dir = tempWorkspace();
  const old = process.env.SANDBOX_ALLOWED_DIRS;
  const oldLog = process.env.OPERATIONS_LOG_PATH;
  process.env.SANDBOX_ALLOWED_DIRS = dir;
  process.env.OPERATIONS_LOG_PATH = join(dir, 'operations.jsonl');
  try {
    const target = join(dir, 'src', 'main.c');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(target, 'old', 'utf-8');
    const skill = createProjectWriterSkill({ cwd: dir });
    const out = await skill.execute(
      {
        query: `写入 ${target}，内容：int main(void){return 0;}`,
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; path?: string; backup?: string | null };
    assert.ok(result.answer?.includes('已写入'));
    assert.ok(result.backup, '应生成备份');
    assert.ok(result.answer?.includes('写入校验：内容一致'));
    assert.ok(result.answer?.includes('原文件已备份'));
    assert.ok(existsSync(result.backup as string));
    assert.equal(readFileSync(target, 'utf-8'), 'int main(void){return 0;}');
    assert.equal(readFileSync(result.backup as string, 'utf-8'), 'old');
    assert.equal(readdirSync(join(dir, 'src')).some((name) => name.includes('.tmp-')), false);
    const logText = readFileSync(join(dir, 'operations.jsonl'), 'utf-8');
    assert.ok(logText.includes('main.c'));
  } finally {
    process.env.SANDBOX_ALLOWED_DIRS = old;
    if (oldLog === undefined) delete process.env.OPERATIONS_LOG_PATH;
    else process.env.OPERATIONS_LOG_PATH = oldLog;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('project-writer: 原子替换失败时恢复被覆盖文件并记录自动回滚', async () => {
  const dir = tempWorkspace();
  const oldAllowed = process.env.SANDBOX_ALLOWED_DIRS;
  const oldLog = process.env.OPERATIONS_LOG_PATH;
  process.env.SANDBOX_ALLOWED_DIRS = dir;
  process.env.OPERATIONS_LOG_PATH = join(dir, 'operations.jsonl');
  const target = join(dir, 'src', 'main.c');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(target, 'old', 'utf-8');
  try {
    const skill = createProjectWriterSkill({
      cwd: dir,
      replaceFile: (from, to) => {
        writeFileSync(to, 'partial', 'utf-8');
        throw new Error(`replace failed: ${from}`);
      },
    });
    const out = await skill.execute(
      {
        query: `写入 ${target}，内容：new`,
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('写入失败，已自动回滚'), result.answer);
    assert.equal(readFileSync(target, 'utf-8'), 'old');
    assert.equal(readdirSync(join(dir, 'src')).some((name) => name.includes('.tmp-')), false);
    assert.match(readFileSync(join(dir, 'operations.jsonl'), 'utf-8'), /"status":"rolled_back"/);
  } finally {
    process.env.SANDBOX_ALLOWED_DIRS = oldAllowed;
    if (oldLog === undefined) delete process.env.OPERATIONS_LOG_PATH;
    else process.env.OPERATIONS_LOG_PATH = oldLog;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('project-writer: 新建文件替换失败时删除残留', async () => {
  const dir = tempWorkspace();
  const old = process.env.SANDBOX_ALLOWED_DIRS;
  process.env.SANDBOX_ALLOWED_DIRS = dir;
  const target = join(dir, 'src', 'new.c');
  try {
    const skill = createProjectWriterSkill({
      cwd: dir,
      replaceFile: (_from, to) => {
        writeFileSync(to, 'partial', 'utf-8');
        throw new Error('replace failed');
      },
    });
    const out = await skill.execute(
      {
        query: `写入 ${target}，内容：new`,
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('写入失败，已自动回滚'), result.answer);
    assert.equal(existsSync(target), false);
  } finally {
    process.env.SANDBOX_ALLOWED_DIRS = old;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('project-writer: 缺内容时从上一轮记忆取代码并校验', async () => {
  const dir = tempWorkspace();
  const old = process.env.SANDBOX_ALLOWED_DIRS;
  process.env.SANDBOX_ALLOWED_DIRS = dir;
  try {
    const target = join(dir, 'src', 'adc.c');
    const skill = createProjectWriterSkill({ cwd: dir });
    const out = await skill.execute(
      {
        query: `写入 ${target}`,
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        workingMemory: [
          {
            query: 'STM32 的 ADC 怎么配置？',
            answer: '```c\nint main(void){return 0;}\n```',
          },
        ],
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; verified?: boolean };
    assert.ok(result.answer?.includes('已写入'));
    assert.ok(result.answer?.includes('已使用上一轮生成内容'));
    assert.ok(result.answer?.includes('写入校验：内容一致'));
    assert.ok(result.answer?.includes('无原文件可备份'));
    assert.equal(result.verified, true);
    assert.equal(readFileSync(target, 'utf-8'), 'int main(void){return 0;}');
  } finally {
    process.env.SANDBOX_ALLOWED_DIRS = old;
    rmSync(dir, { recursive: true, force: true });
  }
});
