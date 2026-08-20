# 推进计划：桌面壳冒烟兼容（E143）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

让 Electron 桌面壳在无可用 GPU/CI 环境下也能完成 `desktop:smoke`，
正常输出 `DESKTOP_READY` 并以退出码 0 结束。

## 计划

1. 开发模式将 `userData` 指向仓库内 `data/electron-dev`。
2. 禁用硬件加速，冒烟模式追加 `no-sandbox/in-process-gpu/disable-software-rasterizer`。
3. 真跑 `npm run desktop:smoke` 验证。

## 执行过程

- `desktop/main.mjs` 增加兼容开关。
- 首次冒烟失败原因为 GPU 进程不可用与缓存目录权限；调整后通过。

## 结果

- `npm run desktop:smoke` 输出 `DESKTOP_READY`，退出码 0。
