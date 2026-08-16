# 推进计划：Tauri 瘦身迁移（E124）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

把桌面壳从 Electron 迁移到 Tauri v2：Rust 后端负责拉起 gateway、等健康检查、
打开 WebView2 窗口、退出时回收子进程；UI 继续复用 `ui/prototype/dist` 与
gateway 同源托管，不改变浏览器端行为。

## 计划

1. 在 `desktop/` 新增 Tauri v2 骨架：`src-tauri/Cargo.toml`、`tauri.conf.json`、
   `build.rs`、Rust 入口与 capability。
2. Rust `setup` 中从资源目录/开发目录定位 Node + gateway，拉起子进程，健康检查
   通过后创建窗口；退出时 kill 子进程。
3. 生成 Tauri 图标目录（复用 E123 图标）。
4. `npm run tauri:dev` / `tauri build` 验证；如 crates.io 不通则用 rsproxy 镜像。
5. 验证产物与退出回收；更新需求文档附录 A（E124）与交接记录，提交推送。

**验收标准**

- `desktop/src-tauri` 存在且能 `cargo check` / `tauri build` 出 Windows 产物。
- 启动后 gateway 被拉起，窗口能加载 UI；关闭窗口后子进程被回收。
- Electron 壳保留，作为可回退路径。

## 结果

- `desktop/src-tauri` 骨架完成：Cargo.toml、tauri.conf.json、capability、Rust 入口。
- Rust 后端支持 dev / packaged 双模式：开发模式用根目录 tsx 源码，打包模式用
  `resources/gateway` 内置 node.exe + 编译后 gateway；`\\?\` 长路径前缀已归一化。
- `--smoke` 实测：打包资源分支拉起 gateway、加载 UI、打印 `TAURI_READY` 后退出码 0。
- `npm run tauri:build` 产出 NSIS 安装包：
  `desktop/src-tauri/target/release/bundle/nsis/一人公司AI-Agent_0.1.0_x64-setup.exe`。
- crates.io 不通时使用 rsproxy 镜像；本机缺 MSVC link.exe，改用 GNU 工具链编译。
- 提交：E124 已提交并推送 Gitee/GitHub。
- Electron 壳保留可回退；后续按使用反馈再做 Tauri 细节微调。
