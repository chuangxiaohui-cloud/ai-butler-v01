import { strict as assert } from 'node:assert';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from './llm.js';
import type { SessionContext, SessionContextStore } from '../memory/session-context.js';
import type { QuotaStoreLike } from './quota.js';
import type { MemoryRecord, MemoryStore } from '../memory/store.js';
import type { SearchProvider, SearchProviderResult, SearchResultItem } from './providers/types.js';
import { filterChatSearchNotices, pipeline } from './pipeline.js';
import { getSkills } from '../skills/registry.js';
import { UserContextStore } from '../memory/user-context-store.js';
import { appendOperation } from '../security/operation-log.js';
import { DeepReportStore } from './deep-report-store.js';
import type { TrajectoryEvent } from '../trajectory/trajectory-log.js';

test('pipeline: filterChatSearchNotices 过滤 Tavily 月配额噪音但保留其他预警', () => {
  const filtered = filterChatSearchNotices([
    'Tavily 计划用量已超限，本月不再提供搜索结果（Bocha/AnySearch 不受影响）',
    'Bocha 余额已耗尽，请购买体验包',
    'Tavily 计划用量已超限，本月不再提供搜索结果（Bocha/AnySearch 不受影响）',
  ]);
  assert.deepEqual(filtered, ['Bocha 余额已耗尽，请购买体验包']);
});

process.env.SEARCH_METRICS_LOG = join(tmpdir(), 'pipeline-search-metrics-test.jsonl');
process.env.CALENDAR_DB_PATH = join(tmpdir(), 'pipeline-calendar-test.db');
process.env.MESSAGES_DB_PATH = join(tmpdir(), 'pipeline-messages-test.db');

class FakeLLM implements LLMClient {
  lastUserContent = '';
  recorded: Array<ChatMessage[]> = [];

  async complete(messages: ChatMessage[]): Promise<string> {
    this.recorded.push(messages);
    const system = messages[0]?.content ?? '';
    if (system.includes('意图特征提取器')) {
      const content = system;
      if (content.includes('小鸡啄米')) {
        return JSON.stringify({
          actionType: 'cultural_reference',
          targetDomain: 'unknown',
          scope: 'atomic',
          requiresExternalSearch: false,
          searchSourceHint: 'none',
          hasImplicitContext: false,
          urgency: 'normal',
          rawEntities: [],
          ambiguityFlags: [],
          hasImage: false,
          hasDocument: false,
          attachmentTypes: [],
        });
      }
      if (content.includes('这个图')) {
        return JSON.stringify({
          actionType: 'qa',
          targetDomain: 'unknown',
          scope: 'atomic',
          requiresExternalSearch: false,
          searchSourceHint: 'none',
          hasImplicitContext: true,
          urgency: 'normal',
          rawEntities: [],
          ambiguityFlags: ['missing_referent'],
          hasImage: true,
          hasDocument: false,
          attachmentTypes: ['image/png'],
        });
      }
      if (content.includes('文档')) {
        return JSON.stringify({
          actionType: 'summarize',
          targetDomain: 'document',
          scope: 'multi_step',
          requiresExternalSearch: false,
          searchSourceHint: 'none',
          hasImplicitContext: false,
          urgency: 'normal',
          rawEntities: [],
          ambiguityFlags: [],
          hasImage: false,
          hasDocument: true,
          attachmentTypes: ['text/markdown'],
        });
      }
      if (content.includes('方案成本') || content.includes('值不值')) {
        return JSON.stringify({
          actionType: 'analyze',
          targetDomain: 'finance',
          scope: 'atomic',
          requiresExternalSearch: false,
          searchSourceHint: 'none',
          hasImplicitContext: true,
          urgency: 'normal',
          rawEntities: [],
          ambiguityFlags: ['missing_referent'],
          hasImage: false,
          hasDocument: false,
          attachmentTypes: [],
        });
      }
      if (content.includes('日程')) {
        return JSON.stringify({
          actionType: 'query',
          targetDomain: 'schedule',
          scope: 'atomic',
          requiresExternalSearch: false,
          searchSourceHint: 'local_skill',
          hasImplicitContext: false,
          urgency: 'normal',
          rawEntities: [],
          ambiguityFlags: [],
          hasImage: false,
          hasDocument: false,
          attachmentTypes: [],
        });
      }
      if (content.includes('PRD')) {
        return JSON.stringify({
          actionType: 'create',
          targetDomain: 'document',
          scope: 'multi_step',
          requiresExternalSearch: false,
          searchSourceHint: 'none',
          hasImplicitContext: false,
          urgency: 'normal',
          rawEntities: ['PRD'],
          ambiguityFlags: [],
          hasImage: false,
          hasDocument: false,
          attachmentTypes: [],
        });
      }
      if (content.includes('完整') && content.includes('App')) {
        return JSON.stringify({
          actionType: 'create',
          targetDomain: 'code',
          scope: 'project_level',
          requiresExternalSearch: false,
          searchSourceHint: 'none',
          hasImplicitContext: false,
          urgency: 'normal',
          rawEntities: ['App前端'],
          ambiguityFlags: [],
          hasImage: false,
          hasDocument: false,
          attachmentTypes: [],
        });
      }
      if (content.includes('登录接口')) {
        return JSON.stringify({
          actionType: 'create',
          targetDomain: 'code',
          scope: 'atomic',
          requiresExternalSearch: false,
          searchSourceHint: 'none',
          hasImplicitContext: false,
          urgency: 'normal',
          rawEntities: ['登录接口'],
          ambiguityFlags: [],
          hasImage: false,
          hasDocument: false,
          attachmentTypes: [],
        });
      }
      if (content.includes('发消息')) {
        return JSON.stringify({
          actionType: 'send',
          targetDomain: 'message',
          scope: 'atomic',
          requiresExternalSearch: false,
          searchSourceHint: 'none',
          hasImplicitContext: false,
          urgency: 'normal',
          rawEntities: ['老张'],
          ambiguityFlags: [],
          hasImage: false,
          hasDocument: false,
          attachmentTypes: [],
        });
      }
      if (content.includes('调研报告')) {
        return JSON.stringify({
          actionType: 'deep_report',
          targetDomain: 'search',
          scope: 'multi_step',
          requiresExternalSearch: true,
          searchSourceHint: 'web_search',
          hasImplicitContext: false,
          urgency: 'normal',
          rawEntities: [],
          ambiguityFlags: [],
          hasImage: false,
          hasDocument: false,
          attachmentTypes: [],
        });
      }
      return JSON.stringify({
        actionType: 'query',
        targetDomain: 'search',
        scope: 'atomic',
        requiresExternalSearch: true,
        searchSourceHint: 'web_search',
        hasImplicitContext: false,
        urgency: 'normal',
        rawEntities: [],
        ambiguityFlags: [],
        hasImage: false,
        hasDocument: false,
        attachmentTypes: [],
      });
    }
    if (system.includes('搜索意图分类器')) {
      const userContent = messages[1]?.content ?? '';
      return JSON.stringify({
        intent: 'factual',
        search_query: userContent.includes('MRT-AL10')
          ? 'MRT-AL10 入网型号 对应手机型号'
          : userContent,
        time_window: '不限',
        domain: '不限',
      });
    }
    if (system.includes('严肃领域')) {
      return '请遵医嘱，并以医生判断为准。';
    }
    if (system.includes('深度报告助手')) {
      const userContent = messages[1]?.content ?? '';
      if (userContent.includes('大纲')) return '概述\n关键发现\n应用场景';
      return '本节测试内容（引用 https://example.com/1）。';
    }
    this.lastUserContent = messages[1]?.content ?? '';
    return '根据证据，这是一个测试答案。';
  }
}

