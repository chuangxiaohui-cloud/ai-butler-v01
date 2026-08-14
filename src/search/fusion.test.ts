import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { SearchResultItem } from './providers/types.js';
import { fuseResults } from './fusion.js';

function item(partial: Partial<SearchResultItem> & Pick<SearchResultItem, 'url' | 'title'>): SearchResultItem {
  return {
    content: '内容 示例 100A 输入输出 说明 步骤 参数 稳定 可靠',
    provider: 'bocha',
    ...partial,
  } as SearchResultItem;
}

test('fusion: 实体过滤器丢弃不匹配型号', () => {
  const items = [
    item({ url: 'https://a.com/1', title: 'STM32F103 主频', content: 'STM32F103C8T6 最大主频 72MHz' }),
    item({ url: 'https://b.com/2', title: 'ESP32 主频', content: 'ESP32 主频 240MHz' }),
  ];
  const r = fuseResults('STM32F103C8T6 最大主频是多少', items, 'factual');
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].result.url, 'https://a.com/1');
});

test('fusion: 实体过滤器不把 TPS5430DDA 当 TPS5430', () => {
  const items = [
    item({
      url: 'https://lcsc.example/dda',
      title: 'TPS5430DDA 中文资料',
      content: 'TPS5430DDA 4.5-60V 参数 说明 设计 文档 示例 完整 内容 足够 长',
    }),
    item({
      url: 'https://lcsc.example/5430',
      title: 'TPS5430 输入电压范围',
      content: 'TPS5430 输入电压 4.5-36V 参数 说明 设计 文档 示例 完整 内容 足够 长',
    }),
  ];
  const r = fuseResults('TPS5430 输入电压范围', items, 'factual');
  assert.equal(r.items.some((f) => f.result.url.includes('dda')), false);
  assert.equal(r.items.some((f) => f.result.url.includes('5430')), true);
});

test('fusion: 实体过滤器不把 TPS5430-Q1 当 TPS5430', () => {
  const items = [
    item({
      url: 'https://www.ti.com.cn/q1',
      title: 'TPS5430-Q1 汽车类3A 宽输入范围降压转换器',
      content: 'TPS5430-Q1 5.5V 至 36V 参数 说明 设计 文档 示例 完整 内容 足够 长',
    }),
    item({
      url: 'https://www.ti.com.cn/5430',
      title: 'TPS5430 输入电压范围',
      content: 'TPS5430 输入电压 4.5-36V 参数 说明 设计 文档 示例 完整 内容 足够 长',
    }),
  ];
  const r = fuseResults('TPS5430 输入电压范围', items, 'factual');
  assert.equal(r.items.some((f) => f.result.url.includes('q1')), false);
  assert.equal(r.items.some((f) => f.result.url.includes('5430')), true);
});

test('fusion: 软件项目官方 GitHub 源识别为官方', () => {
  const items = [
    item({
      url: 'https://github.com/tauri-apps/tauri',
      title: 'Build smaller, faster, and more secure desktop applications',
      content: 'Tauri framework architecture tech stack usage features 100A 完整 内容 足够 长',
    }),
    item({
      url: 'https://medium.example/tauri',
      title: 'Medium Tauri 框架 架构 技术栈',
      content: 'Tauri 框架 架构 技术栈 完整 说明 内容 示例 足够 长 100A',
    }),
  ];
  const r = fuseResults('Tauri 框架 架构 技术栈', items, 'github_analysis');
  const github = r.items.find((f) => f.result.url.includes('github.com'));
  const medium = r.items.find((f) => f.result.url.includes('medium.example'));
  assert.ok(github);
  assert.equal(github.official, true);
  assert.ok(medium);
  assert.ok(github.finalScore >= 0.4);
  assert.ok(medium.finalScore >= 0.4);
});

test('fusion: 低相关性且无答案覆盖的页面降权', () => {
  const items = [
    item({
      url: 'https://dictionary.example/gao',
      title: '高',
      content: '高血压 汉字 笔顺 字源 释义 读音 用法 例句 100A 完整 内容 足够 长',
    }),
    item({
      url: 'https://health.example/answer',
      title: '高血压 用药注意事项 禁忌',
      content: '高血压 用药 注意事项 禁忌 血压 控制 建议 医生 完整 内容 足够 长 100A',
    }),
  ];
  const r = fuseResults('高血压 用药注意事项 禁忌', items, 'factual');
  const dictionary = r.items.find((f) => f.result.url.includes('dictionary.example'));
  const health = r.items.find((f) => f.result.url.includes('health.example'));
  assert.equal(dictionary, undefined);
  assert.ok(health);
  assert.ok(health.finalScore >= 0.4);
});

