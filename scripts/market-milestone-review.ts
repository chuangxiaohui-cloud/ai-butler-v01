#!/usr/bin/env node
/**
 * E312：市场 Skill milestone-review 包装（E251 @input 文件通道）
 * 用法：npm run market:milestone:review -- <input.txt>
 * input.txt 内容 = 用户 query：生成里程碑复盘模板 md（Markdown + YAML Frontmatter，
 * 供项目经理里程碑复盘自动触发后生成 milestone_review.md 存入 L2 项目记忆，§2.1 项目经理「里程碑复盘」）。
 * 输出沙箱 <标题>-里程碑复盘.md；失败 exit 1。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildMilestoneReview, todayLabel } from '../src/skills/market/templates.js';
import { emitSkillNotification } from '../src/notifications/notification-store.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:milestone:review -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const cleaned = inputText
      .replace(/帮我|请|生成|制作|创建|一个|份|模板|里程碑|复盘/g, '')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .slice(0, 16);
    const title = cleaned || '里程碑复盘';
    const outputMd = join(join(inputFile, '..'), `${title}-里程碑复盘.md`);
    writeFileSync(outputMd, buildMilestoneReview(title, todayLabel()), 'utf-8');
    emitSkillNotification({ role: '项目经理', kind: 'milestone_review', title: '里程碑复盘已生成', detail: outputMd });
    console.log(
      JSON.stringify(
        { ok: true, outputPath: outputMd, templateTitle: title, sections: 'milestone-review+frontmatter' },
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
