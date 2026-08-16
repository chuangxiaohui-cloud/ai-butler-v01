/**
 * 一人公司 AI-Agent 桌面壳（E121）
 * 拉起 gateway 并打开同源 UI 窗口；关闭窗口时回收子进程。
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, shell } from 'electron';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.GATEWAY_HOST ?? '127.0.0.1';
const port = Number(process.env.GATEWAY_PORT ?? '8787');
const uiUrl = `http://${host}:${port}/`;
const isSmoke = process.argv.includes('--smoke');

let gateway = null;
let mainWindow = null;

function gatewayCommand() {
  if (app.isPackaged) {
    const gatewayDir = join(process.resourcesPath, 'gateway');
    const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
    const entry = join(gatewayDir, 'dist', 'gateway', 'server.js');
    if (!existsSync(entry)) {
      throw new Error(`安装包缺少 gateway 运行文件：${entry}`);
    }
    return [join(process.resourcesPath, nodeName), [entry]];
  }
  const tsxCli = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!existsSync(tsxCli)) {
    throw new Error('缺少项目根目录依赖，请先运行 npm install');
  }
  const nodeExec =
    process.env.npm_node_execpath ?? (process.platform === 'win32' ? 'node.exe' : 'node');
  return [
    nodeExec,
    [tsxCli, join(repoRoot, 'src', 'gateway', 'server.ts')],
  ];
}

function startGateway() {
  const [command, args] = gatewayCommand();
  const cwd = app.isPackaged ? app.getPath('userData') : repoRoot;
  if (app.isPackaged) {
    mkdirSync(join(cwd, 'data'), { recursive: true });
  }
  gateway = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  gateway.stdout.on('data', (chunk) => process.stdout.write(`[gateway] ${chunk}`));
  gateway.stderr.on('data', (chunk) => process.stderr.write(`[gateway] ${chunk}`));
  gateway.on('exit', (code) => {
    if (!isSmoke) {
      console.log(`[gateway] 已退出，code=${code}`);
    }
  });
}

async function waitForGateway(timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const resp = await fetch(`http://${host}:${port}/api/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (resp.ok) return;
    } catch {
      // gateway 尚未就绪，继续等待
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`gateway 启动超时：${uiUrl}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: '一人公司 AI-Agent',
    backgroundColor: '#0f1117',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow.loadURL(uiUrl);
}

function shutdown(code = 0) {
  if (gateway && !gateway.killed) {
    gateway.kill();
  }
  app.exit(code);
}

app.whenReady().then(async () => {
  try {
    startGateway();
    await waitForGateway();
    if (isSmoke) {
      await createWindow();
      console.log('DESKTOP_READY');
      await new Promise((resolve) => setTimeout(resolve, 1500));
      shutdown(0);
      return;
    }
    await createWindow();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    shutdown(1);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (gateway && !gateway.killed) {
    gateway.kill();
  }
});