class FakeProvider implements SearchProvider {
  readonly id = 'bocha' as const;

  async search(query: string): Promise<SearchProviderResult> {
    return {
      provider: 'bocha',
      ok: true,
      results: [
        {
          title: 't',
          url: 'https://example.com/1',
          content: `${query} 完整 参数 说明 步骤 示例 设计 文档 100A `.repeat(5),
          provider: 'bocha',
        },
      ],
      latencyMs: 1,
    };
  }
}

class FakeQuota implements QuotaStoreLike {
  async take(): Promise<boolean> {
    return true;
  }
}

class FakeMemoryStore implements Pick<MemoryStore, 'put' | 'recall'> {
  async put(): Promise<string> {
    return '1';
  }

  async recall(): Promise<MemoryRecord[]> {
    return [
      {
        session_id: 'v0.1-cli',
        query: 'STM32F103C8T6 最大主频是多少',
        answer: '72MHz',
        confidence: 0.9,
        evidence_hash: 'h',
        timestamp: Date.now(),
      },
    ];
  }
}

class FakeSessionContextStore
  implements Pick<SessionContextStore, 'load' | 'append' | 'compactIfNeeded'>
{
  summary: string | null;
  appendCalls: Array<{ conversationId: string; role: 'user' | 'assistant'; text: string }> = [];

  constructor(summary: string | null = null) {
    this.summary = summary;
  }

  async load(conversationId: string): Promise<SessionContext | null> {
    return this.summary
      ? { conversationId, turns: [], summary: this.summary, updatedAt: new Date().toISOString() }
      : null;
  }

  async append(conversationId: string, role: 'user' | 'assistant', text: string): Promise<void> {
    this.appendCalls.push({ conversationId, role, text });
  }

  async compactIfNeeded(): Promise<SessionContext | null> {
    return null;
  }
}

const deps = {
  llm: new FakeLLM(),
  providers: [new FakeProvider()],
  quota: new FakeQuota(),
  memoryStore: new FakeMemoryStore(),
  sessionContext: new FakeSessionContextStore(),
};

// SEV-1.2 后 SANDBOX_ALLOWED_DIRS 必须落在 workspaceRoot 内：写入类用例改用工作区内临时目录
function sandboxTmpDir(prefix: string): string {
  const base = join(process.cwd(), 'data', 'pipeline-test');
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, prefix));
}

function fakeFile(name: string, type: string, bytes: Uint8Array | string) {
  const u8 = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return {
    name,
    type,
    size: u8.byteLength,
    arrayBuffer: async () => u8.slice().buffer as ArrayBuffer,
  };
}

