import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from './llm.js';
import { rewriteQuery, ruleBasedRewrite } from './query-rewrite.js';

class FakeLLM implements LLMClient {
  constructor(private readonly handler: (messages: ChatMessage[]) => string) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    return this.handler(messages);
  }
}

test('rewrite: LLM 返回多条子查询', async () => {
  const llm = new FakeLLM(() =>
    JSON.stringify({ queries: ['STM32F103C8T6 最大主频', 'STM32F103C8T6 72MHz 规格'] }),
  );
  const r = await rewriteQuery('STM32F103C8T6 最大主频是多少', 'factual', llm);
  assert.equal(r.source, 'llm');
  assert.equal(r.queries.length, 13);
  assert.ok(r.queries.includes('STM32F103C8T6 最大主频'));
  assert.ok(r.queries.includes('STM32F103C8T6 72MHz 规格'));
  assert.ok(r.queries.includes('STM32F103C8T6 立创商城 数据手册'));
  assert.ok(r.queries.includes('STM32F103C8T6 芯查查 数据手册'));
  assert.ok(r.queries.includes('STM32F103C8T6 半导小芯 数据手册'));
});

test('rewrite: LLM 非法输出时保留原 query', async () => {
  const llm = new FakeLLM(() => '不是 JSON');
  const r = await rewriteQuery('Python是什么语言', 'factual', llm);
  assert.equal(r.source, 'rule');
  assert.deepEqual(r.queries, ['Python是什么语言']);
});

test('rewrite: 无 LLM 时保留原 query', async () => {
  const r = await rewriteQuery('Python是什么语言', 'factual');
  assert.equal(r.source, 'rule');
  assert.deepEqual(r.queries, ['Python是什么语言']);
});

test('rewrite: news 无 LLM 时补充年份与最新', async () => {
  const r = await rewriteQuery('今天A股行情', 'news');
  assert.equal(r.source, 'rule');
  assert.ok(r.queries[0].includes('最新'));
  assert.match(r.queries[0], /20\d{2}/);
});

test('rewrite: 型号代码+手机触发精确改写', () => {
  const queries = ruleBasedRewrite('MRT-AL10手机');
  assert.ok(queries[0].includes('MRT-AL10 入网型号 对应手机型号'));
  assert.ok(queries[1].includes('MRT-AL10 手机型号'));
});

test('rewrite: 器件型号自动补官方源子查询', () => {
  const queries = ruleBasedRewrite('STM32F103C8T6 最大主频是多少');
  assert.ok(queries[0].includes('site:st.com'));
  assert.ok(queries.some((q) => q.includes('st.com 官方 数据手册')));
  assert.ok(queries.some((q) => q.includes('site:szlcsc.com')));
  assert.ok(queries.some((q) => q.includes('site:xcc.com')));
  assert.ok(queries.some((q) => q.includes('site:semiee.com')));
  assert.ok(queries.some((q) => q.includes('STM32F103C8T6 立创商城 数据手册')));
  assert.ok(queries.some((q) => q.includes('STM32F103C8T6 半导小芯 数据手册')));
  assert.ok(queries.includes('STM32F103C8T6 最大主频是多少'));
});

test('rewrite: STM32 技术题补官方域子查询', () => {
  const queries = ruleBasedRewrite('如何用硬件定时器在 STM32 上产生一个 PWM 信号？');
  assert.ok(queries.some((q) => q.includes('site:st.com')));
  assert.ok(queries.some((q) => q.includes('site:community.st.com')));
  assert.ok(queries.some((q) => q.includes('PWM 信号') && q.includes('site:st.com')));
});

test('rewrite: Altium SPICE 题补官方域子查询', () => {
  const queries = ruleBasedRewrite('用 Altium 做仿真时，怎么导入第三方 SPICE 模型（如 LTspice 的 .sub 文件）？');
  assert.ok(queries.some((q) => q.includes('site:techdocs.altium.com')));
  assert.ok(queries.some((q) => q.includes('site:altium.com')));
  assert.ok(queries.some((q) => q.includes('site:analog.com')));
});

