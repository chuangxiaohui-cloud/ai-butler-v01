import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  buildOfficialQueryContext,
  getDomainAuthority,
  isHighTrustDatasheetUrl,
  isFinanceMarketQuery,
  isOfficialForQuery,
  isOfficialForQueryCtx,
  officialSourceHintForQuery,
  techOfficialDomainsForQuery,
} from './authority.js';

test('authority: 器件型号前缀映射官方域', () => {
  assert.deepEqual(
    officialSourceHintForQuery('STM32F103C8T6 最大主频是多少'),
    { vendor: 'STM32', domain: 'st.com' },
  );
  assert.deepEqual(
    officialSourceHintForQuery('ESP32-C3-MINI-1 引脚'),
    { vendor: 'ESP32', domain: 'espressif.com' },
  );
  assert.equal(officialSourceHintForQuery('世界杯战报'), null);
});

test('authority: Tauri GitHub 仓库识别为官方源', () => {
  assert.equal(
    isOfficialForQuery('https://github.com/tauri-apps/tauri', 'Tauri 框架 架构 技术栈'),
    true,
  );
  assert.equal(
    isOfficialForQuery('https://medium.example/tauri', 'Tauri 框架 架构 技术栈'),
    false,
  );
});

test('authority: OpenWorker GitHub 仓库识别为官方源', () => {
  assert.equal(
    isOfficialForQuery('https://github.com/andrewyng/openworker', 'OpenWorker 项目 用途'),
    true,
  );
});

test('authority: OpenClaw GitHub 与官方文档识别为官方源', () => {
  assert.equal(
    isOfficialForQuery('https://github.com/openclaw/openclaw/releases', 'openclaw最新版本号是多少'),
    true,
  );
  assert.equal(
    isOfficialForQuery('https://docs.openclaw.ai/releases', 'openclaw最新版本号是多少'),
    true,
  );
});

test('authority: 型号变体页面不误判为官方源', () => {
  assert.equal(
    isOfficialForQuery('https://item.szlcsc.com/515651.html', 'TPS5430 输入电压范围'),
    false,
  );
});

test('authority: 航天状态问题识别官方域名', () => {
  assert.equal(
    isOfficialForQuery(
      'https://www.cmse.gov.cn/n29/index.html',
      '中国空间站现在有哪几个航天员在太空',
    ),
    true,
  );
  assert.equal(
    isOfficialForQuery(
      'https://www.cnsa.gov.cn/n6758823/n6758838/index.html',
      '中国空间站现在有哪几个航天员在太空',
    ),
    true,
  );
  assert.equal(
    isOfficialForQuery(
      'https://news.qq.com/rain/a/20260617A09LP700',
      '中国空间站现在有哪几个航天员在太空',
    ),
    false,
  );
});

test('authority: 航天官方域名权威度高于默认值', () => {
  assert.ok(getDomainAuthority('https://www.cmse.gov.cn/') >= 0.9);
  assert.ok(getDomainAuthority('https://www.cnsa.gov.cn/') >= 0.9);
});

test('authority: 立创商城/芯查查/半导小芯评分高于默认值', () => {
  assert.ok(getDomainAuthority('https://item.szlcsc.com/515651.html') >= 0.8);
  assert.ok(getDomainAuthority('https://www.xcc.com/part/STM32F103C8T6') >= 0.75);
  assert.ok(getDomainAuthority('https://www.semiee.com/') >= 0.75);
  assert.ok(getDomainAuthority('https://item.szlcsc.com/515651.html') > 0.3);
  assert.ok(getDomainAuthority('https://www.xcc.com/part/STM32F103C8T6') > 0.3);
  assert.ok(getDomainAuthority('https://www.semiee.com/') > 0.3);
});

test('authority: 原厂与国内资料站都算高可信资料源', () => {
  assert.equal(
    isHighTrustDatasheetUrl('https://www.st.com/zh/stm32f103c8.html', 'STM32F103C8T6 主频'),
    true,
  );
  assert.equal(
    isHighTrustDatasheetUrl('https://item.szlcsc.com/515651.html', 'STM32F103C8T6 主频'),
    true,
  );
  assert.equal(
    isHighTrustDatasheetUrl('https://www.xcc.com/part/stm32f103c8t6', 'STM32F103C8T6 主频'),
    true,
  );
  assert.equal(
    isHighTrustDatasheetUrl('https://www.semiee.com/datasheet/stm32f103c8t6', 'STM32F103C8T6 主频'),
    true,
  );
  assert.equal(
    isHighTrustDatasheetUrl('https://guba.eastmoney.com/list/002465.html', '北斗芯片 上市公司'),
    false,
  );
});

