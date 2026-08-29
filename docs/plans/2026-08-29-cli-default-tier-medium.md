# 计划：CLI 合成默认档 heavy→medium（消除 CLI 必现 synthesis_timeout，E278）

> 日期：2026-08-29 ・ 对应 E278

## 背景

用户复测「延迟最低的数据库有哪些」连续 3 次 `synthesis_timeout`（91s/97s/104s）。根因：`src/main.ts` 硬编码 `createOptionalHeavyClient()`，s5 在 `opts.llm` 存在时直接用该客户端（heavy=v4-pro，[P-130] 30s 预算），v4-pro 推理贴着 30s 红线，API 延迟一高即必超；P-105 缺省本就是 medium，CLI 属于偏离文档约定的残留。

## 执行

- `src/search/llm.ts`：新增 `createOptionalMediumClient`（与 heavy 同 try/catch 可选模式）。
- `src/main.ts`：`llm: createOptionalHeavyClient()` → `createOptionalMediumClient()`。
- `src/search/pipeline.ts`：注释同步（CLI 未选档回落默认客户端 = medium，P-105）。

## 结果

- `npm run build` 绿；llm 相关单测 22/22 绿。
- 真实 CLI 重跑（用户）：「延迟最低的数据库有哪些」直接作答（gate=none，elapsed 49s，medium=v4-flash），答案列出 Redis/MongoDB(内存模式)/TiDB/MySQL/KVStore/OceanBase 并诚实标注「无权威横向对比，无法断定最低」。

## 残余

- medium 在当前 deepseek API 延迟下仍偶发撞 [P-116] 12s（E276 已记录 2/5 直接答）；若需更稳，调 [P-116]（§5 变更，另行拍板）。
