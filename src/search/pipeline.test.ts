import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from './llm.js';
import type { QuotaStoreLike } from './quota.js';
import type { MemoryRecord, MemoryStore } from '../memory/store.js';
import type { SearchProvider, SearchProviderResult, SearchResultItem } from './providers/types.js';
import { pipeline } from './pipeline.js';

process.env.SEARCH_METRICS_LOG = join(tmpdir(), 'pipeline-search-metrics-test.jsonl');

class FakeLLM implements LLMClient {
  lastUserContent = '';

  async complete(messages: ChatMessage[]): Promise<string> {
    const system = messages[0]?.content ?? '';
    if (system.includes('搜索意图分类器')) {
      return JSON.stringify({
        intent: 'factual',
        search_query: 'query',
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

test('pipeline: 规则③ 命中严肃类触发 safety 门', async () => {
  const r = await pipeline('高血压 用药注意事项 禁忌', deps);
  assert.equal(r.gate_triggered, 'safety');
  assert.ok(r.answer.includes('医生判断'));
});

test('pipeline: 普通排错 query 不触发 safety 门', async () => {
  const r = await pipeline('ESP32 I2C 通信失败 无应答', deps);
  assert.notEqual(r.gate_triggered, 'safety');
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

test('pipeline: 本地动作未接入执行器时明确返回', async () => {
  const r = await pipeline('查一下我今天的日程', deps);
  assert.ok(r.answer.includes('执行器尚未接入'));
});

test('pipeline: 完整项目路由到 PM 执行器待接入', async () => {
  const r = await pipeline('帮我做一个完整的 App 前端', deps);
  assert.ok(r.answer.includes('project_manager/plan'));
});

test('pipeline: 低置信路由返回选项式消歧', async () => {
  const r = await pipeline('这个方案成本多少，值不值', deps);
  assert.ok(r.answer.includes('你想让我做哪个方向'));
  assert.ok(r.answer.includes('A.'));
});