function fakePng(name = 'shot.png') {
  return fakeFile(name, 'image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
}

test('pipeline: 规则③ 命中严肃类触发 safety 门', async () => {
  const r = await pipeline('高血压 用药注意事项 禁忌', deps);
  assert.equal(r.gate_triggered, 'safety');
  assert.ok(r.answer.includes('医生判断'));
});

test('pipeline: 普通排错 query 不触发 safety 门', async () => {
  const r = await pipeline('ESP32 I2C 通信失败 无应答', deps);
  assert.notEqual(r.gate_triggered, 'safety');
});

test('pipeline: 搜索使用 s2 构造的 search_query', async () => {
  const seen: string[] = [];
  const provider: SearchProvider = {
    id: 'bocha' as const,
    async search(query: string): Promise<SearchProviderResult> {
      seen.push(query);
      return {
        provider: 'bocha',
        ok: true,
        results: [
          {
            title: 't',
            url: 'https://example.com/1',
            content: `${query} 完整 参数 说明 步骤 示例 设计 文档 100A `.repeat(5),
            provider: 'bocha',
          },
        ],
        latencyMs: 1,
      };
    },
  };
  await pipeline('MRT-AL10手机', { ...deps, providers: [provider] });
  assert.ok(seen.includes('MRT-AL10 入网型号 对应手机型号'));
});

test('pipeline: 搜索结果含视频时返回 videos 并追加视频区块', async () => {
  const provider: SearchProvider = {
    id: 'bocha' as const,
    async search(query: string): Promise<SearchProviderResult> {
      return {
        provider: 'bocha',
        ok: true,
        results: [
          {
            title: 'OpenClaw 安装教程',
            url: 'https://www.bilibili.com/video/BV1xx',
            content: `${query} 安装 步骤 完整 参数 说明 示例 `.repeat(5),
            provider: 'bocha',
          },
        ],
        latencyMs: 1,
      };
    },
  };
  const r = await pipeline('openclaw 的安装方法', {
    ...deps,
    providers: [provider],
  });
  assert.ok(Array.isArray(r.videos));
  assert.equal(r.videos?.[0].platform, 'bilibili');
  assert.ok(r.answer.includes('相关视频教程'));
});

test('pipeline: 指代不明先澄清', async () => {
  const r = await pipeline('这个芯片怎么样？', deps);
  assert.ok(r.answer.includes('具体型号'));
  assert.equal(r.gate_triggered, 'none');
});

test('pipeline: Experience/Skill 注入合成上下文并记录使用', async () => {
  const llm = new FakeLLM();
  const usedExperience: string[] = [];
  const usedSkill: string[] = [];
  const r = await pipeline('STM32F103C8T6 最大主频是多少', {
    ...deps,
    llm,
    experienceManager: {
      search: () => [
        {
          id: 'e1',
          skillName: 'chip-analysis',
          content: 'STM32F103C8T6 最大主频 72MHz',
          keywords: ['STM32', '主频'],
          usageCount: 0,
          thumbsDownCount: 0,
          consecutiveDown: 0,
          confidence: 0.8,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
          needsReview: false,
        },
      ],
      recordUse: (id) => usedExperience.push(id),
    },
    skillLifecycle: {
      findBest: () => ({ name: 'chip-analysis' }),
      recordUse: (name) => usedSkill.push(name),
    },
  });
  assert.equal(r.gate_triggered, 'none');
  assert.ok(llm.lastUserContent.includes('项目经验'));
  assert.ok(llm.lastUserContent.includes('最大主频 72MHz'));
  assert.ok(llm.lastUserContent.includes('命中技能'));
  assert.ok(llm.lastUserContent.includes('技能深度分析'));
  assert.ok(llm.lastUserContent.includes('STM32F103C8T6'));
  assert.deepEqual(usedExperience, ['e1']);
  assert.deepEqual(usedSkill, ['chip-analysis']);
});

test('pipeline: 统一轨迹记录路由/技能/搜索/合成/答案', async () => {
  const events: TrajectoryEvent[] = [];
  const r = await pipeline('STM32F103C8T6 最大主频是多少', {
    ...deps,
    trajectory: {
      record: (event) => events.push(event),
    },
  });
  assert.equal(r.gate_triggered, 'none');
  const types = events.map((e) => e.type);
  assert.ok(types.includes('route'));
  assert.ok(types.includes('search'));
  assert.ok(types.includes('synthesize'));
  assert.ok(types.includes('answer'));
  const routeEvent = events.find((e): e is Extract<TrajectoryEvent, { type: 'route' }> => e.type === 'route');
  assert.ok(routeEvent);
  assert.ok(routeEvent.route.matchedRules.length > 0);
});

test('pipeline: onProgress 按阶段回调', async () => {
  const stages: string[] = [];
  await pipeline('STM32F103C8T6 最大主频是多少', deps, {
    onProgress: (stage) => stages.push(stage),
  });
  for (const stage of ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6']) {
    assert.ok(stages.includes(stage), `missing ${stage}`);
  }
});

test('pipeline: onArtifact 记录 Skill 生成/完成', async () => {
  const artifacts: Array<{ skill: string; state: string }> = [];
  await pipeline('查一下我今天的日程', deps, {
    onArtifact: (event) => artifacts.push(event),
  });
  assert.ok(artifacts.some((a) => a.skill === 'calendar-skill' && a.state === 'generating'));
  assert.ok(artifacts.some((a) => a.skill === 'calendar-skill' && a.state === 'done'));
});

test('pipeline: 本地日历查询走 calendar-skill 执行', async () => {
  const r = await pipeline('查一下我今天的日程', deps);
  assert.ok(r.answer.includes('日程'));
});

test('pipeline: 显式 .ics 路径导入走 calendar-skill 并入库', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pipeline-ics-'));
  const oldCal = process.env.CALENDAR_DB_PATH;
  const oldRem = process.env.REMINDERS_DB_PATH;
  process.env.CALENDAR_DB_PATH = join(dir, 'calendar.db');
  process.env.REMINDERS_DB_PATH = join(dir, 'reminders.db');
  const icsPath = join(dir, 'events.ics');
  writeFileSync(
    icsPath,
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//T//CN',
      'BEGIN:VEVENT',
      'UID:1@t',
      'DTSTAMP:20260821T000000Z',
      'DTSTART:20260822T100000Z',
      'SUMMARY:导入测试会',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:2@t',
      'DTSTAMP:20260821T000000Z',
      'DTSTART:20260823T090000Z',
      'RRULE:FREQ=MONTHLY',
      'SUMMARY:每月复杂重复',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n') + '\r\n',
    'utf-8',
  );
  try {
    const freshModule = './pipeline.js?cal-ics-e2e';
    const { pipeline: freshPipeline } = await import(freshModule);
    const r = await freshPipeline(`导入 ${icsPath}`, { ...deps, llm: undefined });
    assert.ok(r.answer.includes('已从 .ics 导入 1 条日程'), r.answer);
    const q = await freshPipeline('查一下我今天的日程', { ...deps, llm: undefined });
    assert.ok(q.answer.includes('导入测试会'), q.answer);
  } finally {
    process.env.CALENDAR_DB_PATH = oldCal;
    process.env.REMINDERS_DB_PATH = oldRem;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline: 发消息走 im-dispatch 待发送队列', async () => {
  const r = await pipeline('发消息给老张，说明天下午开会', deps);
  assert.ok(r.answer.includes('pending'));
});

test('pipeline: 项目打包带路径走 project-packager 真实执行', async (t) => {
  // H2 后打包需过 §10.1 沙箱白名单：目录建在工作区内并显式授权
  const dir = sandboxTmpDir('pipeline-pack-');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'main.c'), 'int main(void){return 0;}\n');
  const oldSandbox = process.env.SANDBOX_ALLOWED_DIRS;
  process.env.SANDBOX_ALLOWED_DIRS = dir;
  try {
    const r = await pipeline(`打包 ${dir}`, { ...deps, llm: undefined });
    assert.ok(r.answer.includes('已打包'));
  } finally {
    if (oldSandbox === undefined) delete process.env.SANDBOX_ALLOWED_DIRS;
    else process.env.SANDBOX_ALLOWED_DIRS = oldSandbox;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline: 陪伴聊天走 life 专用回复且不搜索', async () => {
  const r = await pipeline('今天心情不好，陪我聊聊天。', { ...deps, llm: undefined });
  assert.ok(r.answer.includes('我在呢'));
  assert.equal(r.mode, 'life');
  assert.equal(r.evidence.length, 0);
});

