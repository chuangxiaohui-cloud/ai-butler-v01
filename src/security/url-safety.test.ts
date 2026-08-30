import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { assertSafeBrowserUrl, isBlockedBrowserUrl } from './url-safety.js';

test('url-safety: 拒绝回环/未指定/链路本地/ULA 地址（S1）', () => {
  for (const url of [
    'http://127.0.0.1:8420/',
    'http://127.1.2.3/',
    'http://localhost:9222/',
    'http://0.0.0.0/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]:8420/',
    'http://[::ffff:127.0.0.1]:8420/',
    'http://[fe80::1]/',
    'http://[fc00::1]/',
    'http://[fd12:3456::1]/',
    'http://10.0.0.5/manual.html',
    'http://172.16.0.1/',
    'http://172.31.255.254/',
    'http://192.168.1.10/datasheet.pdf',
    'http://2130706433:8420/',
    'http://0x7f000001:8420/',
  ]) {
    const check = isBlockedBrowserUrl(url);
    assert.equal(check.blocked, true, `应拦截：${url}`);
    assert.ok(check.reason, '拒绝原因不应为空');
  }
});

test('url-safety: 拒绝非 http(s) 协议（S1）', () => {
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/plain,hi', 'chrome://settings/']) {
    const check = isBlockedBrowserUrl(url);
    assert.equal(check.blocked, true, `应拦截：${url}`);
  }
});

test('url-safety: 放行公网地址（RFC1918 已收紧拦截，E292）', () => {
  for (const url of [
    'https://datasheet.szlcsc.com/stm32f103c8t6.pdf',
    'https://example.com/path?q=1',
    'http://172.32.0.1/',
    'http://8.8.8.8/',
    'http://134744072/',
  ]) {
    const check = isBlockedBrowserUrl(url);
    assert.equal(check.blocked, false, `应放行：${url}`);
  }
});

test('url-safety: assertSafeBrowserUrl 拒绝时抛错', () => {
  assert.throws(() => assertSafeBrowserUrl('http://127.0.0.1:8420/'), /安全策略拒绝/);
  assert.throws(() => assertSafeBrowserUrl('not-a-url'), /安全策略拒绝/);
  assert.doesNotThrow(() => assertSafeBrowserUrl('https://example.com/'));
});
