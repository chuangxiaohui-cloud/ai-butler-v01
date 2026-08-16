# 推进计划：Electron 桌面壳（E121）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

把现有 UI + gateway 封装成 Windows 桌面应用：Electron 主进程自动拉起 gateway，
打开桌面窗口加载同一网关托管的 UI，实现“双击即用、无 CORS、关闭即回收子进程”。

## 选型

- 选 **Electron** 而非 Tauri：当前栈是 Node/TS，Electron 可直接复用 gateway 与
  `ui/prototype/dist`，首版落地最快；需求 §12.5.4 的“Node 运行时内置”由 Electron
  自带满足。Tauri 保留为后续瘦身迁移选项。

## 计划

1. gateway 增加静态 UI 托管：`GET /` 返回 `ui/prototype/dist`，非 `/api/*` GET 回退
   `index.html`（SPA），与 API 同源，消除 CORS。
2. 新增 `desktop/`：`package.json` + `main.mjs`，Electron 主进程 spawn gateway
   （`node --import tsx`），健康检查通过后开 1440×900 窗口，退出时回收子进程。
3. 根 package 增加 `desktop` / `desktop:smoke` 脚本；`--smoke` 模式加载完成后自动退出，
   供自动化验证。
4. 补 gateway 静态托管测试；`push:hosts` 范围加 `desktop/`。
5. 更新需求文档附录 A（E121）与交接记录，提交推送。

**验收标准**

- `GET /` 返回 UI 页面，`/api/*` 不受静态回退影响。
- `desktop:smoke` 能拉起 gateway、打开窗口并自动退出，无报错。
- 关闭窗口后 gateway 子进程被回收。

## 结果

- 验证：主项目与 UI `npm run build` 通过；`npm run test:all` 单测 340/340 +
  集成 17/17 全绿（新增 gateway 静态托管测试）；doc-lint 通过。
- `desktop:smoke` 实测：拉起 gateway（8792 端口）、加载窗口、打印
  `DESKTOP_READY` 后自动退出，端口无残留监听。
- 提交：E121 已提交并推送 Gitee/GitHub。
- 遗留：安装包（electron-builder）与 Tauri 瘦身迁移留待后续。