test('pipeline: 你现在是什么模型 → 身份直达回答不搜索（E264）', async () => {
  const r = await pipeline(
    '你现在是什么模型？',
    { ...deps, llm: undefined },
    { modelSelection: { provider: 'deepseek', role: 'light' } },
  );
  assert.ok(r.answer.includes('AI-Agent'));
  assert.ok(r.answer.includes('deepseek'), '应包含当前模型 label');
  assert.equal(r.evidence.length, 0);
  assert.equal(r.mode, 'knowledge');
});

test('pipeline: 按你说的加工程返回结构化澄清', async () => {
  const r = await pipeline('行，按你说的在我的工程里加上。', { ...deps, llm: undefined });
  assert.ok(r.answer.includes('工程路径'));
  assert.equal(r.mode, 'engineering');
});

test('pipeline: 帮我写个 PID 算法 走 engineer 直接执行', async () => {
  const r = await pipeline(
    '帮我写个 PID 算法。',
    {
      ...deps,
      llm: undefined,
      skillDeps: {
        callVLM: async () => '',
        complete: {
          complete: async () => '# PID 算法实现\n\n完整实现。',
        },
      },
    },
    { userId: 'u1' },
  );
  assert.ok(r.answer.includes('PID'));
  assert.equal(r.mode, 'engineering');
});
test('pipeline: 命中已安装市场 Skill 触发词 → 直连执行（E243）', async () => {
  const r = await pipeline(
    '帮我把这两个 BOM 对比一下差异',
    {
      ...deps,
      llm: undefined,
      marketSkillRunner: {
        listInstalledWithTriggers: () => [
          { name: 'bom-diff', triggers: ['BOM 对比', 'bom 差异'] },
        ],
        run: (name: string) =>
          name === 'bom-diff'
            ? {
                ok: true,
                name: 'bom-diff',
                version: '0.1.0',
                results: [
                  { step: 'diff', ok: true, status: 0, stdout: '差异：R1 由 10k 改为 4.7k', stderr: '' },
                ],
                durationMs: 5,
              }
            : { ok: false, name, version: '', results: [], error: 'not found', durationMs: 0 },
      },
    },
    { userId: 'u1' },
  );
  assert.ok(r.answer.includes('差异：R1'));
  assert.equal(r.evidence.length, 0);
});

