import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildVideoBlock, collectVideoResults } from './videos.js';

test('videos: 识别 B站/YouTube/抖音', () => {
  const videos = collectVideoResults([
    { title: '安装教程', url: 'https://www.bilibili.com/video/BV1xx' },
    { title: 'Demo', url: 'https://www.youtube.com/watch?v=abc' },
    { title: '短视频', url: 'https://www.douyin.com/video/123' },
    { title: '普通页', url: 'https://example.com/a' },
  ]);
  assert.equal(videos.length, 3);
  assert.equal(videos[0].platform, 'bilibili');
  assert.equal(videos[1].platform, 'youtube');
  assert.equal(videos[2].platform, 'douyin');
});

test('videos: 无视频时区块为空', () => {
  assert.equal(buildVideoBlock([]), '');
});

test('videos: 答案区块包含视频链接', () => {
  const block = buildVideoBlock([
    { title: '安装教程', url: 'https://www.bilibili.com/video/BV1xx', platform: 'bilibili' },
  ]);
  assert.ok(block.includes('相关视频教程'));
  assert.ok(block.includes('bilibili.com/video/BV1xx'));
});
