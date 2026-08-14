/**
 * 以调试端口启动日常浏览器，供 Agent 通过 CDP 复用其登录会话。
 * 注意：目标浏览器必须完全关闭后才能启动；正在运行时会启动失败。
 */

import { execSync, spawn } from 'node:child_process';

const BROWSERS: Record<string, { exe: string; profile: string; processName: string }> = {
  thorium: {
    exe: 'C:/Users/zhxh/AppData/Local/Thorium/Application/thorium.exe',
    profile: 'C:/Users/zhxh/AppData/Local/Thorium/User Data',
    processName: 'thorium.exe',
  },
  qq: {
    exe: 'C:/Program Files/Tencent/QQBrowser/21.7.6019.400/QQBrowser.exe',
    profile: 'C:/Users/zhxh/AppData/Local/Tencent/QQBrowser/User Data',
    processName: 'QQBrowser.exe',
  },
};

function isRunning(processName: string): boolean {
  try {
    const list = execSync(`tasklist /FI "IMAGENAME eq ${processName}" /FO CSV /NH`, {
      encoding: 'utf8',
      windowsHide: true,
    });
    return list.includes(processName);
  } catch {
    return false;
  }
}

const browser = process.argv[2] as keyof typeof BROWSERS | undefined;
if (!browser || !BROWSERS[browser]) {
  throw new Error('用法：npm run browser:launch -- thorium|qq');
}

const config = BROWSERS[browser];
const port = Number(process.argv[3] ?? 9222);

if (isRunning(config.processName)) {
  throw new Error(`${browser} 正在运行，请先完全关闭再执行 npm run browser:launch -- ${browser}`);
}

const child = spawn(
  config.exe,
  [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${config.profile}`,
    '--no-first-run',
  ],
  { stdio: 'ignore' },
);

child.on('error', (err) => {
  throw new Error(`${browser} 启动失败：${err.message}`);
});

setTimeout(() => {
  console.log(JSON.stringify({
    message: `${browser} 已以调试端口 ${port} 启动，请确认窗口已出现。`,
    next: `然后运行 npm run browser:cdp -- ${port} 让 Agent 连接。`,
  }, null, 2));
  process.exit(0);
}, 2500);