test('fusion: 高答案覆盖页面不被低词面相关性拖垮', () => {
  const items = [
    item({
      url: 'https://www.mouser.com/c/semiconductors/stm32f103c8',
      title: 'STM32F103C8T6 Datasheet: Explained',
      content:
        'STM32F103C8T6 maximum frequency 72 MHz voltage current description features specifications 100A 完整 内容 足够 长 '.repeat(
          5,
        ),
    }),
  ];
  const r = fuseResults('STM32F103C8T6 最大主频是多少', items, 'factual');
  const top = r.items[0];
  assert.ok(top);
  assert.ok(top.answerCoverage >= 0.6);
  assert.ok(top.finalScore >= 0.6);
});

test('fusion: troubleshooting 标题缺具体错误词降权', () => {
  const copper = item({
    url: 'https://php.example/copper',
    title: 'Altium Designer 铺铜报错怎么办 AD 铺铜规则设置方法',
    content:
      'Altium Designer 铺铜报错 DRC Clearance Polygon 管理 清理 幽灵铜皮 完整 内容 足够 长 100A '.repeat(5),
  });
  const drc = item({
    url: 'https://blog.example/drc',
    title: 'Altium Designer DRC clearance constraint 报错 完整教程',
    content:
      'Altium Designer DRC clearance constraint 设计规则 检查 设置 排查 步骤 完整 内容 足够 长 100A '.repeat(5),
  });
  const r = fuseResults('Altium Designer DRC clearance constraint 报错', [copper, drc], 'troubleshooting');
  assert.equal(r.items[0]?.result.url.includes('drc'), true);
});

test('fusion: how_to FAQ 无操作流程降权', () => {
  const faq = item({
    url: 'https://faq.example/50',
    title: '个税6项专项附加扣除常见疑问50答',
    content: '个税APP进不去怎么办 模板哪里下载 住房贷款利息怎么扣除 完整 内容 足够 长 100A '.repeat(5),
  });
  const guide = item({
    url: 'https://guide.example/how',
    title: '个税专项附加扣除如何填报 步骤',
    content:
      '登录 个人所得税APP 点击 填报 选择 继续教育 下一步 提交 完整 内容 足够 长 100A '.repeat(5),
  });
  const r = fuseResults('个人所得税 专项附加扣除 怎么申报', [faq, guide], 'how_to');
  assert.equal(r.items[0]?.result.url.includes('guide'), true);
});

test('fusion: 跨引擎同 URL 去重', () => {
  const items = [
    item({ url: 'https://same.example/1', title: 'x', content: 'STM32F103C8T6 72MHz 主频 说明' }),
    item({ url: 'https://same.example/1', title: 'x dup', content: 'STM32F103C8T6 72MHz 主频 说明' }),
  ];
  const r = fuseResults('STM32F103C8T6 最大主频是多少', items, 'factual');
  assert.equal(r.items.length, 1);
});

test('fusion: E02 官方源仲裁后综合分胜出', () => {
  const items = [
    item({
      url: 'https://blog.csdn.net/abc/123',
      title: 'TPS5430 输入电压范围 4.5-60V',
      content: 'TPS5430 输入电压范围 4.5-60V 说明 参数 电路 设计 示例 完整 内容 足够 长',
    }),
    item({
      url: 'https://www.ti.com/product/TPS5430',
      title: 'TPS5430 datasheet',
      content: 'TPS5430 输入电压 4.5-36V 参数 设计 说明 完整 内容 足够 长 示例',
    }),
  ];
  const r = fuseResults('TPS5430 输入电压范围', items, 'factual');
  const ti = r.items.find((f) => f.result.url.includes('ti.com'));
  const csdn = r.items.find((f) => f.result.url.includes('csdn.net'));
  assert.ok(ti);
  assert.ok(csdn);
  assert.equal(ti.official, true);
  assert.equal(csdn.factConsistency, 0);
  assert.ok(ti.finalScore > csdn.finalScore);
});

