#!/usr/bin/env node
/**
 * B 套多轮会话评测（E130 之后）
 * 14 条记忆/上下文/多轮依赖题，统一 userId 连续跑播种轮 + 正式轮，
 * 输出 bench/devil-v25/b-results.jsonl 与 b-multiturn.md，供人工评分。
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AnswerResult } from '../src/search/pipeline.js';
import { pipeline } from '../src/search/pipeline.js';
import { ExperienceManager } from '../src/memory/experience.js';
import { SqliteDirectStore } from '../src/memory/store.js';
import { SkillLifecycle } from '../src/skills/lifecycle.js';
import { SearchSourceStats } from '../src/search/source-stats.js';
import { UserContextStore } from '../src/memory/user-context-store.js';
import { RouteCaseStore } from '../src/agent/route-case-store.js';
import { createHeavyClient, createVisionClient } from '../src/search/llm.js';
import { parseDocumentFile } from '../src/search/document-parser.js';
import type { SkillDeps } from '../src/skills/deps.js';
import { TrajectoryLog } from '../src/trajectory/trajectory-log.js';
import { browserSession } from '../src/browser/session.js';
import type { PipelineDeps } from '../src/search/pipeline.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'bench', 'devil-v25');
const jsonlPath = join(outDir, 'b-results.jsonl');
const mdPath = join(outDir, 'b-multiturn.md');
const scoresExamplePath = join(outDir, 'b-scores.example.json');
const userId = 'bench-b-user';
const limitArg = Number(process.argv[2]);
const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 14;

interface BTurn {
  query: string;
  kind: 'seed' | 'formal';
  expected?: string;
}

interface BScenario {
  id: string;
  focus: string;
  reason: string;
  turns: BTurn[];
}

function loadExistingTurnNotes(
  mdPath: string,
): Map<string, { score?: string; comment?: string }> {
  const notes = new Map<string, { score?: string; comment?: string }>();
  try {
    const text = readFileSync(mdPath, 'utf-8');
    const sections = text.split(/^## /m).slice(1);
    for (const section of sections) {
      const id = section.match(/^([A-Z0-9]+)/)?.[1];
      if (!id) continue;
      const turns = section.split(/^1\. \*\*(?:播种轮|正式轮)\*\*$/m).slice(1);
      turns.forEach((block, i) => {
        const score = block.match(/人工分\(0-3\)：\s*(\d)/)?.[1];
        const comment = block.match(/点评：\s*([^\n]+)/)?.[1]?.trim();
        if (score || comment) notes.set(`${id}:${i + 1}`, { score, comment });
      });
    }
  } catch {
    // 首次生成时没有旧文件，返回空映射
  }
  return notes;
}

function scenarios(c01Path: string): BScenario[] {
  return [
    {
      id: 'EC02',
      focus: '长期记忆召回 + 诚实反馈',
      reason: '上个月功耗问题',
      turns: [
        { query: '帮我解决产品功耗偏高的问题，思路是改用睡眠唤醒模式。', kind: 'seed' },
        { query: '我上个月提的那个功耗问题你解决了吗？', kind: 'formal', expected: '无记录时诚实说没找到，不编造' },
      ],
    },
    {
      id: 'EC10',
      focus: '跨会话记忆检索 + 容错',
      reason: '昨天聊到的东西',
      turns: [
        { query: '昨天我们聊到用 ESP32-C3 做低功耗 BLE 网关的方案。', kind: 'seed' },
        { query: '昨天我们聊到的东西你忘了？', kind: 'formal', expected: '从记忆检索相关话题' },
      ],
    },
    {
      id: 'EC24',
      focus: '模糊纠正处理',
      reason: '我刚才问过的问题',
      turns: [
        { query: '帮我写一个 PID 算法。', kind: 'seed' },
        { query: '我刚才问过的问题，你答案不对，现在重说。', kind: 'formal', expected: '请求具体指正，不盲目重答' },
      ],
    },
    {
      id: 'EC29',
      focus: '语义模糊召回',
      reason: '上次说的日志工具',
      turns: [
        { query: '推荐一个处理日志的工具，我觉得那个很好用。', kind: 'seed' },
        { query: '你上次说那个工具很好用，但我忘了名字，就是那个处理日志的。', kind: 'formal', expected: '列出候选供确认' },
      ],
    },
    {
      id: 'P02',
      focus: '情绪接住 + 缺失信息处理',
      reason: '刚生成的代码',
      turns: [
        { query: '给你看代码：int main(){return 0;}', kind: 'seed' },
        { query: '这代码写得跟屎一样，帮我优化一下。', kind: 'formal', expected: '先共情，再引导提供代码' },
      ],
    },
    {
      id: 'P04',
      focus: 'L2 记忆调用',
      reason: '老规矩',
      turns: [
        { query: '记住：导出嘉立创时，Gerber 要关闭钻孔文件、勾选使用原文件名。', kind: 'seed' },
        { query: '老规矩，把这个原理图导出给嘉立创。', kind: 'formal', expected: '直接执行或按记忆确认' },
      ],
    },
    {
      id: 'P07',
      focus: '程序性记忆调用',
      reason: '老样子',
      turns: [
        { query: '记住：日报格式是先汇总今日完成事项，再列明日计划。', kind: 'seed' },
        { query: '老样子，给老板发个日报。', kind: 'formal', expected: '识别老样子为预置 Skill' },
      ],
    },
    {
      id: 'P08',
      focus: '上下文理解 + 风格转换',
      reason: '刚才那段话',
      turns: [
        { query: '这段话：这个方案我觉得还行，就是报价有点高。', kind: 'seed' },
        { query: '把刚才那段话，用更专业的语气重写一遍，我要发给客户。', kind: 'formal', expected: '基于上一段润色' },
      ],
    },
    {
      id: 'P10',
      focus: '模糊指代 + 历史记忆',
      reason: '上次推荐的芯片',
      turns: [
        { query: '上次我推荐你用 TPS5430 这颗电源芯片。', kind: 'seed' },
        { query: '那个谁，上次推荐的那个电源芯片叫啥来着？', kind: 'formal', expected: '从记忆找回 TPS5430' },
      ],
    },
    {
      id: 'C01',
      focus: '问转做 + 工程落地',
      reason: '按你说的加到工程',
      turns: [
        { query: 'STM32 的 ADC 怎么配置？', kind: 'seed' },
        { query: `按你说的写入 ${c01Path}，内容：int main(void){return 0;}`, kind: 'formal', expected: '写入工程文件并返回备份' },
      ],
    },
    {
      id: 'C02',
      focus: '迭代修改 + 事务性',
      reason: '生成后更正',
      turns: [
        { query: '帮我写个 PID 算法。', kind: 'seed' },
        { query: '不对，我要的是位置式 PID，而且积分限幅要 100。', kind: 'formal', expected: '识别修正意图' },
      ],
    },
    {
      id: 'C03',
      focus: '做转问 + 状态回滚',
      reason: '刚才说的 HAL 库坑',
      turns: [
        { query: '帮我写一段 STM32 HAL 库代码。', kind: 'seed' },
        { query: '算了，不写了。你刚才说的那个 HAL库的坑是啥来着？', kind: 'formal', expected: '停止执行并回溯刚才内容' },
      ],
    },
    {
      id: 'C05',
      focus: '文件操作 + 规则遵循',
      reason: '当前项目打包',
      turns: [
        { query: '把这个项目打包发给我。', kind: 'formal', expected: '无路径时澄清目录' },
        { query: '打包 M:/202608111/src/wiki', kind: 'formal', expected: '真实产出 zip' },
      ],
    },
    {
      id: 'C07',
      focus: '撤销/回滚能力',
      reason: '撤销刚才的操作',
      turns: [
        { query: '我刚才把 main.c 的配置改错了。', kind: 'seed' },
        { query: '撤销刚才的操作，我感觉改错了。', kind: 'formal', expected: '触发事务回滚或说明回滚能力' },
      ],
    },
  ];
}

interface RunTurn {
  scenario: string;
  turn: number;
  kind: string;
  query: string;
  result?: AnswerResult;
  error?: string;
}

async function runTurn(
  query: string,
  deps: PipelineDeps,
  timeoutMs = 120000,
  conversationId?: string,
): Promise<{ result?: AnswerResult; error?: string }> {
  const timer = new Promise<{ error: string }>((resolve) =>
    setTimeout(() => resolve({ error: `timeout after ${timeoutMs}ms` }), timeoutMs),
  );
  const run = (async () => {
    try {
      return { result: await pipeline(query, deps, { userId, conversationId }) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  })();
  return Promise.race([run, timer]);
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const c01Dir = join(root, 'sandbox', `b-c01-${Date.now()}`);
  mkdirSync(c01Dir, { recursive: true });
  const c01Path = join(c01Dir, 'adc.c');
  const memoryDbPath = join(root, 'data', `bench-b-memory-${Date.now()}.db`);
  const userDbPath = join(root, 'data', `bench-b-user-${Date.now()}.db`);

  const experienceManager = new ExperienceManager();
  const skillLifecycle = new SkillLifecycle();
  const sourceStats = new SearchSourceStats();
  const memoryStore = new SqliteDirectStore(memoryDbPath);
  const userContextStore = new UserContextStore(userDbPath);
  const routeCaseStore = new RouteCaseStore();
  const trajectoryLog = new TrajectoryLog();
  const skillDeps: SkillDeps = {
    callVLM: async (input, opts) => createVisionClient()(input, opts),
    complete: {
      complete: async (messages, opts) => createHeavyClient().complete(messages, opts),
    },
    parseDocument: parseDocumentFile,
  };
  const deps: PipelineDeps = {
    tavily: { enabled: true },
    memoryStore,
    experienceManager,
    skillLifecycle,
    sourceStats,
    userContextStore,
    routeCaseStore,
    skillDeps,
    trajectory: trajectoryLog,
    browserSession,
  };

  const all = scenarios(c01Path).slice(0, limit);
  const turns: RunTurn[] = [];
  for (const s of all) {
    for (const [i, t] of s.turns.entries()) {
      const out = await runTurn(t.query, deps, 120000, s.id);
      turns.push({
        scenario: s.id,
        turn: i + 1,
        kind: t.kind,
        query: t.query,
        ...out,
      });
      const r = out.result;
      console.log(
        `[${s.id}:${i + 1}] ${t.kind} gate=${r?.gate_triggered ?? 'error'} conf=${r?.confidence?.toFixed(2) ?? '-'} ev=${r?.evidence.length ?? '-'}`,
      );
    }
  }

  writeFileSync(jsonlPath, turns.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf-8');

  const existingNotes = loadExistingTurnNotes(mdPath);
  const sections = all
    .map((s) => {
      const turnBlocks = s.turns
        .map((t, i) => {
          const run = turns.find((x) => x.scenario === s.id && x.turn === i + 1);
          const ans = (run?.result?.answer ?? run?.error ?? '').replace(/\r?\n/g, ' ').slice(0, 300);
          const existing = existingNotes.get(`${s.id}:${i + 1}`);
          return [
            `1. **${t.kind === 'seed' ? '播种轮' : '正式轮'}**`,
            `   - 原题：${t.query}`,
            `   - 预期：${t.expected ?? '-'}`,
            `   - 回答：${ans}`,
            `   - gate=${run?.result?.gate_triggered ?? '-'} conf=${run?.result?.confidence?.toFixed(2) ?? '-'} ev=${run?.result?.evidence.length ?? 0}`,
            `   - 人工分(0-3)：${existing?.score ?? ''}`,
            existing?.comment ? `   - 点评：${existing.comment}` : '',
          ].join('\n');
        })
        .join('\n');
      return `## ${s.id}（${s.focus}）\n\n- 依赖：${s.reason}\n\n${turnBlocks}`;
    })
    .join('\n\n');
  const md = [
    '# B 套多轮会话评测',
    '',
    `> 日期：${new Date().toISOString()}｜userId=${userId}｜场景=${all.length}`,
    '',
    sections,
    '',
    '评分口径：0=跑题/错误；1=部分正确；2=基本正确；3=完全满足预期且无额外噪声。',
    '',
    '原始数据：`bench/devil-v25/b-results.jsonl`',
    '',
  ].join('\n');
  writeFileSync(mdPath, md, 'utf-8');

  const scores = {
    note: '复制为 b-scores.json 后人工回填 0-3；score=0 时 hardAnswer 必须 false。',
    scenarios: all.map((s) => ({ id: s.id, score: null, hardAnswer: false })),
  };
  writeFileSync(scoresExamplePath, JSON.stringify(scores, null, 2), 'utf-8');

  console.log(`已生成：${jsonlPath}`);
  console.log(`已生成：${mdPath}`);
  console.log(`已生成：${scoresExamplePath}`);

  experienceManager.close();
  skillLifecycle.close();
  sourceStats.close();
  userContextStore.close();
  memoryStore.close();
  rmSync(c01Dir, { recursive: true, force: true });
  rmSync(memoryDbPath, { force: true });
  rmSync(userDbPath, { force: true });
  await Promise.race([
    browserSession.close(),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
