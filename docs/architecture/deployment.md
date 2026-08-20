# 部署架构图

> 权威需求：§8.1.4 / §12.5.4；实现：`desktop/main.mjs`、`desktop/scripts/prepare-resources.mjs`

## 1. 本地进程拓扑

```text
┌────────────────────────────────────────────────┐
│ Electron 主进程（desktop/main.mjs）             │
│  ┌─────────────┐   拉起    ┌──────────────────┐ │
│  │ UI 窗口      │ ──────── │ Gateway 子进程    │ │
│  │ 127.0.0.1   │  HTTP/SSE │ node.exe          │ │
│  │ :8787 同源  │           │ src/gateway       │ │
│  └─────────────┘           └────────┬─────────┘ │
└────────────────────────────────────┼───────────┘
                                     │ HTTP/JSON（可选启用）
                                     ▼
                          ┌──────────────────────┐
                          │ MemoryCore sidecar    │
                          │ 127.0.0.1:8420        │
                          │ SQLite + BM25         │
                          └──────────────────────┘
                                     │
                                     ▼
                          本地 SQLite 数据目录（data/）
                          memory.db / experience.db / user-context.db
                          calendar.db / quotes.db / messages.db
```

## 2. 端口与路径

| 项 | 默认值 | 配置 |
|----|--------|------|
| Gateway | `127.0.0.1:8787` | `GATEWAY_HOST` / `GATEWAY_PORT` |
| MemoryCore | `127.0.0.1:8420` | `configs/tdai-gateway.local.yaml` |
| UI 开发服务器 | `127.0.0.1:5173` | Vite |
| 浏览器 CDP | 动态持久化 | `data/browser-session-cdp.json` |
| 运行时数据 | `<cwd>/data/` | `DATA_DIR` / 各 Skill DB 路径 |
| 桌面打包资源 | `desktop/resources/` | `prepare-resources.mjs` |

## 3. 启动顺序

1. 如需 MemoryCoreStore：先启动 MemoryCore sidecar（源码启动，非 Docker），健康检查通过。
2. 启动桌面壳或 `npm run gateway`；桌面壳会自动拉起 gateway 子进程。
3. gateway 健康检查通过后加载 `ui/prototype/dist` 同源 UI。
4. 关闭窗口时主进程回收 gateway 子进程；MemoryCore 由外部进程管理。

## 4. 安装部署

- 开发态：`npm run dev` / `npm run gateway` / `npm run desktop`。
- 打包态：`cd desktop && npm run dist`，产出 NSIS 安装版与便携版。
- 打包内容：编译后 gateway、UI 静态资源、生产依赖、Node 运行时。
- 个人自用策略：不代码签名，`forceCodeSigning=false`。
