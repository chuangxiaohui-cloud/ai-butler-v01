# 推进计划：生产侧 serialport 注入（E425）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成

## 目标

为 E421 串口只读驱动提供**生产可用**的 `SerialReader` 绑定：经门禁 + `executeSerialRead` 后，可用 Node `serialport` 打开白名单端口只读；**仍禁止写/发字节**；缺依赖或加载失败时诚实失败，不静默改默认拒绝语义。

## 新依赖理由

| 项 | 说明 |
|----|------|
| 包 | `serialport`（optionalDependencies） |
| 为何需要 | E421 契约要求生产须注入真实 reader；Node 生态标准串口绑定即此包，无自研原生扩展 |
| 为何 optional | 含原生编译；CI/无串口机可跳过安装，默认仍拒绝打开；有硬件的生产机 `npm i` 装上即可 |
| 边界 | 仅只读；不开放 write；仍须设备白名单 + `executeSerialRead=true` |

## 计划

1. 新增 `src/mcp/serialport-reader.ts`：`createSerialportReader`（可注入 `loadModule` 单测）；动态 `import('serialport')`；只读至 maxBytes/超时/取消后关闭。
2. 生产入口（`main` / `gateway/server` / `im/run`）注入该 reader。
3. `package.json` optionalDependencies 登记；§4.1.2 + 附录 A；定向单测。

## 验收

- 注入 mock 绑定：能读、超时/取消、**绝不调用 write**。
- 未装/加载失败：执行时报明确错误；无 `executeSerialRead` 仍零打开。
- `build` + 定向单测 + `doc-lint` 绿。

## 结果

- 代码：`serialport-reader.ts` + shim；CLI/gateway/IM 注入；optionalDependency `serialport@^13`。
- 语义：读窗结束时若已读到字节则 `timedOut=false`（对齐 E421 `ok`）；零字节超时才失败。
- 定向单测：serialport-reader + serial-driver **6/6**。
- `doc-lint`：0 FAIL 0 WARN。
- **未提交**；未接真实硬件；未强制 `npm i serialport`（optional）。
