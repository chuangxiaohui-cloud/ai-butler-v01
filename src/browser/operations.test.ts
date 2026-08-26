import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { BrowserOperationRunner, parseBrowserStep, type BrowserDriver, type BrowserOpStep } from './operations.js';
import type { DomSnapshot } from './dom-observe.js';

function fakeDriver(overrides: Partial<BrowserDriver> = {}): BrowserDriver & { calls: string[] } {
  const calls: string[] = [];
  const driver: BrowserDriver = {
    async goto(url) {
      calls.push(`goto ${url}`);
      return { url, title: 'fake' };
    },
    async click() {
      calls.push('click');
    },
    async type() {
      calls.push('type');
    },
    async select() {
      calls.push('select');
    },
    async scroll() {
      calls.push('scroll');
    },
    async hover() {
      calls.push('hover');
    },
    async wait() {
      calls.push('wait');
    },
    async download(url) {
      calls.push(`download ${url}`);
      return { path: 'x.pdf' };
    },
    async resolveHref(selector) {
      calls.push(`resolveHref ${selector}`);
      return 'https://so.szlcsc.com/ds/a.PDF';
    },
    async currentUrl() {
      return 'https://so.szlcsc.com/search';
    },
    async observe(): Promise<DomSnapshot> {
      return {
        text: '[ref=1] button: 搜索',
        refs: [{ ref: 1, tag: 'button', text: '搜索' }],
        elementCount: 1,
        interactiveCount: 1,
        truncated: false,
      };
    },
    ...overrides,
  };
  return Object.assign(driver, { calls });
}

function policy(overrides: Partial<Parameters<BrowserOperationRunner['run']>[1]> = {}) {
  return {
    skill: 'ds',
    domains: ['szlcsc.com'],
    isAuthorized: () => true,
    ...overrides,
  };
}

function step(line: string): BrowserOpStep {
  const parsed = parseBrowserStep(line, 'STM32F103');
  assert.equal(parsed.ok, true, (parsed as { error?: string }).error);
  return (parsed as { ok: true; step: BrowserOpStep }).step;
}

test('operations: DSL 解析 goto @query 编码注入、type @query 原样注入', () => {
  const gotoStep = parseBrowserStep('goto https://so.szlcsc.com/search?k=@query', 'STM32F103 C8T6');
  assert.equal(gotoStep.ok, true);
  if (gotoStep.ok) assert.equal(gotoStep.step.url, 'https://so.szlcsc.com/search?k=STM32F103%20C8T6');

  const typeStep = parseBrowserStep('type @1 STM32F103 @query', 'C8T6');
  assert.equal(typeStep.ok, true);
  if (typeStep.ok) {
    assert.equal(typeStep.step.ref, '@1');
    assert.equal(typeStep.step.text, 'STM32F103 C8T6');
    assert.equal(typeStep.step.isWrite, true);
  }
});

test('operations: DSL 解析非法动作/缺参/缺 @query 输入报错', () => {
  assert.equal(parseBrowserStep('execute_js alert(1)').ok, false);
  assert.equal(parseBrowserStep('goto').ok, false);
  assert.equal(parseBrowserStep('wait abc').ok, false);
  assert.equal(parseBrowserStep('scroll a b').ok, false);
  const noQuery = parseBrowserStep('goto https://so.szlcsc.com/?q=@query');
  assert.equal(noQuery.ok, false);
  assert.match((noQuery as { error: string }).error, /@query/);
});

test('operations: 域名不在白名单拒绝（A1）；子域命中放行（A4）', async () => {
  const driver = fakeDriver();
  const runner = new BrowserOperationRunner({ driver });
  const denied = await runner.run([step('goto https://evil.com/x')], policy());
  assert.equal(denied.ok, false);
  assert.match(denied.error ?? '', /不在 Skill 域名白名单/);
  assert.equal(driver.calls.length, 0); // 未执行任何动作

  const subdomain = await runner.run([step('goto https://so.szlcsc.com/x')], policy());
  assert.equal(subdomain.ok, true);
  assert.equal(driver.calls[0], 'goto https://so.szlcsc.com/x');
});

