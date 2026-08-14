import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDocumentQaSkill } from '../../src/skills/document-qa/index.js';
import { fakeFile } from './fixtures/fake-files.js';

const MD = `# 一人公司Agent

本方案围绕一人公司设计 AI 秘书。

## 核心原则

先跑通最小闭环，再逐步扩展。
`;

const docFile = fakeFile('一人公司Agent.md', 'text/markdown', MD);

function documentInput(query: string) {
  return {
    query,
    attachmentSignals: [
      { type: 'document', mimeType: 'text/markdown', sizeBytes: MD.length, fileName: '一人公司Agent.md' },
    ],
    rawFiles: [docFile],
    memory: null,
  };
}

test('INT-002：文档总结返回结构化摘要并引用原文', async () => {
  const skill = createDocumentQaSkill();
  const out = await skill.execute(
    documentInput('总结核心要点'),
    {
      callVLM: async () => '',
      parseDocument: async () => MD,
      complete: {
        complete: async () =>
          '1. 围绕一人公司设计 AI 秘书。\n2. 先跑通最小闭环，再逐步扩展。',
      },
    },
  );
  const result = out.result as {
    title: string;
    summary: string;
    headings: Array<{ level: number; text: string }>;
  };
  assert.equal(result.title, '一人公司Agent');
  assert.ok(result.summary.includes('最小闭环'));
  assert.ok(result.headings.some((h) => h.text === '核心原则'));
});

test('INT-002：结构提取返回章节与段落统计', async () => {
  const skill = createDocumentQaSkill();
  const out = await skill.execute(
    documentInput('提取这个文档的结构'),
    {
      callVLM: async () => '',
      parseDocument: async () => MD,
      complete: undefined,
    },
  );
  const result = out.result as {
    title: string;
    headings: Array<{ level: number; text: string }>;
    paragraphCount: number;
  };
  assert.equal(result.title, '一人公司Agent');
  assert.equal(result.headings[0].text, '一人公司Agent');
  assert.equal(result.headings[1].text, '核心原则');
  assert.ok(result.paragraphCount >= 2);
});
