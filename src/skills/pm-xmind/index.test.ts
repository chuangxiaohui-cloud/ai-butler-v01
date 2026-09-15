import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test } from 'node:test';

import { createPmXmindSkill } from './index.js';
import { buildOutlinePreviewText, buildXmindBuffer, parseOutlineToTree, parseXmindBuffer, sanitizeOutlineTree, treeToOutlineText } from './format.js';
import type { RawFileLike } from '../deps.js';
import type { SkillInput } from '../registry.js';

const DEPS = { callVLM: async () => '' };

function input(query: string, rawFiles: RawFileLike[] = []): SkillInput {
  return { query, attachmentSignals: [], rawFiles, memory: null };
}

function rawXmind(name: string, buf: Buffer): RawFileLike {
  return {
    name,
    type: 'application/octet-stream',
    size: buf.length,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  };
}

const WBS_OUTLINE =
  '硬件项目任务拆解\n' +
  '1. 系统设计\n' +
  '1.1 需求分析\n' +
  '1.1.1 功能清单\n' +
  '1.2 总体方案\n' +
  '2. 硬件设计\n' +
  '2.1 电源\n' +
  '3. 软件设计';

test('pm-xmind: 带 WBS 大纲生成 .xmind 落盘并给出大纲预览', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pm-xmind-gen-'));
  try {
    const skill = createPmXmindSkill({ outDir: dir });
    const out = await skill.execute(input(`帮我把下面内容做成思维导图：\n${WBS_OUTLINE}`), DEPS);
    const result = out.result as { answer: string; path: string; outline: string };
    assert.ok(result.path.endsWith('.xmind'), result.path);
    assert.ok(result.answer.includes('已生成 Xmind'));
    assert.ok(result.answer.includes('1 系统设计'), result.answer);
    assert.equal(existsSync(result.path), true);
    const tree = await parseXmindBuffer(readFileSync(result.path));
    assert.ok(tree, '生成的 .xmind 应可读回');
    assert.equal(tree.title, '硬件项目任务拆解');
    assert.equal(treeToOutlineText(tree), result.outline, '读回大纲应与生成时一致');
    assert.equal(out.confidence, 0.85);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pm-xmind: 无大纲结构只给使用引导，不写文件', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pm-xmind-guide-'));
  try {
    const skill = createPmXmindSkill({ outDir: dir });
    const out = await skill.execute(input('帮我画一张思维导图'), DEPS);
    const text = typeof out.result === 'string' ? out.result : JSON.stringify(out.result);
    assert.ok(text.includes('大纲'), text);
    assert.ok(text.includes('1.'), text);
    assert.equal(out.confidence, 0.5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pm-xmind: 缩进 + 列表写法也能建树', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pm-xmind-bullet-'));
  try {
    const skill = createPmXmindSkill({ outDir: dir });
    const text = '旅行计划\n- 交通\n  - 高铁\n  - 打车\n- 住宿\n- 餐饮';
    const out = await skill.execute(input(`把下面内容整理成脑图：\n${text}`), DEPS);
    const result = out.result as { path: string; outline: string };
    assert.ok(result.path.endsWith('.xmind'));
    assert.ok(result.outline.includes('1 交通'));
    assert.ok(result.outline.includes('1.1 高铁'));
    assert.ok(result.outline.includes('2 住宿'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pm-xmind: 读取 .xmind 附件回大纲', async () => {
  const treeBuf = await buildXmindBuffer(
    { id: 'x1', title: '周会纪要', children: [{ id: 'x2', title: '议题一', children: [] }] },
  );
  const skill = createPmXmindSkill();
  const out = await skill.execute(input('读取这个 xmind 的大纲', [rawXmind('周会.xmind', treeBuf)]), DEPS);
  const result = out.result as { answer: string; outline: string };
  assert.ok(result.answer.includes('周会纪要'), result.answer);
  assert.ok(result.outline.includes('1 议题一'), result.outline);
  assert.equal(out.confidence, 0.85);
});

test('pm-xmind: 沙箱外路径读取被拒绝', async () => {
  const skill = createPmXmindSkill();
  const out = await skill.execute(input('读取 C:\\Windows\\system32\\secret.xmind 的大纲'), DEPS);
  const text = typeof out.result === 'string' ? out.result : JSON.stringify(out.result);
  assert.ok(text.includes('沙箱'), text);
  assert.equal(out.confidence, 0.3);
});
test('pm-xmind: sanitizeOutlineTree 清洗 LLM 杂质（重复中心主题叶子 + 文末说明叶子）', () => {
  const tree = parseOutlineToTree(
    '嵌入式产品开发全流程\n' +
      '嵌入式产品开发全流程\n' +
      '1. 需求分析\n' +
      '1.1 功能需求定义\n' +
      '2. 方案设计\n' +
      '（证据未覆盖：部分阶段实操步骤信息有待结合具体项目补充完善）',
  );
  assert.ok(tree);
  const clean = sanitizeOutlineTree(tree);
  assert.equal(
    treeToOutlineText(clean),
    '嵌入式产品开发全流程\n1 需求分析\n1.1 功能需求定义\n2 方案设计',
  );
});

test('pm-xmind: buildOutlinePreviewText 只回中心主题 + 一级分支 + 规模，不含深层', () => {
  const tree = parseOutlineToTree('旅行计划\n1. 交通\n1.1 高铁\n2. 住宿');
  assert.ok(tree);
  const preview = buildOutlinePreviewText(tree);
  assert.ok(preview.includes('已把「旅行计划」整理成思维导图大纲'));
  assert.ok(preview.includes('共 2 个一级分支'));
  assert.ok(preview.includes('1. 交通（1 个分支）'));
  assert.ok(preview.includes('2. 住宿'));
  assert.ok(!preview.includes('1.1 高铁'), '紧凑预览不应带二级明细');
});