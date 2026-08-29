import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cooccursWithQuery,
  hasNumericUnit,
  numericUnitCount,
  queryTopicTokens,
  NUMERIC_UNITS,
} from './numeric-pattern.js';
import { PARAMS } from '../config/params.js';

test('numeric-pattern: 数字+量级单位识别（零领域词表）', () => {
  assert.equal(hasNumericUnit('寒武纪市值6300亿'), true);
  assert.equal(hasNumericUnit('科大讯飞1022亿'), true);
  assert.equal(hasNumericUnit('智谱1.07万亿'), true);
  assert.equal(hasNumericUnit('国产AI大模型规模有望超700亿元'), true);
  assert.equal(hasNumericUnit('增长 8%'), true);
  assert.equal(hasNumericUnit('价格99元'), true);
  assert.equal(hasNumericUnit('评分4.5'), false, '纯数字无单位不命中');
  assert.equal(hasNumericUnit('延迟200ms'), true, '单位表含 ms（E277 跨领域扩展）');
  assert.equal(hasNumericUnit('竞争力排名前六'), false);
});

test('numeric-pattern: 跨领域列举型证据单位识别（E277 通用性钉死）', () => {
  // ① 数据库延迟：ms 计入密度 + P-137 补检索后缀不再含金融单位
  assert.equal(
    hasNumericUnit('PostgreSQL pgbench 实测 12ms，SQLite 8.5ms，ClickHouse 45ms'),
    true,
    'ms 计入密度',
  );
  assert.ok(
    numericUnitCount('PostgreSQL pgbench 实测 12ms，SQLite 8.5ms，ClickHouse 45ms') >= 3,
    'ms 独立数值计入密度计数',
  );
  assert.equal(PARAMS.numericSupplementSuffix, ' 数据 参数 对比', 'P-137 后缀为领域中性触发词');
  assert.ok(!PARAMS.numericSupplementSuffix.includes('亿'), 'P-137 后缀不含金融单位');
  // ② CPU 核数（硬件规格）
  assert.equal(hasNumericUnit('EPYC 9654 共 96 核 2.4GHz，至强 8480+ 56 核'), true);
  assert.ok(
    numericUnitCount('EPYC 9654 共 96 核 2.4GHz，至强 8480+ 56 核') >= 2,
    '核/GHz 计入密度',
  );
  // ③ 游戏帧率（音视频）
  assert.equal(hasNumericUnit('RTX 4090 在 4K 跑到 120 帧，RX 7900XTX 约 95 fps'), true);
  assert.ok(
    numericUnitCount('RTX 4090 在 4K 跑到 120 帧，RX 7900XTX 约 95 fps') >= 2,
    '帧/fps 计入密度',
  );
  // ④ 商品评分（电商，无金额单位也命中）
  assert.equal(hasNumericUnit('索尼 WH-1000XM5 评分 4.9 星，Bose QC Ultra 4.8 颗'), true);
  assert.ok(
    numericUnitCount('索尼 WH-1000XM5 评分 4.9 星，Bose QC Ultra 4.8 颗') >= 2,
    '星/颗 计入密度',
  );
  // ⑤ 反例：纯概念泛文无数值，不触发密度
  assert.equal(
    hasNumericUnit('关系型数据库是基于关系模型的数据库管理系统，强调 ACID 特性'),
    false,
  );
  assert.equal(numericUnitCount('关系型数据库是基于关系模型的数据库管理系统，强调 ACID 特性'), 0);
});

test('numeric-pattern: query 主题词提取与共现', () => {
  const tokens = queryTopicTokens('中国AI大模型公司市值较高的是哪几家?');
  assert.ok(tokens.includes('大模型'));
  assert.ok(tokens.includes('市值'));
  assert.ok(!tokens.includes('中国'), '停用词剔除');
  assert.ok(!tokens.includes('公司'), '停用词剔除');
  assert.equal(cooccursWithQuery('寒武纪市值6300亿', '中国AI大模型公司市值较高的是哪几家?'), true);
  assert.equal(cooccursWithQuery('寒武纪 6300 亿 位列芯片榜首', '中国AI大模型公司市值较高的是哪几家?'), false);
});

test('numeric-pattern: 独立数值计数（[P-136] 密度加权）按「数值+单位」去重', () => {
  assert.equal(
    numericUnitCount('昆仑万维:总市值:408亿 科大讯飞:总市值:1022亿 万兴科技:总市值:104亿 三六零:总市值:555亿'),
    4,
    '公司数据页多个独立市值',
  );
  assert.equal(numericUnitCount('市场规模有望超700亿元 突破2万亿参数'), 2, '泛文少量数字');
  assert.equal(numericUnitCount('700亿元 700亿元 700亿'), 1, '同值去重（空格差异归一）');
  assert.equal(numericUnitCount('竞争格局 排名 前六 无数字'), 0);
});

test('numeric-pattern: 吞吐/百分位单位识别（E279）', () => {
  const throughput = 'PostgreSQL 写入 20000 TPS，读取 50000 QPS，磁盘 1500 IOPS';
  assert.equal(hasNumericUnit(throughput), true, 'TPS/QPS/IOPS 命中');
  assert.ok(numericUnitCount(throughput) >= 3, '吞吐三单位计入密度');
  const percentile = '基准测试 p99 延迟 8.5ms，p50 延迟 5ms';
  assert.equal(hasNumericUnit(percentile), true, '百分位页经 ms 兜底命中');
  assert.ok(numericUnitCount(percentile) >= 2, '百分位页独立数值计入密度');
  assert.ok(
    ['p50', 'p99', 'p999', 'TPS', 'QPS', 'IOPS'].every((u) => NUMERIC_UNITS.includes(u)),
    'E279 六项单位入表',
  );
});
