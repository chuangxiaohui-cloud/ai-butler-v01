import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from './llm.js';
import type { QuotaStoreLike } from './quota.js';
import type { MemoryRecord, MemoryStore } from '../memory/store.js';
import type { SearchProvider, SearchProviderResult, SearchResultItem } from './providers/types.js';
import { pipeline } from './pipeline.js';
import { UserContextStore } from '../memory/user-context-store.js';
import type { TrajectoryEvent } from '../trajectory/trajectory-log.js';

process.env.SEARCH_METRICS_LOG = join(tmpdir(), 'pipeline-search-metrics-test.jsonl');
process.env.CALENDAR_DB_PATH = join(tmpdir(), 'pipeline-calendar-test.db');
process.env.MESSAGES_DB_PATH = join(tmpdir(), 'pipeline-messages-test.db');

class FakeLLM implements LLMClient {
  lastUserContent = '';

  async complete(messages: ChatMessage[]): Promise<string> {
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

const deps = {
  llm: new FakeLLM(),
  providers: [new FakeProvider()],
  quota: new FakeQuota(),
  memoryStore: new FakeMemoryStore(),
};

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

test('pipeline: 本地日历查询走 calendar-skill 执行', async () => {
  const r = await pipeline('查一下我今天的日程', deps);
  assert.ok(r.answer.includes('日程'));
});

test('pipeline: 发消息走 im-dispatch 待发送队列', async () => {
  const r = await pipeline('发消息给老张，说明天下午开会', deps);
  assert.ok(r.answer.includes('pending'));
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
