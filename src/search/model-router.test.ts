import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveModelTier } from './model-router.js';
import { parseModelId } from './model-id.js';

describe('model-router: 按任务难度分档', () => {
  it('执行类任务走重档', () => {
    assert.equal(
      resolveModelTier({ intent: 'execute', actionType: 'create' }),
      'heavy',
    );
  });

  it('GitHub 分析/文档写作走重档', () => {
    assert.equal(resolveModelTier({ intent: 'github_analysis' }), 'heavy');
    assert.equal(resolveModelTier({ intent: 'write_doc' }), 'heavy');
  });

  it('普通搜索问答走默认中档（便宜优先）', () => {
    assert.equal(resolveModelTier({ intent: 'web_search', actionType: 'qa' }), 'medium');
  });

  it('图片/文档任务走中档（VLM/文档处理前不升级）', () => {
    assert.equal(
      resolveModelTier({ intent: 'image_analysis', hasImage: true }),
      'medium',
    );
  });

  it('高置信且无搜索需求可走轻档', () => {
    assert.equal(
      resolveModelTier({ intent: 'local_query', searchNeed: false, confidence: 0.95 }),
      'light',
    );
  });
});

describe('model-id: UI 模型选择解析', () => {
  it('合法 id 解析出 provider 与档位', () => {
    assert.deepEqual(parseModelId('deepseek:heavy'), { provider: 'deepseek', role: 'heavy' });
    assert.deepEqual(parseModelId('zhipu:medium'), { provider: 'zhipu', role: 'medium' });
  });

  it('非法 id / 视觉档返回 null', () => {
    assert.equal(parseModelId(null), null);
    assert.equal(parseModelId('nope'), null);
    assert.equal(parseModelId('deepseek:vision'), null);
    assert.equal(parseModelId(':heavy'), null);
  });
});
