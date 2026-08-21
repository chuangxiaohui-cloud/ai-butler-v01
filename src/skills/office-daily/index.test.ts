import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createServer as createNetServer, type Socket } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { ReminderStore } from '../../reminder/reminder-store.js';
import { saveCredentials } from '../../mail/credentials.js';
import ExcelJS from 'exceljs';
import { accentFromQuery, createOfficeDailySkill, tableWarningsNote } from './index.js';

const RUNTIME_PYTHON =
  process.env.OFFICE_PYTHON ??
  'C:\\Users\\zhxh\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
process.env.OFFICE_PYTHON = RUNTIME_PYTHON;
function pythonHasFitz(): boolean {
  try {
    const out = execFileSync(
      RUNTIME_PYTHON,
      ['-c', "import importlib.util as u; print('1' if u.find_spec('fitz') else '0')"],
      { encoding: 'utf8' },
    ).trim();
    return out === '1';
  } catch {
    return false;
  }
}

const HAS_FITZ = pythonHasFitz();

function pythonHasLocalRapidOcr(): boolean {
  try {
    const out = execFileSync(
      'python',
      ['-c', "import importlib.util as u; print('1' if u.find_spec('rapidocr_onnxruntime') else '0')"],
      { encoding: 'utf8' },
    ).trim();
    return out === '1';
  } catch {
    return false;
  }
}

const HAS_LOCAL_RAPIDOCR = pythonHasLocalRapidOcr();


function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'office-daily-test-'));
}

function fakeFile(name: string, type: string, bytes: Uint8Array | string) {
  const u8 = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return {
    name,
    type,
    size: u8.byteLength,
    arrayBuffer: async () =>
      u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer,
  };
}

