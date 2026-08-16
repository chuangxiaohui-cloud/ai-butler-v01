# 推进计划：桌面安装包（E122）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

用 electron-builder 产出 Windows 安装包（NSIS 安装版 + 便携版），把编译后的
gateway、UI 静态资源、生产依赖和 Node 运行时一起打进 `extraResources`，做到
“双击安装即用、无需单独装 Node”。

## 计划

1. `desktop/scripts/prepare-resources.mjs`：构建前把 `dist/`、`ui/prototype/dist`、
   `node_modules/`、`.env`、`node.exe` 复制到 `desktop/resources/gateway`。
2. `main.mjs` 增加打包分支：`app.isPackaged` 时从 `process.resourcesPath/gateway`
   启动内置 Node + 编译后的 `dist/gateway/server.js`，cwd 用 Electron userData，
   保证数据可写。
3. `desktop/package.json` 增加 electron-builder 配置与 `dist` 脚本（NSIS + portable）。
4. `.gitignore` 排除 `desktop/resources/` 与 `desktop/release/`。
5. 构建安装包并验证产物；更新需求文档附录 A（E122）与交接记录，提交推送。

**验收标准**

- `desktop:dist` 能产出 `.exe` 安装包与便携版。
- 安装包内包含 gateway 运行所需 dist、依赖、UI 与 Node 运行时。
- 打包后的主进程仍能拉起 gateway 并加载 UI（通过 smoke 逻辑验证）。

## 结果

- `electron-builder --dir` 产物 `desktop/release/win-unpacked`；打包后的
  `一人公司AI-Agent.exe --smoke` 实测：内置 Node 拉起 gateway、加载 UI、
  打印 `DESKTOP_READY` 后退出码 0，端口无残留。
- `npm run dist` 产物：
  - `desktop/release/一人公司AI-Agent Setup 0.1.0.exe`（NSIS，129.3 MB）
  - `desktop/release/一人公司AI-Agent 0.1.0.exe`（便携版，129.0 MB）
- Electron 二进制与 NSIS 工具链走 npmmirror 镜像，未配置代码签名。
- 提交：E122 已提交并推送 Gitee/GitHub。
- 遗留：应用图标、代码签名、Tauri 瘦身迁移。
