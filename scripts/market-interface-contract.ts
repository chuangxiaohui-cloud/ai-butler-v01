#!/usr/bin/env node
/**
 * E311：市场 Skill interface-contract 包装（E251 @input 文件通道）
 * 用法：npm run market:interface:contract -- <input.txt>
 * input.txt 内容 = 用户 query：生成接口契约（机器可读）——含「JSON/schema」→ JSON Schema（.json），
 * 否则 C Header（.h）。契约供子 Agent 校验实现一致性（§2.1 系统架构师「接口契约」）。
 * 输出沙箱 <标题>-接口契约.{h|json}；失败 exit 1。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildInterfaceContract,
  contractMacroToken,
  todayLabel,
  type ContractFormat,
} from '../src/skills/market/templates.js';
import { emitSkillNotification } from '../src/notifications/notification-store.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:interface:contract -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const format: ContractFormat = /JSON|Schema|schema/i.test(inputText) ? 'json-schema' : 'c-header';
    const ext = format === 'json-schema' ? '.json' : '.h';
    const cleaned = inputText
      .replace(/帮我|请|生成|制作|创建|一个|份|模板|接口契约|契约/g, '')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .slice(0, 16);
    const title = cleaned || '接口契约';
    const outputFile = join(join(inputFile, '..'), `${title}-接口契约${ext}`);
    writeFileSync(outputFile, buildInterfaceContract(title, todayLabel(), format), 'utf-8');
    emitSkillNotification({ role: '系统架构师', kind: 'interface_contract', title: '接口契约已生成', detail: outputFile });
    console.log(
      JSON.stringify(
        { ok: true, outputPath: outputFile, templateTitle: title, format, macroToken: contractMacroToken(title) },
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