test('office-daily: 生成考勤表模板 CSV', async () => {
  const dir = tempDir();
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '帮我做一个考勤表模板',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; path?: string };
    assert.ok(result.answer?.includes('考勤表模板'));
    assert.ok(existsSync(result.path as string));
    const csv = readFileSync(result.path as string, 'utf-8');
    assert.ok(csv.includes('序号,姓名,日期,上班时间,下班时间,状态,备注'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: CSV 部门销售额占比', async () => {
  const dir = tempDir();
  try {
    const csv = '部门,销售额\n技术部,5000\n市场部,3000\n销售部,2000\n';
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '算一下各部门销售额占比',
        attachmentSignals: [{ type: 'document', mimeType: 'text/csv', sizeBytes: csv.length, fileName: 'data.csv' }],
        rawFiles: [fakeFile('data.csv', 'text/csv', csv)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; shares?: Array<{ group: string; share: number }> };
    assert.ok(result.answer?.includes('技术部'));
    assert.ok(result.answer?.includes('50.0%'));
    assert.equal(result.shares?.[0].group, '技术部');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 回复邮件草稿落盘', async () => {
  const dir = tempDir();
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '写一封回复邮件，谢谢客户提供的资料，并说明下周给方案。',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      {
        callVLM: async () => '',
        complete: {
          complete: async () => '# 回复邮件\n\n## 标题\n感谢来函\n\n## 正文\n下周提供方案。',
        },
      },
    );
    const result = out.result as { answer?: string; path?: string };
    assert.ok(result.answer?.includes('回复邮件草稿'));
    assert.ok(existsSync(result.path as string));
    assert.ok(readFileSync(result.path as string, 'utf-8').includes('下周提供方案'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 会议邀请邮件草稿', async () => {
  const dir = tempDir();
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '写封会议邀请邮件，明天下午3点开周会，邀请张三和李四参加',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; path?: string; email?: string };
    assert.ok(result.answer?.includes('会议邀请邮件草稿'));
    assert.ok(result.email?.includes('会议邀请'));
    assert.ok(result.email?.includes('明天下午3点'));
    assert.ok(existsSync(result.path as string));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 图片压缩到 200KB 以内', async () => {
  const dir = tempDir();
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    );
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '把这张图压缩到200KB以内',
        attachmentSignals: [{ type: 'image', mimeType: 'image/png', sizeBytes: png.length, fileName: 'shot.png' }],
        rawFiles: [fakeFile('shot.png', 'image/png', png)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; size?: number };
    assert.ok(result.answer?.includes('已压缩'));
    assert.ok((result.size ?? 0) <= 200 * 1024);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: xls 读取失败时诚实提示', async () => {
  const dir = tempDir();
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '这个Excel帮我算一下各部门占比',
        attachmentSignals: [{ type: 'document', mimeType: 'application/vnd.ms-excel', sizeBytes: 8, fileName: 'data.xls' }],
        rawFiles: [fakeFile('data.xls', 'application/vnd.ms-excel', new Uint8Array(8))],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(
      result.answer?.includes('解析') ||
        result.answer?.includes('失败'),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: xlsx 原生解析部门占比', async () => {
  const dir = tempDir();
  try {
    const xlsxPath = join(dir, 'data.xlsx');
    execFileSync(
      RUNTIME_PYTHON,
      [
        '-c',
        `from openpyxl import Workbook; wb=Workbook(); ws=wb.active; ws.append(['部门','销售额']); ws.append(['技术部',5000]); ws.append(['市场部',3000]); ws.append(['销售部',2000]); wb.save(r"${xlsxPath}")`,
      ],
      { windowsHide: true },
    );
    const bytes = readFileSync(xlsxPath);
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '这个Excel帮我算一下各部门销售额占比',
        attachmentSignals: [{ type: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sizeBytes: bytes.length, fileName: 'data.xlsx' }],
        rawFiles: [fakeFile('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; shares?: Array<{ group: string }> };
    assert.ok(result.answer?.includes('技术部'));
    assert.ok(result.answer?.includes('50.0%'));
    assert.equal(result.shares?.[0].group, '技术部');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: xlsm 原生解析部门占比', async () => {
  const dir = tempDir();
  try {
    const xlsmPath = join(dir, 'data.xlsm');
    execFileSync(
      RUNTIME_PYTHON,
      [
        '-c',
        `from openpyxl import Workbook; wb=Workbook(); ws=wb.active; ws.append(['部门','销售额']); ws.append(['技术部',5000]); ws.append(['市场部',3000]); ws.append(['销售部',2000]); wb.save(r"${xlsmPath}")`,
      ],
      { windowsHide: true },
    );
    const bytes = readFileSync(xlsmPath);
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '这个Excel帮我算一下各部门销售额占比',
        attachmentSignals: [{ type: 'document', mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12', sizeBytes: bytes.length, fileName: 'data.xlsm' }],
        rawFiles: [fakeFile('data.xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12', bytes)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; shares?: Array<{ group: string }> };
    assert.ok(result.answer?.includes('技术部'));
    assert.equal(result.shares?.[0].group, '技术部');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: Word 排版输出新文件', async () => {
  const dir = tempDir();
  try {
    const docxPath = join(dir, 'input.docx');
    execFileSync(
      RUNTIME_PYTHON,
      [
        '-c',
        `import docx; d=docx.Document(); d.add_paragraph('测试正文'); d.save(r"${docxPath}")`,
      ],
      { windowsHide: true },
    );
    const bytes = readFileSync(docxPath);
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '帮我把这个Word改一下格式',
        attachmentSignals: [{ type: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: bytes.length, fileName: 'input.docx' }],
        rawFiles: [fakeFile('input.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; path?: string };
    assert.ok(result.answer?.includes('排版副本'));
    assert.ok(existsSync(result.path as string));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: Markdown 排版输出 docx', async () => {
  const dir = tempDir();
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '帮我把这个文档排版一下',
        attachmentSignals: [{ type: 'document', mimeType: 'text/markdown', sizeBytes: 8, fileName: 'note.md' }],
        rawFiles: [fakeFile('note.md', 'text/markdown', '# 标题\n\n正文内容')],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; path?: string };
    assert.ok(result.answer?.includes('排版副本'));
    assert.ok(existsSync(result.path as string));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: PDF 排版输出 docx', async () => {
  const dir = tempDir();
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '帮我把这个文档排版一下',
        attachmentSignals: [{ type: 'document', mimeType: 'application/pdf', sizeBytes: 8, fileName: 'doc.pdf' }],
        rawFiles: [fakeFile('doc.pdf', 'application/pdf', new Uint8Array(8))],
        memory: null,
      },
      {
        callVLM: async () => '',
        parseDocument: async () => '第一段\n\n第二段',
      },
    );
    const result = out.result as { answer?: string; path?: string };
    assert.ok(result.answer?.includes('排版副本'));
    assert.ok(existsSync(result.path as string));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: doc 读取失败时诚实提示', async () => {
  const dir = tempDir();
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '帮我把这个Word改一下格式',
        attachmentSignals: [{ type: 'document', mimeType: 'application/msword', sizeBytes: 8, fileName: 'old.doc' }],
        rawFiles: [fakeFile('old.doc', 'application/msword', new Uint8Array(8))],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('doc'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: PDF 转 Word 输出文件', async () => {
  const dir = tempDir();
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '帮我把这个PDF转成Word',
        attachmentSignals: [{ type: 'document', mimeType: 'application/pdf', sizeBytes: 8, fileName: 'doc.pdf' }],
        rawFiles: [fakeFile('doc.pdf', 'application/pdf', new Uint8Array(8))],
        memory: null,
      },
      {
        callVLM: async () => '',
        parseDocument: async () => '第一段\n\n第二段',
      },
    );
    const result = out.result as { answer?: string; path?: string };
    assert.ok(result.answer?.includes('已生成 Word'));
    assert.ok(existsSync(result.path as string));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 生成项目汇报 PPT', async () => {
  const dir = tempDir();
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '帮我做一份蓝色主题的项目汇报PPT',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; path?: string };
    assert.ok(result.answer?.includes('已生成项目汇报 PPT'));
    assert.ok(existsSync(result.path as string));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 主题色解析', () => {
  assert.equal(accentFromQuery('蓝色主题'), '#4472C4');
  assert.equal(accentFromQuery('红色主题'), '#C00000');
  assert.equal(accentFromQuery('没有指定颜色'), undefined);
});

test('office-daily: 设置主动提醒', async () => {
  const dir = tempDir();
  const oldDb = process.env.REMINDERS_DB_PATH;
  process.env.REMINDERS_DB_PATH = join(dir, 'reminders.db');
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '明天下午3点提醒我开会',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { userId: 'u1', conversationId: 'c1' },
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; id?: number; remindAt?: number };
    assert.ok(result.answer?.includes('已设置提醒'));
    assert.ok(result.answer?.includes('开会'));
    assert.ok((result.id ?? 0) > 0);
    assert.ok((result.remindAt ?? 0) > Date.now());
  } finally {
    process.env.REMINDERS_DB_PATH = oldDb;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 列出待触发提醒', async () => {
  const dir = tempDir();
  const oldDb = process.env.REMINDERS_DB_PATH;
  const dbPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = dbPath;
  try {
    const store = new ReminderStore(dbPath);
    try {
      const now = Date.now();
      store.add({ userId: 'u1', message: '周会', remindAt: now + 60_000 });
      store.add({ userId: 'u1', message: '取快递', remindAt: now + 120_000 });
    } finally {
      store.close();
    }
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '查一下我的提醒',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { userId: 'u1' },
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('2 条待触发提醒'));
    assert.ok(result.answer?.includes('周会'));
    assert.ok(result.answer?.includes('取快递'));
  } finally {
    process.env.REMINDERS_DB_PATH = oldDb;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 按关键词取消提醒', async () => {
  const dir = tempDir();
  const oldDb = process.env.REMINDERS_DB_PATH;
  const dbPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = dbPath;
  try {
    const store = new ReminderStore(dbPath);
    try {
      const now = Date.now();
      store.add({ userId: 'u1', message: '明天开会', remindAt: now + 60_000 });
      store.add({ userId: 'u1', message: '下午取快递', remindAt: now + 120_000 });
    } finally {
      store.close();
    }
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '取消开会提醒',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { userId: 'u1' },
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('已取消 1 条提醒'));
    const verify = new ReminderStore(dbPath);
    try {
      const left = verify.list('u1');
      assert.equal(left.length, 1);
      assert.equal(left[0].message, '下午取快递');
    } finally {
      verify.close();
    }
  } finally {
    process.env.REMINDERS_DB_PATH = oldDb;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 按编号取消提醒', async () => {
  const dir = tempDir();
  const oldDb = process.env.REMINDERS_DB_PATH;
  const dbPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = dbPath;
  try {
    const store = new ReminderStore(dbPath);
    let firstId = 0;
    try {
      const now = Date.now();
      const r1 = store.add({ userId: 'u1', message: '周会', remindAt: now + 60_000 });
      firstId = r1.id;
      store.add({ userId: 'u1', message: '取快递', remindAt: now + 120_000 });
    } finally {
      store.close();
    }
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '取消第 2 条提醒',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { userId: 'u1' },
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('已取消 1 条提醒'));
    const verify = new ReminderStore(dbPath);
    try {
      const left = verify.list('u1');
      assert.equal(left.length, 1);
      assert.equal(left[0].id, firstId);
    } finally {
      verify.close();
    }
  } finally {
    process.env.REMINDERS_DB_PATH = oldDb;
    rmSync(dir, { recursive: true, force: true });
  }
});

const PDF_A = 'JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDcgMCBSIC9NZWRpYUJveCBbIDAgMCA1OTUuMjc1NiA4NDEuODg5OCBdIC9QYXJlbnQgNiAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNCAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDYgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MDgyMDE5MjczOSswOCcwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MDgyMDE5MjczOSswOCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9Db3VudCAxIC9LaWRzIFsgMyAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMTA2Cj4+CnN0cmVhbQpHYXBRaDBFPUYsMFVcSDNUXHBOWVReUUtrP3RjPklQLDtXI1UxXjIzaWhQRU1fP0NXNEtJU2k8IVs3YCNPQl9xdWEuLmE/NyRtZ15LbkA4ODwhPldgS29kaj4mMXJ1aSJZS2RZcnRHJn4+ZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgOAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNjEgMDAwMDAgbiAKMDAwMDAwMDA5MiAwMDAwMCBuIAowMDAwMDAwMTk5IDAwMDAwIG4gCjAwMDAwMDA0MDIgMDAwMDAgbiAKMDAwMDAwMDQ3MCAwMDAwMCBuIAowMDAwMDAwNzMxIDAwMDAwIG4gCjAwMDAwMDA3OTAgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8MmY3YWI1ODQ5MzRmYWFiMDBhNmU5N2QwZmUxZWUxY2Q+PDJmN2FiNTg0OTM0ZmFhYjAwYTZlOTdkMGZlMWVlMWNkPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA1IDAgUgovUm9vdCA0IDAgUgovU2l6ZSA4Cj4+CnN0YXJ0eHJlZgo5ODYKJSVFT0YK';
const PDF_B = 'JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDggMCBSIC9NZWRpYUJveCBbIDAgMCA1OTUuMjc1NiA4NDEuODg5OCBdIC9QYXJlbnQgNyAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgOSAwIFIgL01lZGlhQm94IFsgMCAwIDU5NS4yNzU2IDg0MS44ODk4IF0gL1BhcmVudCA3IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9QYWdlTW9kZSAvVXNlTm9uZSAvUGFnZXMgNyAwIFIgL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0F1dGhvciAoYW5vbnltb3VzKSAvQ3JlYXRpb25EYXRlIChEOjIwMjYwODIwMTkyNzM5KzA4JzAwJykgL0NyZWF0b3IgKGFub255bW91cykgL0tleXdvcmRzICgpIC9Nb2REYXRlIChEOjIwMjYwODIwMTkyNzM5KzA4JzAwJykgL1Byb2R1Y2VyIChSZXBvcnRMYWIgUERGIExpYnJhcnkgLSBcKG9wZW5zb3VyY2VcKSkgCiAgL1N1YmplY3QgKHVuc3BlY2lmaWVkKSAvVGl0bGUgKHVudGl0bGVkKSAvVHJhcHBlZCAvRmFsc2UKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0NvdW50IDIgL0tpZHMgWyAzIDAgUiA0IDAgUiBdIC9UeXBlIC9QYWdlcwo+PgplbmRvYmoKOCAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAxMDUKPj4Kc3RyZWFtCkdhcFFoMEU9RiwwVVxIM1RccE5ZVF5RS2s/dGM+SVAsO1cjVTFeMjNpaFBFTV8/Q1c0S0lTaTwhWzdgI09CX3F1VnBwa3RRaShCSksjSTpcIltjIjxPPVoocy9XYXVWL2NcNmcnOGx+PmVuZHN0cmVhbQplbmRvYmoKOSAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAxMDUKPj4Kc3RyZWFtCkdhcFFoMEU9RiwwVVxIM1RccE5ZVF5RS2s/dGM+SVAsO1cjVTFeMjNpaFBFTV8/Q1c0S0lTaTwhWzdgI09CX3F1VnBwa3RRaShCSksjSTpcIlg/YHFPPVoocy9XYXVWL2NcNnUnOHV+PmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDEwCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMDkyIDAwMDAwIG4gCjAwMDAwMDAxOTkgMDAwMDAgbiAKMDAwMDAwMDQwMiAwMDAwMCBuIAowMDAwMDAwNjA1IDAwMDAwIG4gCjAwMDAwMDA2NzMgMDAwMDAgbiAKMDAwMDAwMDkzNCAwMDAwMCBuIAowMDAwMDAwOTk5IDAwMDAwIG4gCjAwMDAwMDExOTQgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8NzlkYTRmMjAwZDI5MTFhNTEwNGYwNDUxZDhlYTM5OWI+PDc5ZGE0ZjIwMGQyOTExYTUxMDRmMDQ1MWQ4ZWEzOTliPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA2IDAgUgovUm9vdCA1IDAgUgovU2l6ZSAxMAo+PgpzdGFydHhyZWYKMTM4OQolJUVPRgo=';

test('office-daily: 合并多个 PDF', async () => {
  const dir = tempDir();
  try {
    const pdfA = Buffer.from(PDF_A, 'base64');
    const pdfB = Buffer.from(PDF_B, 'base64');
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '把这两个PDF合并成一个',
        attachmentSignals: [
          { type: 'document', mimeType: 'application/pdf', sizeBytes: pdfA.length, fileName: 'a.pdf' },
          { type: 'document', mimeType: 'application/pdf', sizeBytes: pdfB.length, fileName: 'b.pdf' },
        ],
        rawFiles: [
          fakeFile('a.pdf', 'application/pdf', pdfA),
          fakeFile('b.pdf', 'application/pdf', pdfB),
        ],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; path?: string; pages?: number };
    assert.ok(result.answer?.includes('已合并 2 个 PDF'));
    assert.equal(result.pages, 3);
    assert.ok(existsSync(result.path as string));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: PDF 加密并可用密码打开', async () => {
  const dir = tempDir();
  try {
    const pdfA = Buffer.from(PDF_A, 'base64');
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '用密码 abc123 给这个PDF加密',
        attachmentSignals: [{ type: 'document', mimeType: 'application/pdf', sizeBytes: pdfA.length, fileName: 'a.pdf' }],
        rawFiles: [fakeFile('a.pdf', 'application/pdf', pdfA)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; path?: string; password?: string };
    assert.ok(result.answer?.includes('已加密 PDF'));
    assert.equal(result.password, 'abc123');
    assert.ok(existsSync(result.path as string));
    const stdout = execFileSync(
      RUNTIME_PYTHON,
      [
        '-c',
        `import sys
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
assert r.is_encrypted
r.decrypt(sys.argv[2])
assert len(r.pages) == 1
print('ok')`,
        result.path as string,
        'abc123',
      ],
      { encoding: 'utf8' },
    );
    assert.ok(stdout.includes('ok'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 图片格式转换 PNG→JPG', async () => {
  const dir = tempDir();
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    );
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '把这张图转成JPG',
        attachmentSignals: [{ type: 'image', mimeType: 'image/png', sizeBytes: png.length, fileName: 'shot.png' }],
        rawFiles: [fakeFile('shot.png', 'image/png', png)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; path?: string; format?: string };
    assert.ok(result.answer?.includes('已转换为 JPG'));
    assert.equal(result.format, 'jpg');
    assert.ok(existsSync(result.path as string));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 未接入能力诚实提示', async () => {
  const dir = tempDir();
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '帮我做格式转换',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('这项能力还没接入'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: PDF 压缩输出有效文件', async () => {
  const dir = tempDir();
  try {
    const pdfB = Buffer.from(PDF_B, 'base64');
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '把这个PDF压缩一下',
        attachmentSignals: [{ type: 'document', mimeType: 'application/pdf', sizeBytes: pdfB.length, fileName: 'b.pdf' }],
        rawFiles: [fakeFile('b.pdf', 'application/pdf', pdfB)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; path?: string; pages?: number; sizeAfter?: number; method?: string };
    assert.ok(result.answer?.includes('已压缩 PDF'));
    assert.equal(result.pages, 2);
    assert.ok((result.sizeAfter ?? 0) > 0);
    assert.ok(result.method === 'pypdf' || result.method === 'pymupdf');
    assert.ok(existsSync(result.path as string));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 图片格式转换 AVIF→PNG', async () => {
  const dir = tempDir();
  try {
    const b64 = execFileSync(
      RUNTIME_PYTHON,
      [
        '-c',
        `from PIL import Image
import base64, io
img = Image.new('RGB', (24, 16), (80, 160, 40))
buf = io.BytesIO()
img.save(buf, 'AVIF')
print(base64.b64encode(buf.getvalue()).decode())`,
      ],
      { encoding: 'utf8' },
    ).trim();
    const avif = Buffer.from(b64, 'base64');
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '把这张图转成PNG',
        attachmentSignals: [{ type: 'image', mimeType: 'image/avif', sizeBytes: avif.length, fileName: 'img.avif' }],
        rawFiles: [fakeFile('img.avif', 'image/avif', avif)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; format?: string; path?: string };
    assert.ok(result.answer?.includes('已转换为 PNG'));
    assert.equal(result.format, 'png');
    assert.ok(existsSync(result.path as string));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: HEIC 无解码器时诚实提示', async () => {
  const dir = tempDir();
  try {
    const probe = execFileSync(
      RUNTIME_PYTHON,
      [
        '-c',
        `import importlib.util as u, shutil
ok = bool(u.find_spec('pillow_heif') or u.find_spec('imagecodecs'))
if not ok:
    ok = bool(shutil.which('ffmpeg'))
print('1' if ok else '0')`,
      ],
      { encoding: 'utf8' },
    ).trim();
    if (probe === '1') return; // 环境具备 HEIC 解码能力时该用例不适用
    const fake = Buffer.from('not-a-heic', 'utf8');
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '把这张HEIC图转成JPG',
        attachmentSignals: [{ type: 'image', mimeType: 'image/heic', sizeBytes: fake.length, fileName: 'photo.heic' }],
        rawFiles: [fakeFile('photo.heic', 'image/heic', fake)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('HEIC'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('office-daily: 图片 OCR 引擎不可用时诚实提示', async () => {
  const dir = tempDir();
  const oldOcr = process.env.PDF_OCR;
  process.env.PDF_OCR = '0';
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    );
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '识别这张图的文字',
        attachmentSignals: [{ type: 'image', mimeType: 'image/png', sizeBytes: png.length, fileName: 'scan.png' }],
        rawFiles: [fakeFile('scan.png', 'image/png', png)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('图片文字识别失败'));
  } finally {
    process.env.PDF_OCR = oldOcr;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 图片 OCR 真识别', { skip: !HAS_LOCAL_RAPIDOCR }, async () => {
  const dir = tempDir();
  try {
    const b64 = execFileSync(
      RUNTIME_PYTHON,
      [
        '-c',
        `import base64, io, os
from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGB', (480, 120), 'white')
d = ImageDraw.Draw(img)
font = None
for fp in [r'C:\\Windows\\Fonts\\arialbd.ttf', r'C:\\Windows\\Fonts\\arial.ttf']:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, 44)
            break
        except Exception:
            pass
if font is None:
    font = ImageFont.load_default()
d.text((20, 30), 'OCR TEST 2026', fill='black', font=font)
buf = io.BytesIO()
img.save(buf, 'PNG')
print(base64.b64encode(buf.getvalue()).decode())`,
      ],
      { encoding: 'utf8' },
    ).trim();
    const png = Buffer.from(b64, 'base64');
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '识别这张图的文字',
        attachmentSignals: [{ type: 'image', mimeType: 'image/png', sizeBytes: png.length, fileName: 'scan.png' }],
        rawFiles: [fakeFile('scan.png', 'image/png', png)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; text?: string; chars?: number; path?: string };
    assert.ok(result.answer?.includes('已识别图片文字'));
    assert.ok((result.chars ?? 0) > 0);
    assert.ok((result.text ?? '').includes('OCR') || (result.text ?? '').includes('TEST') || (result.text ?? '').includes('2026'));
    assert.ok(existsSync(result.path as string));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: PDF 指定体积目标时降采样重渲染', { skip: !HAS_FITZ }, async () => {
  const dir = tempDir();
  try {
    const b64 = execFileSync(
      RUNTIME_PYTHON,
      [
        '-c',
        `import base64, io, os, random, tempfile
from PIL import Image
from reportlab.pdfgen import canvas
tmp = tempfile.mkdtemp()
random.seed(7)
img = Image.new('RGB', (600, 450))
img.putdata([(random.randint(0, 255),) * 3 for _ in range(600 * 450)])
jpg = os.path.join(tmp, 'big.jpg')
img.save(jpg, 'JPEG', quality=85)
pdfbuf = io.BytesIO()
c = canvas.Canvas(pdfbuf)
for _ in range(2):
    c.drawImage(jpg, 20, 20, width=550, height=412)
    c.showPage()
c.save()
print(base64.b64encode(pdfbuf.getvalue()).decode())`,
      ],
      { encoding: 'utf8' },
    ).trim();
    const pdf = Buffer.from(b64, 'base64');
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '把这个PDF压缩到 200KB 以内',
        attachmentSignals: [{ type: 'document', mimeType: 'application/pdf', sizeBytes: pdf.length, fileName: 'scan.pdf' }],
        rawFiles: [fakeFile('scan.pdf', 'application/pdf', pdf)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; path?: string; render?: boolean; dpi?: number; sizeAfter?: number };
    assert.ok(result.answer?.includes('已压缩 PDF'));
    assert.equal(result.render, true);
    assert.ok((result.dpi ?? 0) > 0);
    assert.ok((result.sizeAfter ?? 0) <= 200 * 1024);
    assert.ok(existsSync(result.path as string));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('office-daily: 设置每天提醒', async () => {
  const dir = tempDir();
  const oldDb = process.env.REMINDERS_DB_PATH;
  const dbPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = dbPath;
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '每天早上9点提醒我喝水',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { userId: 'u1' },
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; repeat?: string };
    assert.ok(result.answer?.includes('已设置每天提醒'));
    assert.ok(result.answer?.includes('喝水'));
    assert.equal(result.repeat, 'daily');
    const verify = new ReminderStore(dbPath);
    try {
      const rows = verify.list('u1');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].message, '喝水');
      assert.equal(rows[0].repeat, 'daily');
    } finally {
      verify.close();
    }
  } finally {
    process.env.REMINDERS_DB_PATH = oldDb;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 设置每周提醒', async () => {
  const dir = tempDir();
  const oldDb = process.env.REMINDERS_DB_PATH;
  const dbPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = dbPath;
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '每周一9点提醒我开周会',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { userId: 'u1' },
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; repeat?: string };
    assert.ok(result.answer?.includes('已设置每周提醒'));
    assert.ok(result.answer?.includes('开周会'));
    assert.equal(result.repeat, 'weekly');
    const verify = new ReminderStore(dbPath);
    try {
      const rows = verify.list('u1');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].message, '开周会');
      assert.equal(rows[0].repeat, 'weekly');
      assert.equal(new Date(rows[0].remindAt).getDay(), 1);
    } finally {
      verify.close();
    }
  } finally {
    process.env.REMINDERS_DB_PATH = oldDb;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 工作日等复杂周期诚实提示', async () => {
  const dir = tempDir();
  const oldDb = process.env.REMINDERS_DB_PATH;
  const dbPath = join(dir, 'reminders.db');
  process.env.REMINDERS_DB_PATH = dbPath;
  try {
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '每个工作日9点提醒我打卡',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { userId: 'u1' },
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('暂不支持'));
    const verify = new ReminderStore(dbPath);
    try {
      assert.equal(verify.list('u1').length, 0);
    } finally {
      verify.close();
    }
  } finally {
    process.env.REMINDERS_DB_PATH = oldDb;
    rmSync(dir, { recursive: true, force: true });
  }
});
function makeTextPng(text: string): Buffer {
  const b64 = execFileSync(
    RUNTIME_PYTHON,
    [
      '-c',
      `import base64, io, os
from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGB', (480, 120), 'white')
d = ImageDraw.Draw(img)
font = None
for fp in [r'C:\\Windows\\Fonts\\arialbd.ttf', r'C:\\Windows\\Fonts\\arial.ttf']:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, 44)
            break
        except Exception:
            pass
if font is None:
    font = ImageFont.load_default()
d.text((20, 30), '${text}', fill='black', font=font)
buf = io.BytesIO()
img.save(buf, 'PNG')
print(base64.b64encode(buf.getvalue()).decode())`,
    ],
    { encoding: 'utf8' },
  ).trim();
  return Buffer.from(b64, 'base64');
}

test('office-daily: 批量 OCR 引擎不可用时诚实提示', async () => {
  const dir = tempDir();
  const oldOcr = process.env.PDF_OCR;
  process.env.PDF_OCR = '0';
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    );
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '识别这两张图的文字',
        attachmentSignals: [
          { type: 'image', mimeType: 'image/png', sizeBytes: png.length, fileName: 'a.png' },
          { type: 'image', mimeType: 'image/png', sizeBytes: png.length, fileName: 'b.png' },
        ],
        rawFiles: [fakeFile('a.png', 'image/png', png), fakeFile('b.png', 'image/png', png)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('图片文字识别失败'));
  } finally {
    process.env.PDF_OCR = oldOcr;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 批量 OCR 真识别', { skip: !HAS_LOCAL_RAPIDOCR }, async () => {
  const dir = tempDir();
  try {
    const pngA = makeTextPng('AAA 111');
    const pngB = makeTextPng('BBB 222');
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '识别这两张图的文字',
        attachmentSignals: [
          { type: 'image', mimeType: 'image/png', sizeBytes: pngA.length, fileName: 'a.png' },
          { type: 'image', mimeType: 'image/png', sizeBytes: pngB.length, fileName: 'b.png' },
        ],
        rawFiles: [fakeFile('a.png', 'image/png', pngA), fakeFile('b.png', 'image/png', pngB)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as {
      answer?: string;
      text?: string;
      chars?: number;
      path?: string;
      imageCount?: number;
    };
    assert.ok(result.answer?.includes('已批量识别 2/2 张图片'));
    assert.ok((result.chars ?? 0) > 0);
    assert.equal(result.imageCount, 2);
    const text = result.text ?? '';
    assert.ok(text.includes('111') || text.includes('AAA'), text);
    assert.ok(text.includes('222') || text.includes('BBB'), text);
    assert.ok(existsSync(result.path as string));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 批量 OCR 单张损坏返回其余结果', { skip: !HAS_LOCAL_RAPIDOCR }, async () => {
  const dir = tempDir();
  try {
    const png = makeTextPng('CCC 333');
    const broken = Buffer.from('not a real png file at all');
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '识别这两张图的文字',
        attachmentSignals: [
          { type: 'image', mimeType: 'image/png', sizeBytes: png.length, fileName: 'good.png' },
          { type: 'image', mimeType: 'image/png', sizeBytes: broken.length, fileName: 'broken.png' },
        ],
        rawFiles: [fakeFile('good.png', 'image/png', png), fakeFile('broken.png', 'image/png', broken)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; text?: string; errors?: string[]; imageCount?: number };
    assert.ok(result.answer?.includes('已批量识别 1/2 张图片'));
    assert.ok(result.answer?.includes('未识别 1 张'));
    assert.equal(result.imageCount, 2);
    assert.equal((result.errors ?? []).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('office-daily: 疑似合并 warning 文案如实提示', () => {
  assert.equal(tableWarningsNote([]), '');
  const note = tableWarningsNote([
    { type: 'merged_col', row: 0, col: 1, detail: '第1行第2列疑似跨列合并' },
    { type: 'merged_row', row: 1, col: 0, detail: '第2行第1列疑似跨行合并' },
  ]);
  assert.ok(note.includes('2 处疑似合并单元格'), note);
  assert.ok(note.includes('第1行第2列'), note);
  assert.ok(note.includes('跨列合并'), note);
  assert.ok(note.includes('手动合并'), note);
});

test('office-daily: 表格识别引擎不可用时诚实提示', async () => {
  const dir = tempDir();
  const oldOcr = process.env.PDF_OCR;
  process.env.PDF_OCR = '0';
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    );
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '识别这张表格',
        attachmentSignals: [{ type: 'image', mimeType: 'image/png', sizeBytes: png.length, fileName: 'table.png' }],
        rawFiles: [fakeFile('table.png', 'image/png', png)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('表格识别失败'));
  } finally {
    process.env.PDF_OCR = oldOcr;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 图片表格识别真跑', { skip: !HAS_LOCAL_RAPIDOCR }, async () => {
  const dir = tempDir();
  try {
    const b64 = execFileSync(
      RUNTIME_PYTHON,
      [
        '-c',
        `import base64, io, os
from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGB', (400, 120), 'white')
d = ImageDraw.Draw(img)
for x in (0, 200, 400):
    d.line([(x, 0), (x, 120)], fill='black', width=2)
for y in (0, 60, 120):
    d.line([(0, y), (400, y)], fill='black', width=2)
font = None
for fp in [r'C:\\Windows\\Fonts\\arialbd.ttf', r'C:\\Windows\\Fonts\\arial.ttf']:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, 36)
            break
        except Exception:
            pass
if font is None:
    font = ImageFont.load_default()
d.text((40, 12), 'A1', fill='black', font=font)
d.text((250, 12), 'B1', fill='black', font=font)
d.text((40, 72), 'A2', fill='black', font=font)
d.text((250, 72), 'B2', fill='black', font=font)
buf = io.BytesIO()
img.save(buf, 'PNG')
print(base64.b64encode(buf.getvalue()).decode())`,
      ],
      { encoding: 'utf8' },
    ).trim();
    const png = Buffer.from(b64, 'base64');
    const skill = createOfficeDailySkill({ outDir: dir });
    const out = await skill.execute(
      {
        query: '识别这张表格',
        attachmentSignals: [{ type: 'image', mimeType: 'image/png', sizeBytes: png.length, fileName: 'table.png' }],
        rawFiles: [fakeFile('table.png', 'image/png', png)],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as {
      answer?: string;
      csv?: string;
      rows?: number;
      cols?: number;
      path?: string;
    };
    assert.ok(result.answer?.includes('已识别表格'));
    assert.ok((result.rows ?? 0) >= 2, `rows=${result.rows}`);
    assert.ok((result.cols ?? 0) >= 2, `cols=${result.cols}`);
    assert.ok((result.csv ?? '').includes('A1'), result.csv);
    assert.ok((result.csv ?? '').includes('B2'), result.csv);
    assert.ok(existsSync(result.path as string));
    assert.ok(result.answer?.includes('XLSX 已保存'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.path as string);
    const ws = wb.getWorksheet(1);
    assert.ok(ws, 'xlsx 工作表存在');
    assert.equal(ws.getCell('A1').value, 'A1');
    assert.equal(ws.getCell('B2').value, 'B2');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
function startFakeSmtpServer(): Promise<{
  port: number;
  transcript: string[];
  close(): Promise<void>;
}> {
  const transcript: string[] = [];
  const server = createNetServer((socket: Socket) => {
    socket.setEncoding('utf8');
    socket.write('220 test.local ESMTP ready\r\n');
    let inData = false;
    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.replace(/\r$/, '');
        if (inData) {
          if (line === '.') {
            inData = false;
            socket.write('250 2.0.0 Ok: queued as <test-message-id>\r\n');
          }
          continue;
        }
        transcript.push(line);
        const cmd = line.toUpperCase();
        if (cmd.startsWith('EHLO')) {
          socket.write('250-test.local\r\n250 AUTH LOGIN\r\n');
        } else if (cmd === 'AUTH LOGIN') {
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (line === Buffer.from('you@qq.com').toString('base64')) {
          socket.write('334 UGFzc3dvcmQ6\r\n');
        } else if (line === Buffer.from('authcode').toString('base64')) {
          socket.write('235 2.7.0 Authentication successful\r\n');
        } else if (cmd.startsWith('MAIL FROM')) {
          socket.write('250 2.1.0 Ok\r\n');
        } else if (cmd.startsWith('RCPT TO')) {
          socket.write('250 2.1.5 Ok\r\n');
        } else if (cmd === 'DATA') {
          inData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (cmd === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else {
          socket.write('250 Ok\r\n');
        }
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        port,
        transcript,
        close: async () => {
          server.close();
        },
      });
    });
  });
}

test('office-daily: 发送邮件未配置凭据 → 诚实提示不发送', async () => {
  const dir = tempDir();
  try {
    const skill = createOfficeDailySkill({ outDir: dir, mailDir: join(dir, 'mail') });
    const out = await skill.execute(
      {
        query: '发送邮件给 rcpt@example.com，主题：测试，正文：你好',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('mail:config'));
    assert.ok(result.answer?.includes('不会发送'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 发送邮件缺收件人 → 诚实提示', async () => {
  const dir = tempDir();
  try {
    const skill = createOfficeDailySkill({ outDir: dir, mailDir: join(dir, 'mail') });
    const out = await skill.execute(
      {
        query: '发送邮件，主题：测试，正文：你好',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('发送给谁'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 发送邮件（已配置凭据 + 假 SMTP 服务器）→ 真发成功', async () => {
  const dir = tempDir();
  const fake = await startFakeSmtpServer();
  try {
    const mailDir = join(dir, 'mail');
    saveCredentials(
      {
        host: '127.0.0.1',
        port: fake.port,
        secure: false,
        user: 'you@qq.com',
        pass: 'authcode',
        from: 'you@qq.com',
      },
      join(mailDir, 'mail-credentials.json'),
    );
    const skill = createOfficeDailySkill({ outDir: dir, mailDir });
    const out = await skill.execute(
      {
        query: '发送邮件给 rcpt@example.com，主题：测试主题，正文：你好，请查收。',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; from?: string; to?: string; subject?: string };
    assert.ok(result.answer?.includes('邮件已发送'), result.answer);
    assert.ok(result.answer?.includes('you@qq.com'));
    assert.ok(result.answer?.includes('rcpt@example.com'));
    assert.ok(result.answer?.includes('测试主题'));
    assert.equal(result.from, 'you@qq.com');
    assert.equal(result.to, 'rcpt@example.com');
    assert.equal(result.subject, '测试主题');
    assert.ok(fake.transcript.includes(`RCPT TO:<rcpt@example.com>`));
    assert.ok(fake.transcript.includes('DATA'));
  } finally {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 写邮件发给客户 → 仍走草稿而非发送', async () => {
  const dir = tempDir();
  try {
    const skill = createOfficeDailySkill({ outDir: dir, mailDir: join(dir, 'mail') });
    const out = await skill.execute(
      {
        query: '写封邮件发给客户，说明下周交付',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('回复邮件草稿'), result.answer);
    assert.ok(!result.answer?.includes('发送给谁'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('office-daily: 写草稿 → 把刚才那封发出去（两段式发送）', async () => {
  const dir = tempDir();
  const fake = await startFakeSmtpServer();
  try {
    const mailDir = join(dir, 'mail');
    saveCredentials(
      {
        host: '127.0.0.1',
        port: fake.port,
        secure: false,
        user: 'you@qq.com',
        pass: 'authcode',
        from: 'you@qq.com',
      },
      join(mailDir, 'mail-credentials.json'),
    );
    const skill = createOfficeDailySkill({ outDir: dir, mailDir });
    const draft = await skill.execute(
      {
        query: '写一封回复邮件给 rcpt@example.com，谢谢客户提供的资料',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const draftResult = draft.result as { answer?: string };
    assert.ok(draftResult.answer?.includes('回复邮件草稿'));
    const out = await skill.execute(
      {
        query: '把刚才那封邮件发出去',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string; to?: string };
    assert.ok(result.answer?.includes('邮件已发送'), result.answer);
    assert.equal(result.to, 'rcpt@example.com');
    assert.ok(fake.transcript.includes(`RCPT TO:<rcpt@example.com>`));
  } finally {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

