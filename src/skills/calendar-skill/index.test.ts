import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseTimeExpression } from '../../agent/time-expression.js';
import { ReminderStore } from '../../reminder/reminder-store.js';
import { cleanCalendarTitle, createCalendarSkill, parseIcs } from './index.js';

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
    assert.ok(result.includes('已为你创建日程'));
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

test('calendar-skill: E325 日程标题清洗——「安排一下」不残留「一下」', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-title-'));
  process.env.REMINDERS_DB_PATH = join(dir, 'reminders.db');
  const skill = createCalendarSkill({ dbPath: join(dir, 'calendar.db') });
  try {
    const created = await skill.execute(
      {
        query: '帮我安排一下我家里明天的亲子游行程安排',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'create_calendar' },
      },
      { callVLM: async () => '' },
    );
    const result = created.result as string;
    assert.ok(result.includes('已为你创建日程：亲子游行程'), result);
    assert.ok(!result.includes('我家里'), result);
    assert.ok(!result.includes('一下'), result);
  } finally {
    delete process.env.REMINDERS_DB_PATH;
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('calendar-skill: E329 标题清洗剥离提醒从句并清尾部标点', () => {
  assert.equal(cleanCalendarTitle('帮我安排明天下午3点的周会，提前10分钟提醒'), '下午3点周会');
  assert.equal(cleanCalendarTitle('帮我安排一下我家里明天的亲子游行程安排'), '亲子游行程');
  assert.equal(cleanCalendarTitle('帮我安排今天下午4点看牙医'), '下午4点看牙医');
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
    assert.ok(result.includes('已为你创建日程'));
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
    assert.ok(result.includes('已为你创建日程'));
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
    assert.ok(result.includes('已为你创建日程'));
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
test('calendar-skill: parseIcs 解析多事件/重复规则/中文标题/全天日期', () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:1@test
DTSTART:20260822T090000Z
SUMMARY:每日站会
RRULE:FREQ=DAILY
END:VEVENT
BEGIN:VEVENT
UID:2@test
DTSTART;VALUE=DATE:20260823
SUMMARY:放假
END:VEVENT
BEGIN:VEVENT
UID:3@test
DTSTART:20260824T100000
SUMMARY:周会\\, 评审
RRULE:FREQ=WEEKLY
END:VEVENT
END:VCALENDAR`;
  const events = parseIcs(ics);
  assert.equal(events.length, 3);
  assert.equal(events[0].summary, '每日站会');
  assert.equal(events[0].repeat, 'daily');
  assert.equal(events[0].complexRepeat, false);
  assert.equal(events[0].startAtIso, '2026-08-22T09:00:00.000Z');
  assert.equal(events[1].startAtIso, '2026-08-23T00:00:00.000Z');
  assert.equal(events[1].repeat, '');
  assert.equal(events[2].summary, '周会, 评审');
  assert.equal(events[2].repeat, 'weekly');
});

test('calendar-skill: parseIcs 折叠行展开与无 DTSTART 丢弃', () => {
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:1@test
DTSTART:20260825T080000Z
SUMMARY:超长标题第一
 段第二段
END:VEVENT
BEGIN:VEVENT
UID:2@test
SUMMARY:没有时间的日程
END:VEVENT
END:VCALENDAR`;
  const events = parseIcs(ics);
  assert.equal(events.length, 1);
  assert.ok(events[0].summary.includes('第一'));
  assert.ok(events[0].summary.includes('第二'));
});

test('calendar-skill: 从附件 .ics 导入日程并可查询', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  const remindersPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = remindersPath;
  const skill = createCalendarSkill({ dbPath: join(dir, 'calendar.db') });
  try {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:1@test
DTSTART:20260901T100000Z
SUMMARY:导入的评审会
END:VEVENT
BEGIN:VEVENT
UID:2@test
DTSTART:20260902T090000Z
SUMMARY:每日站会
RRULE:FREQ=DAILY
END:VEVENT
END:VCALENDAR`;
    const imported = await skill.execute(
      {
        query: '导入这个日历文件',
        attachmentSignals: [{ type: 'document', mimeType: 'text/calendar', sizeBytes: ics.length, fileName: 'cal.ics' }],
        rawFiles: [
          {
            name: 'cal.ics',
            type: 'text/calendar',
            size: ics.length,
            arrayBuffer: async () => { const b = Buffer.from(ics, 'utf-8'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; },
          },
        ],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = imported.result as { answer: string; count: number; skipped: number };
    assert.ok(result.answer.includes('已从 .ics 导入 2 条日程'), result.answer);
    assert.equal(result.count, 2);
    assert.equal(result.skipped, 0);
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
    assert.ok(listedResult.includes('导入的评审会'));
    assert.ok(listedResult.includes('每日站会'));
    assert.ok(listedResult.includes('每天重复'));
  } finally {
    delete process.env.REMINDERS_DB_PATH;
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('calendar-skill: 从查询路径导入 .ics', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  const remindersPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = remindersPath;
  const skill = createCalendarSkill({ dbPath: join(dir, 'calendar.db') });
  const icsPath = join(dir, 'events.ics');
  try {
    writeFileSync(
      icsPath,
      `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:1@test
DTSTART:20260905T140000Z
SUMMARY:路径导入日程
END:VEVENT
END:VCALENDAR`,
      'utf-8',
    );
    const imported = await skill.execute(
      {
        query: '导入 ' + icsPath,
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = imported.result as { answer: string; count: number };
    assert.ok(result.answer.includes('已从 .ics 导入 1 条日程'), result.answer);
    assert.equal(result.count, 1);
  } finally {
    delete process.env.REMINDERS_DB_PATH;
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('calendar-skill: 导入复杂周期（每月）跳过并诚实计数', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  const remindersPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = remindersPath;
  const skill = createCalendarSkill({ dbPath: join(dir, 'calendar.db') });
  try {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:1@test
DTSTART:20260901T100000Z
SUMMARY:普通会议
END:VEVENT
BEGIN:VEVENT
UID:2@test
DTSTART:20260910T100000Z
SUMMARY:每月对账
RRULE:FREQ=MONTHLY
END:VEVENT
END:VCALENDAR`;
    const imported = await skill.execute(
      {
        query: '导入这个ics文件',
        attachmentSignals: [],
        rawFiles: [
          {
            name: 'cal.ics',
            type: 'text/calendar',
            size: ics.length,
            arrayBuffer: async () => { const b = Buffer.from(ics, 'utf-8'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; },
          },
        ],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = imported.result as { answer: string; count: number; skipped: number };
    assert.ok(result.answer.includes('已从 .ics 导入 1 条日程'), result.answer);
    assert.ok(result.answer.includes('跳过 1 条'), result.answer);
    assert.equal(result.count, 1);
    assert.equal(result.skipped, 1);
  } finally {
    delete process.env.REMINDERS_DB_PATH;
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('calendar-skill: 导入空文件/无 VEVENT 诚实提示', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  const remindersPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = remindersPath;
  const skill = createCalendarSkill({ dbPath: join(dir, 'calendar.db') });
  try {
    const ics = 'BEGIN:VCALENDAR\nEND:VCALENDAR';
    const imported = await skill.execute(
      {
        query: '导入这个ics文件',
        attachmentSignals: [],
        rawFiles: [
          {
            name: 'empty.ics',
            type: 'text/calendar',
            size: ics.length,
            arrayBuffer: async () => { const b = Buffer.from(ics, 'utf-8'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; },
          },
        ],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = imported.result as string;
    assert.ok(result.includes('未在文件中解析到'), result);
  } finally {
    delete process.env.REMINDERS_DB_PATH;
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('calendar-skill: 无附件无路径的导入请求 → 提示上传', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  const remindersPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = remindersPath;
  const skill = createCalendarSkill({ dbPath: join(dir, 'calendar.db') });
  try {
    const imported = await skill.execute(
      {
        query: '帮我导入日程文件',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = imported.result as string;
    assert.ok(result.includes('请上传 .ics 文件'), result);
  } finally {
    delete process.env.REMINDERS_DB_PATH;
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

