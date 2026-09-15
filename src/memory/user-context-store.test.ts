import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildMemoryInjection } from './user-context.js';
import { DatabaseSync } from 'node:sqlite';

import { UserContextStore } from './user-context-store.js';
import {
  inferProfessionFromSoftware,
  parseWindowsDisplayNames,
} from './software-profile.js';

const DAY_MS = 24 * 3600 * 1000;

function tempDb(): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'user-context-test-'));
  return { path: join(dir, 'user-context.db'), dir };
}

test('user-context-store: profile/fact/session 往返 + 纠正覆盖', () => {
  const { path, dir } = tempDb();
  const store = new UserContextStore(path);
  try {
    const now = Date.now();
    store.saveProfile(
      'u1',
      {
        role: '一人公司创始人',
        currentProjects: ['短视频运营'],
        preferences: { replyStyle: 'secretary', tone: 'humorous' },
      },
      now,
    );
    store.addFact('u1', '用户喜欢周星驰', 'user_explicit', now);
    store.addFact('u1', '用户在学日语', 'inferred', now);
    store.addSessionSummary('u1', 's1', '讨论短视频选题', ['短视频', '选题'], now);

    const ctx = store.load('u1', now);
    assert.equal(ctx.profile.role, '一人公司创始人');
    assert.equal(ctx.profile.preferences.tone, 'humorous');
    assert.equal(ctx.longTermFacts.length, 2);
    assert.equal(ctx.recentSessions[0].topics[0], '短视频');

    store.correctMemoryFact('u1', '用户在学日语', '用户已完成日语 N4', now);
    const corrected = store.load('u1', now);
    assert.equal(corrected.longTermFacts.some((f) => f.content === '用户已完成日语 N4'), true);
    assert.equal(corrected.longTermFacts.some((f) => f.content === '用户在学日语'), false);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('user-context-store: 过期事实归档且不再加载', () => {
  const { path, dir } = tempDb();
  const store = new UserContextStore(path);
  try {
    const created = Date.now();
    store.addFact('u1', '低置信冷记忆', 'inferred', created, 0.4);
    const later = created + 100 * DAY_MS;
    assert.equal(store.archiveExpired('u1', later), 1);
    const ctx = store.load('u1', later);
    assert.equal(ctx.longTermFacts.length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('user-context-store: buildMemoryInjection 过滤低置信事实', () => {
  const { path, dir } = tempDb();
  const store = new UserContextStore(path);
  try {
    const now = Date.now();
    store.addFact('u1', '用户喜欢周星驰', 'user_explicit', now);
    store.addFact('u1', '临时推测', 'inferred', now);
    const ctx = store.load('u1', now);
    ctx.longTermFacts[1].confidence = 0.3;
    const injection = buildMemoryInjection(ctx);
    assert.ok(injection.includes('周星驰'));
    assert.ok(!injection.includes('临时推测'));
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('user-context-store: 数据库启用 WAL（P11 PRAGMA 落地）', () => {
  const { path, dir } = tempDb();
  const store = new UserContextStore(path);
  store.close();
  const db = new DatabaseSync(path);
  try {
    const mode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    assert.equal(mode.journal_mode, 'wal'); // WAL 持久化在库文件头，同批 busy_timeout 已随构造 exec 生效
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('user-context-store: archiveExpired 一次事务归档多条（P11）', () => {
  const { path, dir } = tempDb();
  const store = new UserContextStore(path);
  try {
    const created = Date.now();
    store.addFact('u1', '冷记忆1', 'inferred', created - 100 * DAY_MS, 0.4);
    store.addFact('u1', '冷记忆2', 'inferred', created - 100 * DAY_MS, 0.4);
    store.addFact('u1', '活跃记忆', 'user_explicit', created, 0.9);
    assert.equal(store.archiveExpired('u1', created), 2);
    const ctx = store.load('u1', created);
    assert.equal(ctx.longTermFacts.length, 1);
    assert.equal(ctx.longTermFacts[0].content, '活跃记忆');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('software-profile: 注册表输出去重且职业建议确定', () => {
  const output = `
HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Keil
    DisplayName    REG_SZ    Keil µVision5
HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\KiCad
    DisplayName    REG_SZ    KiCad 9.0
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\KiCad
    DisplayName    REG_SZ    KiCad 9.0
`;
  const software = parseWindowsDisplayNames(output);
  assert.deepEqual(software, ['Keil µVision5', 'KiCad 9.0']);
  assert.equal(inferProfessionFromSoftware(software), '嵌入式电子产品开发工程师');
  assert.equal(inferProfessionFromSoftware(['Vector CANoe 18']), '汽车制造工程师');
  assert.equal(inferProfessionFromSoftware(['Visual Studio Code']), '');
});

test('user-context-store: 软件画像可更新但不覆盖手工职业身份', () => {
  const { path, dir } = tempDb();
  const store = new UserContextStore(path);
  try {
    const first = store.syncInstalledSoftware('u1', ['KiCad 9.0', 'Keil µVision5']);
    assert.equal(first.roleUpdated, true);
    assert.equal(first.profile.role, '嵌入式电子产品开发工程师');
    assert.equal(first.profile.roleSource, 'software');
    assert.deepEqual(first.profile.installedSoftware, ['Keil µVision5', 'KiCad 9.0']);

    const automaticUpdate = store.syncInstalledSoftware('u1', ['Vector CANoe 18']);
    assert.equal(automaticUpdate.profile.role, '汽车制造工程师');
    assert.equal(automaticUpdate.profile.roleSource, 'software');

    const current = automaticUpdate.profile;
    store.saveProfile('u1', {
      ...current,
      role: '硬件产品负责人',
    });
    const second = store.syncInstalledSoftware('u1', ['Vector CANoe 18']);
    assert.equal(second.roleUpdated, false);
    assert.equal(second.suggestedRole, '汽车制造工程师');
    assert.equal(second.profile.role, '硬件产品负责人');
    assert.equal(second.profile.roleSource, 'manual');
    assert.deepEqual(second.profile.installedSoftware, ['Vector CANoe 18']);

    const reopened = store.load('u1');
    assert.equal(reopened.profile.suggestedRole, '汽车制造工程师');
    assert.deepEqual(reopened.profile.installedSoftware, ['Vector CANoe 18']);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('user-context-store: 旧 user_profile 表无损补齐软件画像列', () => {
  const { path, dir } = tempDb();
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE user_profile (
      user_id TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT '',
      current_projects TEXT NOT NULL DEFAULT '[]',
      reply_style TEXT NOT NULL DEFAULT 'secretary',
      tone TEXT NOT NULL DEFAULT 'professional',
      updated_at INTEGER NOT NULL
    );
    INSERT INTO user_profile VALUES ('legacy', '手工旧画像', '["旧项目"]', 'concise', 'casual', 1);
  `);
  db.close();

  const store = new UserContextStore(path);
  try {
    const profile = store.load('legacy').profile;
    assert.equal(profile.role, '手工旧画像');
    assert.equal(profile.roleSource, 'manual');
    assert.deepEqual(profile.installedSoftware, []);
    assert.equal(profile.suggestedRole, '');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('user-context-store: 人格事实保存真实 kind/layer，旧事实无损迁移为 general/L1', () => {
  const { path, dir } = tempDb();
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE user_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at INTEGER NOT NULL,
      last_accessed_at INTEGER NOT NULL,
      review_count INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, content)
    );
    INSERT INTO user_facts
      (user_id, content, source, confidence, created_at, last_accessed_at)
    VALUES ('legacy', '旧事实', 'user_explicit', 0.9, 1, 1);
  `);
  db.close();

  const store = new UserContextStore(path);
  try {
    store.addFact('legacy', '我偏好 STM32 平台和 Keil 工具链', 'user_explicit', 2);
    const facts = store.listFacts('legacy');
    const legacy = facts.find((fact) => fact.content === '旧事实');
    const technical = facts.find((fact) => fact.content.includes('STM32'));
    assert.equal(legacy?.kind, 'general');
    assert.equal(legacy?.layer, 'L1');
    assert.equal(legacy?.scope, 'global');
    assert.equal(legacy?.conflictKey, '');
    assert.equal(technical?.kind, 'technical_preference');
    assert.equal(technical?.layer, 'L2');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('user-context-store: 同栏新偏好覆盖旧值，当前栏优先于 global 且隔离其他栏', () => {
  const { path, dir } = tempDb();
  const store = new UserContextStore(path);
  try {
    store.addFact('u1', '我偏好 KiCad EDA', 'user_explicit');
    store.addFact('u1', '我偏好 Altium EDA', 'user_explicit', 2, undefined, 'knowledge');
    store.addFact('u1', '我偏好 EasyEDA EDA', 'user_explicit', 3, undefined, 'knowledge');
    store.addFact('u1', '用户喜欢周星驰', 'user_explicit', 4, undefined, 'knowledge');
    store.addFact('u1', '用户喜欢唐伯虎点秋香', 'user_explicit', 5, undefined, 'knowledge');

    const knowledge = store.load('u1', 6, 'knowledge').longTermFacts;
    assert.equal(knowledge.some((fact) => fact.content.includes('Altium')), false);
    assert.equal(knowledge.some((fact) => fact.content.includes('KiCad')), false);
    assert.equal(knowledge.some((fact) => fact.content.includes('EasyEDA')), true);
    assert.equal(knowledge.filter((fact) => fact.kind === 'general').length, 2);

    const life = store.load('u1', 6, 'life').longTermFacts;
    assert.equal(life.some((fact) => fact.content.includes('KiCad')), true);
    assert.equal(life.some((fact) => fact.content.includes('EasyEDA')), false);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('user-context-store: 时间敏感事实过期后保留但注入重新确认提示', () => {
  const { path, dir } = tempDb();
  const store = new UserContextStore(path);
  try {
    const created = Date.now();
    store.addFact('u1', 'STM32F103 当前库存还有 120 片', 'user_explicit', created);
    store.addFact('u1', '用户偏好 KiCad EDA', 'user_explicit', created);

    const current = store.load('u1', created + 89 * DAY_MS);
    assert.equal(current.longTermFacts.find((fact) => fact.content.includes('库存'))?.stale, false);

    const later = store.load('u1', created + 90 * DAY_MS);
    const inventory = later.longTermFacts.find((fact) => fact.content.includes('库存'));
    const preference = later.longTermFacts.find((fact) => fact.content.includes('KiCad'));
    assert.equal(inventory?.temporalKind, 'inventory');
    assert.equal(inventory?.stale, true);
    assert.equal(preference?.temporalKind, null);
    assert.equal(preference?.stale, false);
    assert.match(buildMemoryInjection(later), /可能已过时，建议重新确认.*库存/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('user-context-store: 纠正事实重算时效元数据，旧表无损补列', () => {
  const { path, dir } = tempDb();
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE user_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at INTEGER NOT NULL,
      last_accessed_at INTEGER NOT NULL,
      review_count INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, content)
    );
    INSERT INTO user_facts
      (user_id, content, source, confidence, created_at, last_accessed_at)
    VALUES ('legacy', '当前库存为 10 片', 'user_explicit', 0.9, 1, 1);
  `);
  db.close();

  const store = new UserContextStore(path);
  try {
    const legacy = store.listFacts('legacy', undefined, 2)[0];
    assert.equal(legacy.temporalKind, 'inventory');
    assert.equal(legacy.expiresAt, 1 + 90 * DAY_MS);
    assert.equal(legacy.stale, false);

    store.correctMemoryFact('legacy', '当前库存为 10 片', '当前报价为每片 18 元', 10);
    const corrected = store.listFacts('legacy', undefined, 10)[0];
    assert.equal(corrected.temporalKind, 'price');
    assert.equal(corrected.stale, false);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