test('rewrite: BUCK 电感题补 TI 官方子查询', () => {
  const queries = ruleBasedRewrite('BUCK电路的电感发烫，可能是什么原因？');
  assert.ok(queries.some((q) => q.includes('site:ti.com')));
  assert.ok(queries.some((q) => q.includes('site:e2e.ti.com')));
  assert.ok(queries.includes('BUCK电路的电感发烫，可能是什么原因？'));
});

test('rewrite: 非知名前缀型号仍补国内资料站', () => {
  const queries = ruleBasedRewrite('GD32F103C8T6 数据手册');
  assert.ok(queries.some((q) => q.includes('site:szlcsc.com')));
  assert.ok(queries.some((q) => q.includes('site:xcc.com')));
  assert.ok(queries.some((q) => q.includes('site:semiee.com')));
  assert.ok(queries.some((q) => q.includes('GD32F103C8T6 立创商城 数据手册')));
  assert.ok(queries.some((q) => q.includes('GD32F103C8T6 半导小芯 数据手册')));
});

test('rewrite: 软件最新版本优先查 GitHub release 与 npm', () => {
  const queries = ruleBasedRewrite('openclaw最新版本号是多少');
  assert.ok(queries[0].includes('openclaw GitHub release latest version'));
  assert.ok(queries[1].includes('openclaw npm latest version'));
  assert.ok(queries.includes('openclaw最新版本号是多少'));
});

test('rewrite: 世界杯战报生成赛事精确改写', () => {
  const queries = ruleBasedRewrite('世界杯战报', 'news');
  assert.ok(queries[0].includes('决赛 比分 冠军'));
  assert.ok(!queries[0].includes('战报'));
  assert.ok(queries[1].includes('赛果 比分 冠军'));
  assert.ok(queries.some((q) => /20\d{2}/.test(q)));
});

test('rewrite: 航天状态 news 查询优先官方域', () => {
  const queries = ruleBasedRewrite('中国空间站现在有哪几个航天员在太空', 'news');
  assert.ok(queries[0].includes('site:cmse.gov.cn'));
  assert.ok(queries[1].includes('site:cnsa.gov.cn'));
  assert.ok(queries.some((q) => q.includes('最新')));
});

test('rewrite: 航天状态非 news 查询也补官方域', () => {
  const queries = ruleBasedRewrite('中国空间站现在有哪几个航天员在太空');
  assert.ok(queries.some((q) => q.includes('site:cmse.gov.cn')));
  assert.ok(queries.some((q) => q.includes('site:cnsa.gov.cn')));
  assert.ok(queries.some((q) => q.includes('载人航天小喇叭')));
});

test('rewrite: 无 LLM 时手机型号仍走精确改写', async () => {
  const r = await rewriteQuery('MRT-AL10手机', 'factual');
  assert.equal(r.source, 'rule');
  assert.equal(r.queries[0], 'MRT-AL10 入网型号 对应手机型号');
});

test('rewrite: 纯字母缩写/品牌名不生成 datasheet 子查询（E239，IBIS/ULINK/ST-L 精确性修正）', () => {
  for (const q of ['怎样从 TI 官网下载某个芯片的 IBIS 模型？需要注册吗？', 'Keil ULINKplus 功耗测量 同步记录电流电压波形', '用 OpenOCD 0.12 + ST-Link V2 调试 STM32F103 板子，怎么排查？']) {
    const queries = ruleBasedRewrite(q, 'factual');
    assert.ok(!queries.some((x) => x.includes('立创商城') || x.includes('site:szlcsc.com')), String(q) + ' 应不含 datasheet 子查询');
    assert.ok(queries.includes(q), '原查询应保留');
  }
});

test('rewrite: 含数字的器件型号仍生成 datasheet 子查询（E239 不误伤）', () => {
  const queries = ruleBasedRewrite('STM32F103C8T6 最大主频是多少', 'factual');
  assert.ok(queries.some((q) => q.includes('STM32F103C8T6 立创商城 数据手册')));
  assert.ok(queries.some((q) => q.includes('site:xcc.com')));
  assert.ok(queries.includes('STM32F103C8T6 最大主频是多少'));
});

test('rewrite: 金融市值 news 查询优先权威行情源（E270）', () => {
  const queries = ruleBasedRewrite('中国AI大模型公司中市值较高的是哪几家', 'news');
  assert.ok(queries[0].includes('site:eastmoney.com'));
  assert.ok(queries[1].includes('site:sse.com.cn'));
  assert.ok(queries[0].includes('最新'));
});