test('operations: 域名未授权拒绝（A3）', async () => {
  const driver = fakeDriver();
  const runner = new BrowserOperationRunner({ driver });
  const out = await runner.run([step('goto https://so.szlcsc.com/x')], policy({ isAuthorized: () => false }));
  assert.equal(out.ok, false);
  assert.match(out.error ?? '', /未获用户授权/);
});

test('operations: 白名单外动作拒绝（A5）', async () => {
  const driver = fakeDriver();
  const runner = new BrowserOperationRunner({ driver });
  const evil = { action: 'execute_js', raw: 'execute_js alert(1)' } as unknown as BrowserOpStep;
  const out = await runner.run([evil], policy());
  assert.equal(out.ok, false);
  assert.match(out.error ?? '', /不在白名单/);
});

test('operations: Skill 动作子集收窄后子集外动作拒绝（A6）', async () => {
  const driver = fakeDriver();
  const runner = new BrowserOperationRunner({ driver });
  const out = await runner.run(
    [step('goto https://so.szlcsc.com/x'), step('click @1')],
    policy({ allowedActions: new Set(['goto']) }),
  );
  assert.equal(out.ok, false);
  assert.match(out.error ?? '', /动作不在 Skill 声明的动作子集/);
  assert.equal(driver.calls.length, 1); // goto 已执行，click 被拦
});

test('operations: SSRF URL 拒绝（A9）', async () => {
  const driver = fakeDriver();
  const runner = new BrowserOperationRunner({ driver });
  const out = await runner.run([step('goto http://127.0.0.1:8420/admin')], policy());
  assert.equal(out.ok, false);
  assert.match(out.error ?? '', /SSRF/);
});

test('operations: 高风险动作默认拒绝（A7 审批双闸）', async () => {
  const driver = fakeDriver();
  const runner = new BrowserOperationRunner({ driver });
  const out = await runner.run([step('download https://so.szlcsc.com/a.pdf')], policy());
  assert.equal(out.ok, false);
  assert.match(out.error ?? '', /未获用户确认/);
  assert.equal(out.results[0].denied, true);
  assert.equal(driver.calls.length, 0);
});

test('operations: 高风险动作确认后放行（A7 确认分支）', async () => {
  const driver = fakeDriver();
  const runner = new BrowserOperationRunner({ driver });
  const confirmed: string[] = [];
  const out = await runner.run([step('download https://so.szlcsc.com/a.pdf')], {
    ...policy(),
    confirm: (s, reasons) => {
      confirmed.push(`${s.raw}:${reasons.join('/')}`);
      return true;
    },
  });
  assert.equal(out.ok, true);
  assert.deepEqual(confirmed, ['download https://so.szlcsc.com/a.pdf:下载']);
  assert.equal(driver.calls[0], 'download https://so.szlcsc.com/a.pdf');
});

test('operations: 单任务动作数超 [P-124] 中止并归因（A10）', async () => {
  const driver = fakeDriver();
  const runner = new BrowserOperationRunner({ driver, maxSteps: 3 });
  const steps = [
    step('goto https://so.szlcsc.com/'),
    step('click @1'),
    step('hover @2'),
    step('wait 100'),
  ];
  const out = await runner.run(steps, policy());
  assert.equal(out.ok, false);
  assert.match(out.error ?? '', /\[P-124\]/);
  assert.equal(driver.calls.length, 0); // 超限即中止，不执行
});

test('operations: 单步超时 [P-125] 步骤失败归因，不静默继续（A11）', async () => {
  const driver = fakeDriver({
    async goto() {
      return new Promise((resolve) => {
        setTimeout(() => resolve({ url: 'x', title: 'x' }), 500);
      });
    },
  });
  const runner = new BrowserOperationRunner({ driver, stepTimeoutMs: 20 });
  const out = await runner.run([step('goto https://so.szlcsc.com/')], policy());
  assert.equal(out.ok, false);
  assert.equal(out.results[0].timedOut, true);
  assert.match(out.results[0].error ?? '', /\[P-125\]/);
});