test('pipeline: 市场 Skill 执行失败如实归因（E243）', async () => {
  const r = await pipeline(
    '帮我把这两个 BOM 对比一下差异',
    {
      ...deps,
      llm: undefined,
      marketSkillRunner: {
        listInstalledWithTriggers: () => [{ name: 'bom-diff', triggers: ['BOM 对比'] }],
        run: () => ({
          ok: false,
          name: 'bom-diff',
          version: '0.1.0',
          results: [],
          error: '步骤被 §10.2 命令白名单拒绝：denied',
          durationMs: 3,
        }),
      },
    },
    { userId: 'u1' },
  );
  assert.ok(r.answer.includes('执行失败'));
  assert.ok(r.answer.includes('denied'));
});

test('pipeline: 未安装市场 Skill 时路由不受影响（E243）', async () => {
  const r = await pipeline(
    'STM32F103C8T6 最大主频是多少',
    {
      ...deps,
      marketSkillRunner: {
        listInstalledWithTriggers: () => [],
        run: () => {
          throw new Error('不应被调用');
        },
      },
    },
    { userId: 'u1' },
  );
  assert.ok(r.answer.length > 0);
});



test('pipeline: 市场 Skill 直连执行时把查询作为 input 传入（E251）', async () => {
  let receivedInput: string | undefined;
  const r = await pipeline(
    '帮我把这两个 BOM 对比一下差异',
    {
      ...deps,
      llm: undefined,
      marketSkillRunner: {
        listInstalledWithTriggers: () => [{ name: 'bom-diff', triggers: ['BOM 对比'] }],
        run: (_name: string, opts?: { input?: string }) => {
          receivedInput = opts?.input;
          return {
            ok: true,
            name: 'bom-diff',
            version: '0.1.0',
            results: [{ step: 'git hash-object @input', ok: true, status: 0, stdout: 'ok', stderr: '' }],
            durationMs: 5,
          };
        },
      },
    },
    { userId: 'u1' },
  );
  assert.ok(r.answer.length > 0);
  assert.equal(receivedInput, '帮我把这两个 BOM 对比一下差异');
});

