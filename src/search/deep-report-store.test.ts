import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DeepReportStore } from './deep-report-store.js';

function makeStore() {
  const dir = mkdtempSync(join(tmpdir(), 'dr-store-'));
  const store = new DeepReportStore(join(dir, 'jobs.jsonl'));
  return { store, dir };
}

test('deep-report-store: 空库无 resumable', () => {
  const { store, dir } = makeStore();
  try {
    assert.equal(store.findResumable('STM32 调研'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deep-report-store: 取消后同 query 命中最新 cancelled job，含已生成分节', () => {
  const { store, dir } = makeStore();
  try {
    const jobId = store.start('STM32 调研', 3);
    store.appendSection(jobId, '## 概述\n\n正文');
    store.appendSection(jobId, '## 关键发现\n\n正文');
    store.markCancelled(jobId);

    const resumable = store.findResumable('STM32 调研');
    assert.ok(resumable, '取消后应可恢复');
    assert.equal(resumable.sections.length, 2);
    assert.equal(resumable.status, 'cancelled');
    assert.ok(resumable.sections[0].startsWith('## 概述'));
    assert.equal(resumable.evidenceCount, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deep-report-store: 完成后不可恢复；不同 query 不命中', () => {
  const { store, dir } = makeStore();
  try {
    const jobId = store.start('STM32 调研', 1);
    store.appendSection(jobId, '## 概述\n\n正文');
    store.markDone(jobId);
    assert.equal(store.findResumable('STM32 调研'), null, 'done 不参与恢复');

    const otherId = store.start('ESP32 调研', 1);
    store.appendSection(otherId, '## 概述\n\n正文');
    store.markCancelled(otherId);
    assert.equal(store.findResumable('STM32 调研'), null, '不同 query 不命中');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deep-report-store: 恢复继承 sections，最新 cancelled 优先', () => {
  const { store, dir } = makeStore();
  try {
    const first = store.start('STM32 调研', 2);
    store.appendSection(first, '## 第一节\n\n旧内容');
    store.markCancelled(first);

    const resumed = store.findResumable('STM32 调研');
    assert.ok(resumed);
    const second = store.start('STM32 调研', 5, resumed);
    assert.notEqual(second, first, '恢复是新 job，保留审计历史');

    // 恢复时旧 job 已收编为 done，findResumable 不再命中
    assert.equal(store.findResumable('STM32 调研'), null);

    // 恢复时旧 job 收编为 done；second 取消后成为最新 cancelled
    store.appendSection(second, '## 第一节\n\n新内容');
    store.markCancelled(second);
    const latest = store.findResumable('STM32 调研');
    assert.equal(latest?.jobId, second, '最新 cancelled 优先');
    assert.equal(latest?.sections.length, 2, '继承 + 新生成');
    assert.equal(latest?.sections[0], '## 第一节\n\n旧内容');
    assert.equal(latest?.sections[1], '## 第一节\n\n新内容');
    assert.equal(latest?.stage, 'sections');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deep-report-store: 失败任务不参与恢复；落盘可重载', () => {
  const { store, dir } = makeStore();
  try {
    const jobId = store.start('STM32 调研', 1);
    store.appendSection(jobId, '## 概述\n\n正文');
    store.markFailed(jobId);
    assert.equal(store.findResumable('STM32 调研'), null, 'failed 不参与恢复');

    // 重新实例化读同一文件（模拟进程重启）
    const reloaded = new DeepReportStore(join(dir, 'jobs.jsonl'));
    assert.equal(reloaded.findResumable('STM32 调研'), null);
    assert.ok(existsSync(join(dir, 'jobs.jsonl')), '落盘文件存在');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