test('operations: 动作留痕（A8 onAction 记录每一步）', async () => {
  const driver = fakeDriver();
  const trace: string[] = [];
  const runner = new BrowserOperationRunner({ driver, onAction: (r) => trace.push(`${r.step.action}:${r.ok}`) });
  const out = await runner.run(
    [step('goto https://so.szlcsc.com/'), step('wait 10')],
    policy(),
  );
  assert.equal(out.ok, true);
  assert.deepEqual(trace, ['goto:true', 'wait:true']);
  assert.ok(out.finalSnapshot !== undefined);
  assert.ok(out.finalSnapshot.text.includes('[ref=1]'));
});
test('operations: download 选择器路径——解析 href → 域名/SSRF 检查 → 高风险审批 → 下载（E252 续）', async () => {
  const driver = fakeDriver();
  const runner = new BrowserOperationRunner({ driver });
  const seen: string[] = [];
  const out = await runner.run(
    [step('download a[href$=".PDF"]')],
    {
      ...policy(),
      confirm: (s, reasons) => {
        seen.push(`${s.raw} -> ${s.url ?? ''} (${reasons.join('/')})`);
        return true;
      },
    },
  );
  assert.equal(out.ok, true);
  assert.deepEqual(seen, [
    'download a[href$=".PDF"] -> https://so.szlcsc.com/ds/a.PDF (下载)',
  ]);
  assert.equal(driver.calls[0], 'resolveHref a[href$=".PDF"]');
  assert.equal(driver.calls[1], 'download https://so.szlcsc.com/ds/a.PDF');
});

test('operations: download 选择器解析出的 URL 不在域名白名单 → 拒绝（A1 后置门）', async () => {
  let resolved = false;
  let downloaded = false;
  const driver = fakeDriver({
    async resolveHref() {
      resolved = true;
      return 'https://evil.com/ds/a.PDF';
    },
    async download() {
      downloaded = true;
      return { path: 'x.pdf' };
    },
  });
  const runner = new BrowserOperationRunner({ driver });
  const out = await runner.run([step('download a[href$=".PDF"]')], policy({ confirm: () => true }));
  assert.equal(out.ok, false);
  assert.match(out.error ?? '', /不在 Skill 域名白名单/);
  assert.equal(resolved, true); // 已解析
  assert.equal(downloaded, false); // 但未下载（域名门后置拦截）
});

test('operations: download 选择器解析出的 URL 过 SSRF → 拒绝（A9 后置门）', async () => {
  const driver = fakeDriver({
    async resolveHref() {
      return 'http://127.0.0.1:8420/leak';
    },
  });
  const runner = new BrowserOperationRunner({ driver });
  const out = await runner.run([step('download a[href$=".PDF"]')], policy({ confirm: () => true }));
  assert.equal(out.ok, false);
  assert.match(out.error ?? '', /SSRF/);
});

test('operations: download 选择器解析失败 / 超时 → 步骤失败归因（[P-125]）', async () => {
  const missing = fakeDriver({
    async resolveHref() {
      throw new Error('页面中未找到选择器 a.none 的链接');
    },
  });
  const runnerA = new BrowserOperationRunner({ driver: missing });
  const failOut = await runnerA.run([step('download a.none')], policy({ confirm: () => true }));
  assert.equal(failOut.ok, false);
  assert.match(failOut.error ?? '', /未找到选择器/);

  const slow = fakeDriver({
    async resolveHref() {
      return new Promise((resolve) => setTimeout(() => resolve('https://so.szlcsc.com/x.PDF'), 500));
    },
  });
  const runnerB = new BrowserOperationRunner({ driver: slow, stepTimeoutMs: 20 });
  const timeoutOut = await runnerB.run([step('download a.slow')], policy({ confirm: () => true }));
  assert.equal(timeoutOut.ok, false);
  assert.equal(timeoutOut.results[0].timedOut, true);
  assert.match(timeoutOut.results[0].error ?? '', /\[P-125\]/);
});