test('authority: 技术题官方域映射', () => {
  assert.deepEqual(techOfficialDomainsForQuery('STM32 看门狗 PWM'), [
    'st.com',
    'community.st.com',
  ]);
  assert.ok(techOfficialDomainsForQuery('BUCK电路电感发烫').includes('e2e.ti.com'));
  assert.ok(techOfficialDomainsForQuery('Altium SPICE .sub').includes('techdocs.altium.com'));
});

test('authority: e2e/community/freertos 域识别为官方源', () => {
  assert.equal(
    isOfficialForQuery('https://e2e.ti.com/support/power-management/', 'BUCK 电感发烫'),
    true,
  );
  assert.equal(
    isOfficialForQuery('https://community.st.com/t5/stm32-mcus/', 'STM32 看门狗'),
    true,
  );
  assert.equal(
    isOfficialForQuery('https://www.freertos.org/', 'FreeRTOS 异常处理'),
    true,
  );
  assert.equal(getDomainAuthority('https://e2e.ti.com/') >= 1.0, true);
  assert.equal(getDomainAuthority('https://community.st.com/') >= 1.0, true);
  assert.equal(getDomainAuthority('https://www.freertos.org/') >= 1.0, true);
});
test('authority: buildOfficialQueryContext 派生值一次计算（P6）', () => {
  const ctx = buildOfficialQueryContext('STM32 看门狗 PWM');
  assert.equal(ctx.q, 'stm32 看门狗 pwm');
  assert.deepEqual(ctx.techDomains, ['st.com', 'community.st.com']);
  assert.equal(ctx.spaceStatus, false);
  assert.equal(ctx.part, 'STM32');
  assert.deepEqual(ctx.vendor, { prefix: 'STM32', domain: 'st.com' });
  const spaceCtx = buildOfficialQueryContext('中国空间站现在有哪几个航天员在太空');
  assert.equal(spaceCtx.spaceStatus, true);
  assert.equal(spaceCtx.part, null);
  const noPartCtx = buildOfficialQueryContext('Tauri 框架 架构 技术栈');
  assert.equal(noPartCtx.part, null);
  assert.equal(noPartCtx.vendor, null);
  const partCtx = buildOfficialQueryContext('TPS5430 输入电压范围');
  assert.equal(partCtx.part, 'TPS5430');
  assert.deepEqual(partCtx.vendor, { prefix: 'TPS', domain: 'ti.com' });
});

test('authority: isOfficialForQueryCtx 与 isOfficialForQuery 等价（P6）', () => {
  const query = 'Tauri 框架 架构 技术栈';
  const ctx = buildOfficialQueryContext(query);
  const urls = [
    'https://github.com/tauri-apps/tauri',
    'https://medium.example/tauri',
    'https://www.st.com/zh/stm32f103c8.html',
    'https://item.szlcsc.com/515651.html',
  ];
  for (const url of urls) {
    assert.equal(isOfficialForQueryCtx(url, ctx), isOfficialForQuery(url, query));
  }
});

test('authority: 大写 query 仍识别官方源（P6 预编译 nameRe）', () => {
  assert.equal(
    isOfficialForQuery('https://github.com/tauri-apps/tauri', 'TAURI 框架 架构'),
    true,
  );
  assert.equal(
    isOfficialForQuery('https://docs.openclaw.ai/releases', 'OPENCLAW最新版本号是多少'),
    true,
  );
});

test('authority: 金融市值查询识别 + 权威源域名评分（E270 补 §6.5.3）', () => {
  assert.equal(isFinanceMarketQuery('中国AI大模型公司中市值较高的是哪几家'), true);
  assert.equal(isFinanceMarketQuery('STM32F103C8T6 最大主频是多少'), false);
  assert.equal(getDomainAuthority('https://quote.eastmoney.com/sz300474.html'), 0.85);
  assert.equal(getDomainAuthority('https://www.sse.com.cn/'), 1.0);
  assert.equal(getDomainAuthority('https://www.szse.cn/'), 1.0);
});

