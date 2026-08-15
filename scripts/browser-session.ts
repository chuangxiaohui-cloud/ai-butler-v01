/**
 * CLI：维护 AI-Butler 的持久化浏览器会话。
 *   npm run browser:open   —— 打开可视窗口，用户完成一次登录后回车
 *   npm run browser:fetch -- "URL"
 *   npm run browser:status
 */

import { browserSession } from '../src/browser/session.js';

const subcommand = process.argv[2];

async function main(): Promise<void> {
  if (subcommand === 'open') {
    const info = await browserSession.openLoginWindow();
    console.log(JSON.stringify({
      message: '请在打开的浏览器窗口完成登录，完成后回到终端按回车关闭。',
      profileDir: info.profileDir,
      sessionDomains: info.sessionDomains,
    }, null, 2));
    process.stdin.resume();
    await new Promise<void>((resolveEnter) => process.stdin.once('data', () => resolveEnter()));
    await browserSession.close();
    console.log(JSON.stringify({ message: '浏览器已关闭，会话已持久化。' }));
    return;
  }

  if (subcommand === 'fetch') {
    const url = process.argv[3];
    const waitMs = Number(process.argv[4] ?? 0);
    if (!url) throw new Error('用法：npm run browser:fetch -- "https://..." [waitMs]');
    const page = await browserSession.fetchPage(
      url,
      30_000,
      Number.isFinite(waitMs) && waitMs > 0 ? waitMs : 0,
    );
    console.log(JSON.stringify({
      url: page.url,
      title: page.title,
      textLength: page.text.length,
      preview: page.text.slice(0, 500),
      sessionDomains: page.sessionDomains,
    }, null, 2));
    return;
  }

  if (subcommand === 'cdp') {
    const port = Number(process.argv[3] ?? 9222);
    if (!Number.isInteger(port) || port <= 0) throw new Error('端口无效');
    const info = await browserSession.connectCdp(port);
    console.log(JSON.stringify({
      message: '已连接并保存调试端口；后续 Agent 会自动复用该浏览器会话。',
      port,
      sessionDomains: info.sessionDomains,
      contexts: info.contexts,
    }, null, 2));
    await browserSession.close();
    return;
  }

  if (subcommand === 'cdp-off') {
    await browserSession.disconnectCdp();
    console.log(JSON.stringify({ message: '已解除浏览器会话关联，Agent 将使用独立浏览器。' }));
    return;
  }

  if (subcommand === 'status') {
    console.log(JSON.stringify({
      profileDir: browserSession.profileDir,
      savedCdpPort: browserSession.savedCdpPort(),
      sessionDomains: await browserSession.sessionDomains(),
    }, null, 2));
    return;
  }

  throw new Error('用法：npm run browser:open | browser:cdp -- 9222 | browser:cdp-off | browser:fetch -- "URL" | browser:status');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  });
