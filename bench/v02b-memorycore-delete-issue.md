# MemoryCore delete 缺口排查结论（v0.2b）

> 日期：2026-08-13｜状态：结论已定（局部清理不可靠，采用整目录重建）

## 现象

`POST /v3/conversation/delete`（session_id）返回 `deleted_count=0`，无法清空 L0。

## 根因

standalone 模式下 L0 存在 `conversations/YYYY-MM-DD.jsonl` 文件 + 内部索引/records；
`deleteL0BySession` 只查询/删除 SQLite `l0_conversations` 表（该表在 standalone 下为空），
文件与索引未删除，因此删 0 条。

## 验证过程

1. 项目侧 cleaner 直接按 session 过滤 JSONL（备份到 `.bak/` 子目录）——文件层清理成功。
2. 重启 sidecar 后 `conversation/query` 仍返回旧数据（total=696，远超文件 286 行）：
   说明 MemoryCore 内部仍有 records/索引残留（`records/2026-08-13.jsonl` 等）。
3. 结论：局部文件清理无法与 MemoryCore 内部索引同步，`--reset` 局部模式不可靠。

## 生产方案

- 迁移/重置采用**整目录重建**：停 sidecar → 清空 `~/.memory-tencentdb/memory-tdai` → 启动 → 重新迁移。
- 该流程已验证：74/74 与 137/137 零丢失迁移均通过。
- `memorycore-cleaner.ts` 保留为工具（可清 JSONL 文件），不作为权威 reset 路径。

## 建议

向 MemoryCore 上游反馈：`deleteL0BySession` 需同时删除 JSONL 文件与索引/records，
或在 standalone 下提供“按 session 全量删除”的官方语义。