test('pipeline: project-writer 从上一轮记忆自动回溯写入', async () => {
  const dir = sandboxTmpDir('pipeline-writer-');
  const oldEnv = process.env.SANDBOX_ALLOWED_DIRS;
  process.env.SANDBOX_ALLOWED_DIRS = dir;
  const memoryStore: Pick<MemoryStore, 'put' | 'recall'> = {
    async recall() {
      return [
        {
          session_id: 'v0.1-cli:u1',
          query: 'STM32 的 ADC 怎么配置？',
          answer: '```c\nint main(void){return 0;}\n```',
          confidence: 0.8,
          evidence_hash: 'h',
          timestamp: Date.now(),
        },
      ];
    },
    async put() {
      return '1';
    },
  };
  try {
    const target = join(dir, 'adc.c');
    const r = await pipeline(
      `按你说的写入 ${target}`,
      {
        ...deps,
        llm: undefined,
        memoryStore,
        skillDeps: { callVLM: async () => '' },
      },
      { userId: 'u1' },
    );
    assert.ok(r.answer.includes('已写入'));
    assert.ok(r.answer.includes('已使用上一轮生成内容'));
    assert.equal(readFileSync(target, 'utf-8'), 'int main(void){return 0;}');
  } finally {
    process.env.SANDBOX_ALLOWED_DIRS = oldEnv;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline: 直接“写入 <路径>”走 project-writer', async () => {
  const dir = sandboxTmpDir('pipeline-write-path-');
  const oldSandbox = process.env.SANDBOX_ALLOWED_DIRS;
  const oldLog = process.env.OPERATIONS_LOG_PATH;
  process.env.SANDBOX_ALLOWED_DIRS = dir;
  process.env.OPERATIONS_LOG_PATH = join(dir, 'operations.jsonl');
  const memoryStore: Pick<MemoryStore, 'put' | 'recall'> = {
    recall: async () => [],
    put: async () => '1',
  };
  try {
    const target = join(dir, 'src', 'main.c');
    const r = await pipeline(
      `写入 ${target}，内容：int main(void){return 0;}`,
      {
        ...deps,
        llm: undefined,
        memoryStore,
        skillDeps: { callVLM: async () => '' },
      },
      { userId: 'u1' },
    );
    assert.ok(r.answer.includes('已写入'));
    assert.equal(readFileSync(target, 'utf-8'), 'int main(void){return 0;}');
  } finally {
    process.env.SANDBOX_ALLOWED_DIRS = oldSandbox;
    process.env.OPERATIONS_LOG_PATH = oldLog;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline: rewrite 从近期记忆取原文润色', async () => {
  let recalledSession = '';
  const memoryStore: Pick<MemoryStore, 'put' | 'recall'> = {
    async recall(sessionId: string) {
      recalledSession = sessionId;
      return [
        {
          session_id: sessionId,
          query: '这段话：这个方案我觉得还行，就是报价有点高。',
          answer: '老板，方案本身认可。',
          confidence: 0.8,
          evidence_hash: 'h',
          timestamp: Date.now(),
        },
      ];
    },
    async put() {
      return '1';
    },
  };
  const r = await pipeline(
    '把刚才那段话，用更专业的语气重写一遍，我要发给客户。',
    {
      ...deps,
      llm: undefined,
      memoryStore,
      skillDeps: {
        callVLM: async () => '',
        complete: {
          complete: async () => '该方案整体可行，不过报价仍有优化空间。',
        },
      },
    },
    { userId: 'u1' },
  );
  assert.equal(recalledSession, 'v0.1-cli:u1');
  assert.ok(r.answer.includes('报价仍有优化空间'));
});

test('pipeline: rewrite 无原文时保留澄清', async () => {
  const r = await pipeline(
    '把刚才那段话，用更专业的语气重写一遍。',
    {
      ...deps,
      llm: undefined,
      memoryStore: {
        recall: async () => [],
        put: async () => '1',
      },
    },
    { userId: 'u1' },
  );
  assert.ok(r.answer.includes('请把要重写的内容发给我'));
});

test('pipeline: 完整项目路由到 PM 执行器待接入', async () => {
  const r = await pipeline('帮我做一个完整的 App 前端', deps);
  assert.ok(r.answer.includes('project_manager/plan'));
});

test('pipeline: 低置信路由返回选项式消歧', async () => {
  const r = await pipeline('这个方案成本多少，值不值', deps);
  assert.ok(r.answer.includes('老板，您指的是哪一个方案'));
  assert.ok(r.answer.includes('A.'));
});

test('pipeline: 图片问答经 image-analysis 执行', async () => {
  const r = await pipeline(
    '这个图是什么',
    {
      ...deps,
      skillDeps: {
        callVLM: async () => '截图：对话界面，含表格与代码块。',
      },
    },
    { files: [fakePng('shot.png')], userId: 'u1' },
  );
  assert.ok(r.answer.includes('对话界面'));
});

test('pipeline: 文化梗走 memory 驱动的秘书回复', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pipeline-uc-'));
  const store = new UserContextStore(join(dir, 'user-context.db'));
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
    store.addSessionSummary('u1', 's1', '讨论短视频选题', ['短视频选题'], now);

    const r = await pipeline(
      '小鸡啄米图是什么梗',
      {
        ...deps,
        userContextStore: store,
        skillDeps: {
          callVLM: async () => '',
          complete: {
            complete: async () => '这是《唐伯虎点秋香》的经典桥段。',
          },
        },
      },
      { userId: 'u1' },
    );
    assert.ok(r.answer.includes('星爷') || r.answer.includes('唐伯虎'));
    assert.ok(r.answer.includes('短视频'));
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline: 记住指令直接写入长期事实且不搜索', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pipeline-remember-'));
  const store = new UserContextStore(join(dir, 'user-context.db'));
  try {
    const r = await pipeline(
      '记住：导出嘉立创时，Gerber 要关闭钻孔文件、勾选使用原文件名。',
      { ...deps, llm: undefined, userContextStore: store },
      { userId: 'u1' },
    );
    assert.ok(r.answer.includes('已记住'));
    assert.equal(r.evidence.length, 0);
    const ctx = store.load('u1');
    assert.ok(ctx.longTermFacts.some((f) => f.content.includes('关闭钻孔文件')));
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline: 记住的事实注入后续老规矩提问', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pipeline-remember-recall-'));
  const store = new UserContextStore(join(dir, 'user-context.db'));
  try {
    store.addFact(
      'u1',
      '导出嘉立创时，Gerber 要关闭钻孔文件、勾选使用原文件名。',
      'user_explicit',
    );
    const llm = new FakeLLM();
    const r = await pipeline(
      '老规矩，把这个原理图导出给嘉立创。',
      { ...deps, llm, userContextStore: store },
      { userId: 'u1' },
    );
    assert.equal(r.gate_triggered, 'none');
    assert.ok(llm.lastUserContent.includes('关闭钻孔文件'));
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline: 撤销指令恢复最近写入备份', async () => {
  const dir = sandboxTmpDir('pipeline-rollback-');
  const oldLog = process.env.OPERATIONS_LOG_PATH;
  const oldSandbox = process.env.SANDBOX_ALLOWED_DIRS;
  process.env.OPERATIONS_LOG_PATH = join(dir, 'operations.jsonl');
  process.env.SANDBOX_ALLOWED_DIRS = dir;
  const target = join(dir, 'src', 'main.c');
  const backup = join(dir, 'backups', 'main.c.bak');
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'backups'), { recursive: true });
  writeFileSync(target, 'new', 'utf-8');
  writeFileSync(backup, 'old', 'utf-8');
  appendOperation({
    userId: 'u1',
    action: 'write',
    path: target,
    backup,
    created: false,
  });
  try {
    const r = await pipeline(
      '撤销刚才的操作，我感觉改错了。',
      { ...deps, llm: undefined },
      { userId: 'u1' },
    );
    assert.ok(r.answer.includes('已回滚'));
    assert.equal(readFileSync(target, 'utf-8'), 'old');
  } finally {
    process.env.OPERATIONS_LOG_PATH = oldLog;
    process.env.SANDBOX_ALLOWED_DIRS = oldSandbox;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline: 撤销无记录时诚实说明', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pipeline-rollback-empty-'));
  const oldLog = process.env.OPERATIONS_LOG_PATH;
  process.env.OPERATIONS_LOG_PATH = join(dir, 'operations.jsonl');
  try {
    const r = await pipeline(
      '撤销刚才的操作，我感觉改错了。',
      { ...deps, llm: undefined },
      { userId: 'u1' },
    );
    assert.ok(r.answer.includes('没有找到最近由我执行的写入操作'));
  } finally {
    process.env.OPERATIONS_LOG_PATH = oldLog;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline: 撤销只作用于同一会话', async () => {
  const dir = sandboxTmpDir('pipeline-rollback-conv-');
  const oldLog = process.env.OPERATIONS_LOG_PATH;
  const oldSandbox = process.env.SANDBOX_ALLOWED_DIRS;
  process.env.OPERATIONS_LOG_PATH = join(dir, 'operations.jsonl');
  process.env.SANDBOX_ALLOWED_DIRS = dir;
  const target = join(dir, 'src', 'main.c');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(target, 'new', 'utf-8');
  appendOperation({
    userId: 'u1',
    conversationId: 'conv1',
    action: 'write',
    path: target,
    backup: null,
    created: true,
  });
  try {
    const other = await pipeline(
      '撤销刚才的操作，我感觉改错了。',
      { ...deps, llm: undefined },
      { userId: 'u1', conversationId: 'conv2' },
    );
    assert.ok(other.answer.includes('没有找到最近由我执行的写入操作'));
    assert.equal(existsSync(target), true);

    const same = await pipeline(
      '撤销刚才的操作，我感觉改错了。',
      { ...deps, llm: undefined },
      { userId: 'u1', conversationId: 'conv1' },
    );
    assert.ok(same.answer.includes('已回滚'));
    assert.equal(existsSync(target), false);
  } finally {
    process.env.OPERATIONS_LOG_PATH = oldLog;
    process.env.SANDBOX_ALLOWED_DIRS = oldSandbox;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline: 文档总结经 document-qa 执行', async () => {
  const md = `# 一人公司Agent

本方案围绕一人公司设计 AI 秘书。

## 核心原则

先跑通最小闭环，再逐步扩展。
`;
  const r = await pipeline(
    '总结这个文档的要点',
    {
      ...deps,
      skillDeps: {
        callVLM: async () => '',
        parseDocument: async () => md,
        complete: {
          complete: async () =>
            '1. 围绕一人公司设计 AI 秘书。\n2. 先跑通最小闭环，再逐步扩展。',
        },
      },
    },
    {
      files: [fakeFile('一人公司Agent.md', 'text/markdown', md)],
      userId: 'u1',
    },
  );
  assert.ok(r.answer.includes('最小闭环'));
});

