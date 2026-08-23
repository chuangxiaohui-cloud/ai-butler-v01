# 推进计划：v1.0 S8 LLM 增强路由 + MemoryCoreStore 切换

> 日期：2026-08-24 · 分支：v0.2b · 状态：进行中

## 目标

v1.0 切片第八片（S8，收尾片）：① **LLM 增强路由接线生产入口**（§2.2/§6.7，E21/E207-H6 留待项）——CLI 与 gateway 的 pipeline deps 注入可选 heavy LLM 客户端：已配置 Provider 时路由走 LLM 特征提取（失败/无效自动回退规则并打 [P-84] 折扣），未配置 Provider 时返回 undefined 走纯规则路由（不触发折扣，与现状一致）；② **MemoryCoreStore 切换**（§8.1.4/§8.4，E207-D5 留待项）——`defaultMemoryStore` 支持 `MEMORY_STORE=memorycore` 配置切换为 MemoryCoreStore（同接口同 schema），缺身份三元组/弱 key 显式抛错不静默回退，默认保持 sqlite；③ **fast description 不复活**——已在 E207（D3）tombstone P-87/P-88 废弃，S8 切片定义同步修正（诚实登记）。

## 计划

1. **LLM 增强路由接线**：
   - `src/search/llm.ts`：新增 `createOptionalHeavyClient()`——Provider 已配置返回 heavy 客户端，未配置返回 undefined（避免启动即抛错、避免无配置时误触发 [P-84] 折扣）
   - `src/main.ts` + `src/gateway/server.ts`：pipeline deps 注入 `llm: createOptionalHeavyClient()`
   - 降级链不变：routeV2WithLLM → extractIntentFeature（llm 缺失走 rule；llm 失败走 fallback + [P-84] 折扣）
2. **MemoryCoreStore 切换**：
   - `src/memory/store.ts`：`resolveMemoryStoreKind(env)`（默认 sqlite，未知值回退 sqlite）+ `createDefaultMemoryStore(kind, env)`（memorycore 时构造 MemoryCoreStore，身份三元组/强 key 缺一即显式抛错）；`defaultMemoryStore()` 返回类型改为 `MemoryStore`
   - `.env.example`：登记 `MEMORY_STORE=sqlite` 与切换说明
3. **登记**：需求文档 E227；目录文档、handoff、切片定义（S8 去掉 fast description，注明 E207 已废弃）。
4. **验收**：doc-lint 0 FAIL 0 WARN + build + 全量单测/集成全绿。

**验收标准**

- `createOptionalHeavyClient`：无 Provider 返回 undefined；有 Provider 返回可 complete 客户端。
- 路由接线：main/server 的 pipeline deps 携带可选 llm；无 llm 时路由行为与现状一致（rule，无折扣）。
- 存储切换：`MEMORY_STORE` 缺省/未知 → sqlite；`memorycore` → MemoryCoreStore；缺身份或弱 key 显式抛错不静默回退。
- doc-lint 0 FAIL 0 WARN；单测 + 集成全绿。

## 执行过程

### 改动

- `src/search/llm.ts`（新增 createOptionalHeavyClient）+ `llm.test.ts`（新增）
- `src/memory/store.ts`（存储切换）+ `store.test.ts` 增量
- `src/main.ts`、`src/gateway/server.ts`（路由 llm 接线）
- `.env.example`（MEMORY_STORE 登记）
- 文档：本计划 + 需求文档 E227 + 目录文档 + handoff + 切片定义修正

### 遇到的问题

- LLM 增强路由可选客户端：`createHeavyClient()` 在未配置 Provider 时构造即抛错，若直接注入 deps 会让 CLI/gateway 启动失败；且缺失 llm 与 llm 抛错在路由层语义不同（前者 rule 无折扣、后者 fallback 触发 [P-84] 折扣）。`createOptionalHeavyClient()` 用 catch 返回 undefined 解决两问题：有 Provider 走 LLM 提取，无 Provider 走纯规则且不误触发折扣。
- MemoryCoreStore 切换：`resolveApiKey`（S3）在构造时即校验，`MEMORY_STORE=memorycore` 缺身份三元组或弱 key 会显式抛错——这是有意的显式失败，不静默回退 sqlite（避免数据写入目标漂移）。
- 附录 A 行结构修复：早期 E225/E226 插入锚点命中单行条目的标题前缀，导致 E224-E226 内容被级联合并到同一行（lint 不查逐行结构所以此前未暴露）；本切片重建为每条一行（内容无损），doc-lint 复核通过。

## 结果

- （执行后补）
