import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseTimeExpression } from '../../agent/time-expression.js';
import { ReminderStore } from '../../reminder/reminder-store.js';
import { createCalendarSkill } from './index.js';

test('calendar-skill: 创建日程并查询', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  process.env.REMINDERS_DB_PATH = join(dir, 'reminders.db');
  const skill = createCalendarSkill({ dbPath: join(dir, 'calendar.db') });
  const deps = { callVLM: async () => '' };
  try {
    const created = await skill.execute(
      {
        query: '帮我安排明天上午十点的会议',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'create_calendar' },
      },
      deps,
    );
    const result = created.result as string;
    assert.ok(result.includes('已创建日程'));
    assert.ok(result.includes('明天上午十点'));

    const listed = await skill.execute(
      {
        query: '查一下我今天的日程',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'local_query' },
      },
      deps,
    );
    const listedResult = listed.result as string;
    assert.ok(listedResult.includes('共 1 条日程'));
  } finally {
    delete process.env.REMINDERS_DB_PATH;
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('calendar-skill: 创建日程自动登记提醒（提前量）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  const remindersPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = remindersPath;
  const skill = createCalendarSkill({ dbPath: join(dir, 'calendar.db') });
  try {
    const created = await skill.execute(
      {
        query: '帮我安排明天下午3点的周会，提前10分钟提醒',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'create_calendar' },
      },
      { callVLM: async () => '' },
    );
    const result = created.result as string;
    assert.ok(result.includes('已创建日程'));
    assert.ok(result.includes('已同步设置提醒'));

    const store = new ReminderStore(remindersPath);
    try {
      const reminders = store.list('default');
      assert.equal(reminders.length, 1);
      assert.ok(reminders[0].message.includes('周会'));
      const { startAt } = parseTimeExpression('明天下午3点');
      assert.equal(reminders[0].remindAt, Date.parse(startAt) - 10 * 60_000);
    } finally {
      store.close();
    }
  } finally {
    delete process.env.REMINDERS_DB_PATH;
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('calendar-skill: 查询日程显示提醒状态', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  process.env.REMINDERS_DB_PATH = join(dir, 'reminders.db');
  const skill = createCalendarSkill({ dbPath: join(dir, 'calendar.db') });
  const deps = { callVLM: async () => '' };
  try {
    await skill.execute(
      {
        query: '帮我安排明天上午十点的会议',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'create_calendar' },
      },
      deps,
    );
    const listed = await skill.execute(
      {
        query: '查一下我今天的日程',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'local_query' },
      },
      deps,
    );
    const listedResult = listed.result as string;
    assert.ok(listedResult.includes('已设提醒'));
  } finally {
    delete process.env.REMINDERS_DB_PATH;
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('calendar-skill: 创建每天重复日程并登记重复提醒', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  const remindersPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = remindersPath;
  const skill = createCalendarSkill({ dbPath: join(dir, 'calendar.db') });
  try {
    const created = await skill.execute(
      {
        query: '帮我安排每天早上9点的站会',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'create_calendar' },
      },
      { callVLM: async () => '' },
    );
    const result = created.result as string;
    assert.ok(result.includes('已创建日程'));
    assert.ok(result.includes('每天重复'));
    assert.ok(result.includes('已同步设置提醒'));
    const store = new ReminderStore(remindersPath);
    try {
      const reminders = store.list('default');
      assert.equal(reminders.length, 1);
      assert.equal(reminders[0].repeat, 'daily');
      assert.ok(reminders[0].message.includes('站会'));
    } finally {
      store.close();
    }
  } finally {
    delete process.env.REMINDERS_DB_PATH;
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('calendar-skill: 创建每周重复日程（提前量）并查询展示周期', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  const remindersPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = remindersPath;
  const skill = createCalendarSkill({ dbPath: join(dir, 'calendar.db') });
  try {
    const created = await skill.execute(
      {
        query: '帮我安排每周一9点的周会，提前10分钟提醒',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'create_calendar' },
      },
      { callVLM: async () => '' },
    );
    const result = created.result as string;
    assert.ok(result.includes('已创建日程'));
    assert.ok(result.includes('每周重复'));
    const store = new ReminderStore(remindersPath);
    try {
      const reminders = store.list('default');
      assert.equal(reminders.length, 1);
      assert.equal(reminders[0].repeat, 'weekly');
      assert.equal(new Date(reminders[0].remindAt).getDay(), 1);
      const { startAt } = parseTimeExpression('周一9点');
      const base = Date.parse(startAt) - 10 * 60_000;
      assert.ok(
        reminders[0].remindAt === base || reminders[0].remindAt === base + 7 * 24 * 3600_000,
        `remindAt=${reminders[0].remindAt} base=${base}`,
      );
    } finally {
      store.close();
    }
    const listed = await skill.execute(
      {
        query: '查一下我的日程',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'local_query' },
      },
      { callVLM: async () => '' },
    );
    const listedResult = listed.result as string;
    assert.ok(listedResult.includes('每周重复'));
  } finally {
    delete process.env.REMINDERS_DB_PATH;
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('calendar-skill: 导出日历生成 ICS（含重复规则与标题）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  const remindersPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = remindersPath;
  const skill = createCalendarSkill({
    dbPath: join(dir, 'calendar.db'),
    outDir: join(dir, 'out'),
  });
  try {
    await skill.execute(
      {
        query: '帮我安排每周一9点的周会',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'create_calendar' },
      },
      { callVLM: async () => '' },
    );
    await skill.execute(
      {
        query: '帮我安排每天9点的站会',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'create_calendar' },
      },
      { callVLM: async () => '' },
    );
    const exported = await skill.execute(
      {
        query: '导出我的日历',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'local_query' },
      },
      { callVLM: async () => '' },
    );
    const out = exported.result as { answer: string; path: string };
    assert.ok(out.answer.includes('已导出 2 条日程'));
    assert.ok(out.path.endsWith('.ics'));
    assert.ok(existsSync(out.path));
    const ics = readFileSync(out.path, 'utf-8');
    assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
    assert.ok(ics.includes('END:VCALENDAR'));
    assert.ok(ics.includes('BEGIN:VEVENT'));
    assert.match(ics, /DTSTART:\d{8}T\d{6}Z/);
    assert.ok(ics.includes('RRULE:FREQ=WEEKLY'));
    assert.ok(ics.includes('RRULE:FREQ=DAILY'));
    assert.ok(ics.includes('周会'));
    assert.ok(ics.includes('站会'));
  } finally {
    delete process.env.REMINDERS_DB_PATH;
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('calendar-skill: 复杂周期日程诚实提示且不落库', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  const remindersPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = remindersPath;
  const skill = createCalendarSkill({ dbPath: join(dir, 'calendar.db') });
  try {
    const created = await skill.execute(
      {
        query: '帮我安排每个工作日9点的打卡',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'create_calendar' },
      },
      { callVLM: async () => '' },
    );
    const result = created.result as string;
    assert.ok(result.includes('暂不支持'));
    const store = new ReminderStore(remindersPath);
    try {
      assert.equal(store.list('default').length, 0);
    } finally {
      store.close();
    }
  } finally {
    delete process.env.REMINDERS_DB_PATH;
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