test('pipeline: PDF 原理图生成 BOM 走 schematic-bom', async () => {
  const text = 'R1 10k 0603\nR2 10k 0603\nC1 100nF 0603\nU1 STM32F103 LQFP48\n';
  const r = await pipeline(
    '帮我把这个PDF的原理图生成BOM表',
    {
      ...deps,
      llm: undefined,
      skillDeps: {
        callVLM: async () => '',
        parseDocument: async () => text,
      },
    },
    { files: [fakeFile('schematic.pdf', 'application/pdf', text)] },
  );
  assert.ok(r.answer.includes('已生成 BOM'));
  assert.ok(r.answer.includes('schematic'));
  assert.equal(r.evidence.length, 0);
});

test('pipeline: 考勤表模板走 office-daily 且不搜索', async () => {
  const r = await pipeline(
    '帮我做一个考勤表模板',
    { ...deps, llm: undefined, skillDeps: { callVLM: async () => '' } },
    { userId: 'u1' },
  );
  assert.ok(r.answer.includes('考勤表模板'));
  assert.equal(r.mode, 'life');
  assert.equal(r.evidence.length, 0);
});


test('pipeline: 会话摘要注入路由上下文并 append 轮次', async () => {
  const session = new FakeSessionContextStore('实体：STM32F103；决策：72MHz；未决：超频待确认。');
  const llm = new FakeLLM();
  await pipeline(
    '继续讨论 STM32 选型',
    { ...deps, llm, sessionContext: session },
    { conversationId: 'conv-s1' },
  );
  assert.equal(session.appendCalls.length, 2);
  assert.equal(session.appendCalls[0].role, 'user');
  assert.equal(session.appendCalls[1].role, 'assistant');
  assert.ok(session.appendCalls.every((c) => c.conversationId === 'conv-s1'));
  const sawSummary = llm.recorded.some((msgs) =>
    msgs.some((m) => m.content.includes('实体：STM32F103')),
  );
  assert.ok(sawSummary, '会话摘要应注入 LLM 上下文');
});

test('pipeline: 无 conversationId 不启用会话上下文', async () => {
  const session = new FakeSessionContextStore('实体：X；决策：Y');
  await pipeline('普通查询', { ...deps, sessionContext: session });
  assert.equal(session.appendCalls.length, 0);
});