test('rewrite: 金融市值非 news 查询也补权威源子查询（E270）', () => {
  const queries = ruleBasedRewrite('全球芯片公司市值排名');
  assert.ok(queries.some((q) => q.includes('site:eastmoney.com')));
  assert.ok(queries.some((q) => q.includes('市值 排名 最新')));
});

test('rewrite: 数值列举 query 主检索确定性追加中性触发子查询（E279）', () => {
  const q = '延迟最低的数据库有哪些';
  const queries = ruleBasedRewrite(q);
  assert.equal(queries[0], `${q} 数据 参数 对比`);
  assert.ok(queries.includes(q), '原查询保留');
});

test('rewrite: 数值 query 无 LLM 时增强子查询同样入队（E279 确定性）', async () => {
  const r = await rewriteQuery('4K 下帧率最高的显卡', 'comparison');
  assert.equal(r.source, 'rule');
  assert.ok(r.queries.includes('4K 下帧率最高的显卡 数据 参数 对比'));
  assert.ok(r.queries.includes('4K 下帧率最高的显卡'));
});

test('rewrite: 数值 query + LLM 改写时规则子查询仍强制入队（E279）', async () => {
  const llm = new FakeLLM(() => JSON.stringify({ queries: ['GPU 性能天梯图'] }));
  const r = await rewriteQuery('评分最高的电影有哪些', 'comparison', llm);
  assert.ok(r.queries.includes('评分最高的电影有哪些 数据 参数 对比'));
  assert.ok(r.queries.includes('GPU 性能天梯图'));
});

test('rewrite: GDP 增速类数值 query 同样增强（E279 用户用例 5 回归）', () => {
  const q = '中国 GDP 增速是多少';
  const queries = ruleBasedRewrite(q);
  assert.ok(queries.includes(`${q} 数据 参数 对比`));
  assert.ok(queries.includes(q));
});

test('rewrite: 金融/器件/新闻优先分支不吃数值后缀（E279 回归保护）', () => {
  const fin = ruleBasedRewrite('全球芯片公司市值排名');
  assert.ok(!fin.some((q) => q.includes(' 数据 参数 对比')));
  assert.ok(fin.some((q) => q.includes('site:eastmoney.com')));
  const part = ruleBasedRewrite('STM32F103C8T6 最大主频是多少');
  assert.ok(!part.some((q) => q.includes(' 数据 参数 对比')));
  assert.ok(part.some((q) => q.includes('site:st.com')));
  const news = ruleBasedRewrite('中国AI大模型公司中市值较高的是哪几家', 'news');
  assert.ok(!news.some((q) => q.includes(' 数据 参数 对比')));
});

test('rewrite: 非数值 query 不加增强子查询（E279）', () => {
  const queries = ruleBasedRewrite('什么是关系型数据库');
  assert.deepEqual(queries, ['什么是关系型数据库']);
});

test('rewrite: predicate 用原始 query 判定（E280，分类器剥疑问词修复）', () => {
  const stripped = 'Redis 和 Memcached 读取延迟对比';
  const original = 'Redis 和 Memcached 哪个读取延迟更低';
  const queries = ruleBasedRewrite(stripped, undefined, original);
  assert.equal(queries[0], `${stripped} 数据 参数 对比`);
  assert.ok(queries.includes(stripped));
});

test('rewrite: 无原始 query 时被剥疑问词的串不触发增强（E280 回归）', () => {
  const queries = ruleBasedRewrite('Redis 和 Memcached 读取延迟对比');
  assert.ok(!queries.some((q) => q.includes(' 数据 参数 对比')));
});

test('rewrite: rewriteQuery 透传 originalQuery（E280）', async () => {
  const r = await rewriteQuery(
    'Redis 和 Memcached 读取延迟对比',
    'comparison',
    undefined,
    'Redis 和 Memcached 哪个读取延迟更低',
  );
  assert.equal(r.source, 'rule');
  assert.ok(r.queries.includes('Redis 和 Memcached 读取延迟对比 数据 参数 对比'));
});
