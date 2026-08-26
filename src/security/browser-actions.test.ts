import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { BROWSER_ACTION_SET, checkBrowserAction, isCrossOrigin } from './browser-actions.js';

test('browser-actions: 全局白名单含 8 个动作（§4.1.5）', () => {
  assert.deepEqual(
    [...BROWSER_ACTION_SET].sort(),
    ['click', 'download', 'goto', 'hover', 'scroll', 'select', 'type', 'wait'],
  );
});

test('browser-actions: 白名单外动作拒绝（A5：execute_js/set_cookie/open_devtools）', () => {
  for (const action of ['execute_js', 'set_cookie', 'open_devtools', 'evaluate', 'debugger']) {
    const check = checkBrowserAction({ action });
    assert.equal(check.allowed, false, action);
    assert.match(check.reason ?? '', /不在白名单/);
    assert.equal(check.highRisk, false);
  }
});

test('browser-actions: 白名单内动作默认放行、无高风险标记', () => {
  const check = checkBrowserAction({ action: 'click', url: 'https://so.szlcsc.com/ds' });
  assert.equal(check.allowed, true);
  assert.equal(check.highRisk, false);
  assert.deepEqual(check.riskReasons, []);
});

test('browser-actions: SSRF 黑名单拒绝回环/内网 URL（A9）', () => {
  for (const url of ['http://127.0.0.1:8420/admin', 'http://localhost:9222/json', 'http://169.254.169.254/latest']) {
    const check = checkBrowserAction({ action: 'goto', url });
    assert.equal(check.allowed, false, url);
    assert.match(check.reason ?? '', /SSRF/);
  }
});

test('browser-actions: download 恒为高风险（下载）', () => {
  const check = checkBrowserAction({ action: 'download', url: 'https://so.szlcsc.com/a.pdf' });
  assert.equal(check.allowed, true);
  assert.equal(check.highRisk, true);
  assert.ok(check.riskReasons.includes('下载'));
});

test('browser-actions: isSubmit 标记表单提交高风险', () => {
  const check = checkBrowserAction({ action: 'click', url: 'https://so.szlcsc.com/', isSubmit: true });
  assert.equal(check.highRisk, true);
  assert.ok(check.riskReasons.includes('表单提交'));
});

test('browser-actions: isWrite 标记写操作高风险', () => {
  const check = checkBrowserAction({ action: 'type', url: 'https://so.szlcsc.com/', isWrite: true });
  assert.equal(check.highRisk, true);
  assert.ok(check.riskReasons.includes('写操作'));
});

test('browser-actions: goto 跨域导航高风险、同源放行', () => {
  const cross = checkBrowserAction({
    action: 'goto',
    url: 'https://www.st.com/en/search.html',
    currentUrl: 'https://so.szlcsc.com/search',
  });
  assert.equal(cross.highRisk, true);
  assert.ok(cross.riskReasons.includes('跨域导航'));

  const same = checkBrowserAction({
    action: 'goto',
    url: 'https://so.szlcsc.com/detail/1',
    currentUrl: 'https://so.szlcsc.com/search',
  });
  assert.equal(same.highRisk, false);
});

test('browser-actions: 无 currentUrl 的首跳不判跨域', () => {
  const check = checkBrowserAction({ action: 'goto', url: 'https://so.szlcsc.com/' });
  assert.equal(check.highRisk, false);
});

test('browser-actions: isCrossOrigin 判断（非法 URL 保守为真）', () => {
  assert.equal(isCrossOrigin('https://a.com/x', 'https://b.com/y'), true);
  assert.equal(isCrossOrigin('https://a.com/x', 'https://a.com/y'), false);
  assert.equal(isCrossOrigin('not a url', 'https://a.com/y'), true);
});