test('fusion: 官方源优先于低权威“野史”来源', () => {
  const items = [
    item({
      url: 'https://www.st.com/en/microcontrollers-microprocessors/stm32f103c8.html',
      title: 'STM32F103C8T6 Datasheet',
      content: 'STM32F103C8T6 maximum frequency 72 MHz voltage current datasheet specifications',
    }),
    item({
      url: 'https://www.douban.com/group/topic/123',
      title: 'STM32F103C8T6 最大主频',
      content: 'STM32F103C8T6 最大主频 72MHz 百度贴吧 淘宝 商城 完整 内容 说明 参数 足够 长 100A',
    }),
  ];
  const r = fuseResults('STM32F103C8T6 最大主频是多少', items, 'factual');
  const st = r.items.find((f) => f.result.url.includes('st.com'));
  const douban = r.items.find((f) => f.result.url.includes('douban.com'));
  assert.ok(st);
  assert.ok(douban);
  assert.equal(st.official, true);
  assert.ok(st.finalScore > douban.finalScore);
  assert.ok(douban.domainAuthority < st.domainAuthority);
});

test('fusion: SEO 垃圾页降权', () => {
  const base = item({
    url: 'https://bad.example/1',
    title: 'STM32F103C8T6 最大主频是多少',
    content:
      'STM32F103C8T6 最大主频是多少 24小时在线客服 加微信 联系电话 完整 说明 参数 示例 设计 文档 100A '.repeat(5),
  });
  const good = item({
    url: 'https://good.example/2',
    title: 'STM32F103C8T6 最大主频是多少',
    content:
      'STM32F103C8T6 最大主频是多少 72MHz 完整 参数 说明 步骤 示例 设计 文档 100A '.repeat(5),
  });
  const r = fuseResults('STM32F103C8T6 最大主频是多少', [base, good], 'factual');
  const bad = r.items.find((f) => f.result.url.includes('bad.example'));
  const ok = r.items.find((f) => f.result.url.includes('good.example'));
  assert.ok(bad, '垃圾页应保留但降权');
  assert.equal(bad.seoNoise, true);
  assert.ok(ok && ok.finalScore > bad.finalScore);
});

test('fusion: 浏览器二次取证的高可信页不吃 SEO 降权', () => {
  const browserPage = item({
    url: 'https://item.szlcsc.com/datasheet/GD32F103C8T6/79128.html',
    title: 'GD32F103C8T6 数据手册',
    content:
      'GD32F103C8T6 数据手册 108MHz 64KB Flash 20KB SRAM 在线客服 购物车 立即购买 参数 说明 设计 文档 100A '.repeat(5),
    provider: 'browser',
  });
  const searchPage = item({
    url: 'https://bad.example/1',
    title: 'GD32F103C8T6 数据手册',
    content:
      'GD32F103C8T6 数据手册 108MHz 64KB Flash 20KB SRAM 在线客服 购物车 立即购买 参数 说明 设计 文档 100A '.repeat(5),
    provider: 'bocha',
  });
  const r = fuseResults('GD32F103C8T6 数据手册', [browserPage, searchPage], 'factual');
  const browser = r.items.find((f) => f.result.provider === 'browser');
  const search = r.items.find((f) => f.result.provider === 'bocha');
  assert.ok(browser && search);
  assert.equal(browser.seoNoise, false);
  assert.equal(search.seoNoise, true);
  assert.ok(browser.finalScore > search.finalScore);
});

test('fusion: 无结果时低置信门控', () => {
  const r = fuseResults('ESP32 I2C 通信失败 无应答', [], 'troubleshooting');
  assert.equal(r.items.length, 0);
  assert.equal(r.lowConfidence, true);
});

test('fusion: 版本查询用检索子词算相关性，官方 release 胜出', () => {
  const items = [
    item({
      url: 'https://www.php.cn/faq/2941376.html',
      title: 'OpenClaw怎么更新到最新版本',
      content: 'OpenClaw 更新 教程 最新 版本 步骤 说明 完整 内容 2026 参数 稳定 可靠',
      published: '2026-08-05T00:00:00+08:00',
    }),
    item({
      url: 'https://github.com/openclaw/openclaw/releases',
      title: 'Releases · openclaw/openclaw · GitHub',
      content: 'Releases openclaw openclaw GitHub openclaw 2026.7.1 release latest version',
    }),
  ];
  const r = fuseResults(
    'openclaw最新版本号是多少',
    items,
    'factual',
    undefined,
    'openclaw GitHub release latest version',
  );
  assert.ok(r.items[0].result.url.includes('github.com/openclaw'));
});
