import { strict as assert } from 'node:assert';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  buildFrameEvidence,
  buildVideoMaterial,
  cleanTranscript,
  createLearnerWorkDir,
  createVideoLearnerSkill,
  extractBiliBvid,
  extractVideoUrl,
  isSafeYtDlpUrl,
  isVideoLearnUrlAllowed,
  normalizeProtocolRelativeUrl,
  parseBiliSubtitle,
  videoLearnAllowedHosts,
} from './index.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'video-learner-test-'));
}

test('video-learner: H7 工作目录每次执行唯一且可清理', () => {
  const base = tempDir();
  const a = createLearnerWorkDir(base);
  const b = createLearnerWorkDir(base);
  assert.notEqual(a, b, '并发两次执行必须使用不同目录');
  assert.ok(a.startsWith(base) && b.startsWith(base));
  assert.ok(existsSync(a) && existsSync(b));
  rmSync(a, { recursive: true, force: true });
  rmSync(b, { recursive: true, force: true });
  assert.equal(existsSync(a), false, 'finally 只清理自己的目录');
});

test('video-learner: 提取视频 URL', () => {
  assert.equal(
    extractVideoUrl('学习这个视频 https://www.bilibili.com/video/BV1xx'),
    'https://www.bilibili.com/video/BV1xx',
  );
});

test('video-learner: yt-dlp URL 安全校验（H10）', () => {
  assert.equal(isSafeYtDlpUrl('https://www.youtube.com/watch?v=abc'), true);
  assert.equal(isSafeYtDlpUrl('http://example.com/v.mp4'), true);
  assert.equal(isSafeYtDlpUrl('--exec=calc'), false, '选项形 URL 必须拒绝');
  assert.equal(isSafeYtDlpUrl('file:///etc/passwd'), false, '非 http(s) 必须拒绝');
  assert.equal(isSafeYtDlpUrl(''), false);
});

test('video-learner: 提取 B站 BV 号', () => {
  assert.equal(
    extractBiliBvid('https://www.bilibili.com/video/BV1ZRbe6eENh/?spm_id_from=333'),
    'BV1ZRbe6eENh',
  );
  assert.equal(extractBiliBvid('https://www.youtube.com/watch?v=abc'), null);
});

test('video-learner: 协议相对地址补全 https', () => {
  assert.equal(
    normalizeProtocolRelativeUrl('//aisubtitle.hdslb.com/a.json?auth_key=1'),
    'https://aisubtitle.hdslb.com/a.json?auth_key=1',
  );
  assert.equal(
    normalizeProtocolRelativeUrl('https://aisubtitle.hdslb.com/a.json'),
    'https://aisubtitle.hdslb.com/a.json',
  );
});

test('video-learner: B站字幕 JSON 解析', () => {
  assert.equal(
    parseBiliSubtitle({ body: [{ content: '第一步' }, { content: '第二步' }] }),
    '第一步\n第二步',
  );
  assert.equal(parseBiliSubtitle([{ text: '你好' }]), '你好');
});

test('video-learner: SRT 清洗', () => {
  const srt = '1\n00:00:01,000 --> 00:00:03,000\n第一步\n\n2\n00:00:03,000 --> 00:00:05,000\n第二步\n';
  assert.equal(cleanTranscript(srt), '第一步 第二步');
});

test('video-learner: 关键帧描述按画面编号拼接', () => {
  assert.equal(
    buildFrameEvidence(['打开终端', '运行安装命令']),
    '[画面1] 打开终端\n[画面2] 运行安装命令',
  );
  assert.equal(buildFrameEvidence([]), '');
});

test('video-learner: 字幕与关键帧合并为 LLM 材料', () => {
  const material = buildVideoMaterial('第一步安装依赖', '[画面1] 打开终端');
  assert.ok(material.includes('完整文字稿：'));
  assert.ok(material.includes('关键帧画面描述：'));
  assert.ok(material.indexOf('完整文字稿：') < material.indexOf('关键帧画面描述：'));
  const framesOnly = buildVideoMaterial('', '[画面1] 打开终端');
  assert.ok(!framesOnly.includes('完整文字稿：'));
  assert.ok(framesOnly.includes('关键帧画面描述：'));
});

