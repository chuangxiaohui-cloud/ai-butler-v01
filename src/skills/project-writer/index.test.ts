import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createProjectWriterSkill } from './index.js';

function tempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'project-writer-test-'));
}

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
    const logText = readFileSync(join(dir, 'operations.jsonl'), 'utf-8');
    assert.ok(logText.includes('main.c'));
  } finally {
    process.env.SANDBOX_ALLOWED_DIRS = old;
    process.env.OPERATIONS_LOG_PATH = oldLog;
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
