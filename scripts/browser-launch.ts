/**
 * 以调试端口启动日常浏览器，供 Agent 通过 CDP 复用其登录会话。
 * 注意：目标浏览器必须完全关闭后才能启动；正在运行时会启动失败。
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const QQ_BROWSER_DIR = 'C:/Program Files/Tencent/QQBrowser';

function latestQqExe(): string {
  const dirs = readdirSync(QQ_BROWSER_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(d.name))
    .map((d) => d.name)
    .sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 4; i += 1) {
        if ((pb[i] ?? 0) !== (pa[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
      }
      return 0;
    });
  for (const dir of dirs) {
    const exe = `${QQ_BROWSER_DIR}/${dir}/QQBrowser.exe`;
    if (existsSync(exe)) return exe;
  }
  throw new Error('未找到 QQ浏览器可执行文件');
}

const BROWSERS: Record<string, { exe: string; profile: string; processName: string }> = {
  thorium: {
    exe: 'C:/Users/zhxh/AppData/Local/Thorium/Application/thorium.exe',
    profile: 'C:/Users/zhxh/AppData/Local/Thorium/User Data',
    processName: 'thorium.exe',
  },
  qq: {
    exe: latestQqExe(),
    profile: 'C:/Users/zhxh/AppData/Local/Tencent/QQBrowser/User Data',
    processName: 'QQBrowser.exe',
  },
};

function isRunning(processName: string): boolean {
  try {
    const name = processName.replace(/\.exe$/i, '');
    const out = execSync(
      `powershell -NoProfile -Command "Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Select-Object -First 1"`,
      { encoding: 'utf8', windowsHide: true },
    );
    return out.trim().length > 0;
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
  { stdio: 'ignore', detached: true },
);
child.unref();

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