test('video-learner: 上传字幕生成 Skill JSON', async () => {
  const dir = tempDir();
  try {
    const skill = createVideoLearnerSkill({ outDir: dir, media: false, ytDlp: false });
    const transcript = '第一步安装依赖\n第二步配置环境\n第三步运行验证';
    const added: Array<{ id: string; keywords: string[] }> = [];
    const out = await skill.execute(
      {
        query: '学习这个视频 https://www.bilibili.com/video/BV1xx',
        attachmentSignals: [{ type: 'document', mimeType: 'text/plain', sizeBytes: transcript.length, fileName: 'subs.txt' }],
        rawFiles: [
          {
            name: 'subs.txt',
            type: 'text/plain',
            size: transcript.length,
            arrayBuffer: async () =>
              new TextEncoder().encode(transcript).buffer as ArrayBuffer,
          },
        ],
        memory: null,
      },
      {
        callVLM: async () => '',
        complete: {
          complete: async () =>
            JSON.stringify({
              name: 'video-openclaw-install',
              title: 'OpenClaw 安装',
              triggers: ['openclaw', '安装'],
              intent: 'how_to',
              steps: ['安装依赖', '配置环境', '运行验证'],
              validation: ['命令可执行'],
              summary: 'OpenClaw 安装三步',
              keywords: ['openclaw', '安装'],
            }),
        },
        experienceManager: {
          add: (entry) => added.push(entry),
        },
      },
    );
    const result = out.result as { answer?: string; path?: string; skill?: { name: string } };
    assert.ok(result.answer?.includes('已生成视频学习 Skill'));
    assert.ok(result.answer?.includes('已接入经验库'));
    assert.equal(result.skill?.name, 'video-openclaw-install');
    assert.equal(added.length, 1);
    assert.equal(added[0].id, 'video-openclaw-install');
    assert.ok(added[0].keywords.includes('openclaw'));
    assert.ok(existsSync(result.path as string));
    assert.ok(readFileSync(result.path as string, 'utf-8').includes('openclaw'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('video-learner: B站浏览器会话兜底生成 Skill', async () => {
  const dir = tempDir();
  try {
    const responses = new Map<string, string>([
      [
        'bili-view.json',
        JSON.stringify({ code: 0, data: { cid: 4099, title: 'DeepSeek Harness' } }),
      ],
      [
        'bili-player.json',
        JSON.stringify({
          code: 0,
          data: {
            subtitle: {
              subtitles: [
                { lan: 'zh', subtitle_url: 'https://aisubtitle.hdslb.com/bfs/ai_subtitle/x.json' },
              ],
            },
          },
        }),
      ],
      [
        'bili-subtitle.json',
        JSON.stringify({ body: [{ content: '第一步安装' }, { content: '第二步配置' }] }),
      ],
      [
        'bili-play.json',
        JSON.stringify({
          code: 0,
          data: {
            dash: {
              audio: [{ baseUrl: 'https://upos-sz-mirror.bilivideo.com/a.m4s' }],
              video: [{ id: 16, baseUrl: 'https://upos-sz-mirror.bilivideo.com/v.m4s' }],
            },
          },
        }),
      ],
    ]);
    const binaries = new Map<string, string>([
      ['bili-audio.m4s', 'audio-data'],
      ['bili-video.m4s', 'video-data'],
    ]);
    const skill = createVideoLearnerSkill({ outDir: dir, media: false, ytDlp: false });
    const out = await skill.execute(
      {
        query: '学习这个视频 https://www.bilibili.com/video/BV1ZRbe6eENh/',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      {
        callVLM: async () => '',
        complete: {
          complete: async () =>
            JSON.stringify({
              name: 'video-deepseek-harness',
              title: 'DeepSeek Harness 安装',
              triggers: ['deepseek', 'harness'],
              intent: 'how_to',
              steps: ['安装', '配置'],
              validation: ['可复现'],
              summary: 'B站浏览器会话兜底学习',
              keywords: ['deepseek'],
            }),
        },
        browserSession: {
          fetchPage: async () => ({ url: '', title: '', text: '' }),
          downloadFile: async (_url, dest) => {
            const name = dest.split(/[\\/]/).pop() ?? '';
            const content = responses.get(name) ?? binaries.get(name);
            if (content == null) return { ok: false, size: 0 };
            writeFileSync(dest, content, 'utf-8');
            return { ok: true, size: Buffer.byteLength(content) };
          },
        },
      },
    );
    const result = out.result as { answer?: string; skill?: { name: string } };
    assert.ok(result.answer?.includes('已生成视频学习 Skill'));
    assert.ok(result.answer?.includes('B站浏览器会话'));
    assert.equal(result.skill?.name, 'video-deepseek-harness');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('video-learner: 无字幕时诚实提示', async () => {
  const dir = tempDir();
  try {
    const skill = createVideoLearnerSkill({
      outDir: dir,
      subtitles: false,
      media: false,
    });
    const out = await skill.execute(
      {
        query: '学习这个视频 https://example.com/video',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      { callVLM: async () => '' },
    );
    const result = out.result as { answer?: string };
    assert.ok(result.answer?.includes('没有提取到可用文字稿'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// v2.6 B2：B站域白名单
test('video-learner: 默认白名单含 B站/CDN 域，env 可追加（B2）', () => {
  const previous = process.env.VIDEO_LEARN_ALLOWED_HOSTS;
  try {
    delete process.env.VIDEO_LEARN_ALLOWED_HOSTS;
    const hosts = videoLearnAllowedHosts();
    assert.ok(hosts.includes('bilibili.com'));
    assert.ok(hosts.includes('bilivideo.com'));
    assert.ok(hosts.includes('bilivideo.cn'));
    assert.ok(hosts.includes('hdslb.com'));
    process.env.VIDEO_LEARN_ALLOWED_HOSTS = 'example.com, custom.cn; example.org';
    const extended = videoLearnAllowedHosts();
    assert.ok(extended.includes('example.com'));
    assert.ok(extended.includes('custom.cn'));
    assert.ok(extended.includes('example.org'));
  } finally {
    if (previous === undefined) delete process.env.VIDEO_LEARN_ALLOWED_HOSTS;
    else process.env.VIDEO_LEARN_ALLOWED_HOSTS = previous;
  }
});

test('video-learner: untrusted 字幕/媒体 URL 必须命中 B站域白名单（B2）', () => {
  assert.equal(isVideoLearnUrlAllowed('https://aisubtitle.hdslb.com/bfs/ai_subtitle/x.json'), true);
  assert.equal(isVideoLearnUrlAllowed('https://upos-sz-mirror.bilivideo.com/upgcx/x.m4s'), true);
  assert.equal(isVideoLearnUrlAllowed('https://api.bilibili.com/x/player/playurl'), true);
  assert.equal(isVideoLearnUrlAllowed('https://evil.example.com/steal.m4s'), false);
  assert.equal(isVideoLearnUrlAllowed('//evil.example.com/x.m4s'), false);
  assert.equal(isVideoLearnUrlAllowed('ftp://bilibili.com/x'), false);
});