test('pipeline: 执行器真实失败如实归因（B4）', async () => {
  // im-dispatch 的 dbPath 在 registry 模块加载时捕获（ESM 导入先于本文件模块体），
  // 实际落在 cwd/data/messages.db——对该路径用目录占位即可让 ensureDb 必然抛错
  const dbPath = join(process.cwd(), 'data', 'messages.db');
  const skills = getSkills();
  const imDispatch = skills.find((s) => s.name === 'im-dispatch') as unknown as
    | { close?: () => void }
    | undefined;
  imDispatch?.close?.();
  const existedAsFile = existsSync(dbPath) && !statSync(dbPath).isDirectory();
  if (existsSync(dbPath)) rmSync(dbPath, { recursive: true, force: true });
  mkdirSync(dbPath, { recursive: true });
  try {
    // im-dispatch 的 ensureDb 对目录路径开库必然抛错 → 走 B4 失败归因
    const r = await pipeline('发消息给老张，说明天下午开会', deps);
    assert.ok(r.answer.includes('执行器执行失败：im-dispatch'));
    assert.ok(r.answer.includes('当前无法完成'));
    assert.ok(!r.answer.includes('尚未接入'));
  } finally {
    rmSync(dbPath, { recursive: true, force: true });
    if (existedAsFile) writeFileSync(dbPath, '');
    imDispatch?.close?.();
  }
});

test('pipeline: 深度报告走搜索 + 分阶段报告生成 + 证据附录', async () => {
  const llm = new FakeLLM();
  const progress: string[] = [];
  const dir = sandboxTmpDir('deep-report');
  const result = await pipeline(
    '写一份 STM32 的调研报告',
    {
      llm,
      providers: [new FakeProvider()],
      quota: new FakeQuota(),
      memoryStore: new FakeMemoryStore(),
      deepReportStore: new DeepReportStore(join(dir, 'jobs.jsonl')),
      deepReportLlm: llm,
    },
    { onProgress: (s) => progress.push(s) },
  );
  assert.match(result.answer, /^# 写一份 STM32 的调研报告/);
  assert.match(result.answer, /## 概述/);
  assert.match(result.answer, /## 证据附录/);
  assert.ok(result.answer.includes('https://example.com/1'));
  assert.ok(progress.includes('report-outline'));
  assert.ok(progress.some((s) => s.startsWith('report-section-')));
  assert.ok(progress.includes('report-evidence'));
  assert.equal(result.evidence.length, 1);
});
class HangAfterFirstSectionLLM extends FakeLLM {
  private firstSectionDone = false;

  override async complete(messages: ChatMessage[]): Promise<string> {
    const user = messages[messages.length - 1]?.content ?? '';
    if (user.includes('大纲')) return '概述\n关键发现\n应用场景';
    if (user.includes('撰写报告小节')) {
      if (!this.firstSectionDone) {
        this.firstSectionDone = true;
        return '已生成的第一节（取消前完成）。';
      }
      // 第二节挂起，等待外部取消
      return await new Promise<never>(() => {});
    }
    return super.complete(messages);
  }
}

test('pipeline: 深度报告取消后同 query 自动恢复已生成分节', async () => {
  const dir = sandboxTmpDir('deep-report-resume');
  const store = new DeepReportStore(join(dir, 'jobs.jsonl'));

  // 第一轮：第二节挂起后取消 → 落盘 1 节 cancelled job
  const controller = new AbortController();
  const llm1 = new HangAfterFirstSectionLLM();
  const progress1: string[] = [];
  const p1 = pipeline(
    '写一份 STM32 的调研报告',
    {
      llm: llm1,
      providers: [new FakeProvider()],
      quota: new FakeQuota(),
      memoryStore: new FakeMemoryStore(),
      deepReportStore: store,
      deepReportLlm: llm1,
    },
    { onProgress: (s) => progress1.push(s), signal: controller.signal },
  );
  setTimeout(() => controller.abort(), 100);
  const r1 = await p1;
  assert.match(r1.answer, /深度报告已取消/);
  const cancelled = store.findResumable('写一份 STM32 的调研报告');
  assert.ok(cancelled, '取消后应有可恢复 job');
  assert.ok(cancelled.sections.length >= 1, '已生成分节应落盘');
  assert.match(cancelled.sections[0], /已生成的第一节/);

  // 第二轮：同 query 自动恢复，保留第一节、续写剩余分节、完成 markDone
  const llm2 = new FakeLLM();
  const progress2: string[] = [];
  const r2 = await pipeline(
    '写一份 STM32 的调研报告',
    {
      llm: llm2,
      providers: [new FakeProvider()],
      quota: new FakeQuota(),
      memoryStore: new FakeMemoryStore(),
      deepReportStore: store,
      deepReportLlm: llm2,
    },
    { onProgress: (s) => progress2.push(s) },
  );
  assert.ok(progress2.includes('report-resumed'), '恢复应透出 report-resumed 进度');
  assert.match(r2.answer, /^# 写一份 STM32 的调研报告/);
  assert.match(r2.answer, /已生成的第一节（取消前完成）。/, '恢复保留已生成分节');
  assert.match(r2.answer, /## 证据附录/);
  assert.equal(store.findResumable('写一份 STM32 的调研报告'), null, '完成后不再可恢复');
});
