import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveModelTier } from './model-router.js';

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
