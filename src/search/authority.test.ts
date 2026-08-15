import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  getDomainAuthority,
  isHighTrustDatasheetUrl,
  isOfficialForQuery,
  officialSourceHintForQuery,
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

test('authority: 立创商城与芯查查评分高于默认值', () => {
  assert.ok(getDomainAuthority('https://item.szlcsc.com/515651.html') >= 0.8);
  assert.ok(getDomainAuthority('https://www.xcc.com/part/STM32F103C8T6') >= 0.75);
  assert.ok(getDomainAuthority('https://item.szlcsc.com/515651.html') > 0.3);
  assert.ok(getDomainAuthority('https://www.xcc.com/part/STM32F103C8T6') > 0.3);
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
    isHighTrustDatasheetUrl('https://guba.eastmoney.com/list/002465.html', '北斗芯片 上市公司'),
    false,
  );
});
