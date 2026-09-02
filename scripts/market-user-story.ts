#!/usr/bin/env node
/**
 * E310：市场 Skill user-story 包装（E251 @input 文件通道）
 * 用法：npm run market:user:story -- <input.txt>
 * input.txt 内容 = 用户 query：生成用户故事模板 md（Markdown + YAML Frontmatter，
 * 供项目经理 project-writer 直接读取，§2.1 产品经理拆解用户故事）。
 * 输出沙箱 <标题>-用户故事.md；失败 exit 1。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildUserStory, todayLabel } from '../src/skills/market/templates.js';
import { emitSkillNotification } from '../src/notifications/notification-store.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:user:story -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const cleaned = inputText
      .replace(/帮我|请|生成|制作|创建|一个|份|模板|用户故事|故事/g, '')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .slice(0, 16);
    const title = cleaned || '用户故事';
    const outputMd = join(join(inputFile, '..'), `${title}-用户故事.md`);
    writeFileSync(outputMd, buildUserStory(title, todayLabel()), 'utf-8');
    emitSkillNotification({ role: '产品经理', kind: 'user_story_done', title: '用户故事已生成', detail: outputMd });
    console.log(
      JSON.stringify(
        { ok: true, outputPath: outputMd, templateTitle: title, sections: 'user-story+frontmatter' },
        null,
        2,
      ),
    );
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
