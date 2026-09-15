# 推进计划：内容型思维导图紧凑交付 + 大纲清洗（E344）

> 日期：2026-09-05 · 分支：v0.2b · 状态：已完成（未提交，待 owner 拍板批次 + 手动复验）

## 目标

E343 真机已能在大纲合成（88s、deepseek→minimax 兜底）完成，但 owner 实测「把嵌入式产品开发的全流程做成思维导图：…」后反馈「并不是一个思维导图，最多算是总结步骤」：
- 正文把整段 40+ 行大纲全贴出来，观感像“总结步骤”，且 ⏸ 生成卡被压到消息底部看不见；
- 已写入 pending 的 resume 夹带 LLM 杂质（重复中心主题行 + 文末“（证据未覆盖…）”说明），批准后生成的 .xmind 会有垃圾节点。

## 计划

1. `src/skills/pm-xmind/format.ts`：新增 `sanitizeOutlineTree(root)`（去「与中心主题重复的叶子」与「（证据/注/备注/说明…）式文末注释叶子」，只删叶子不丢子结构，返回新树）；新增 `buildOutlinePreviewText(root)`（中心主题 + 一级分支带子项数 + 节点数/层深提示的紧凑预览）。
2. `src/search/pipeline.ts`：E342 挂卡块改——正文只回紧凑预览 + ⏸ 卡（不再整段贴大纲）；resume.query 改存 `treeToOutlineText(sanitizeOutlineTree(树))` 的规范大纲。
3. `src/search/stages/s5_synthesize.ts`：outlineOnly 系统提示加“中心主题只出现一次 / 不得在条目外输出文末说明”；outlineOnly 跳过 readinessGap 的“诚实边界”注入（防止模型文末补“证据未覆盖”长句），缺口改由节点内“（待补充）”表达。
4. 测试：pipeline E342 主用例改断言紧凑预览；新增 E344 清洗用例（重复主题 + 文末说明 → resume 干净）；s5 补 2 条断言 + readinessGap 跳过用例；pm-xmind 补 sanitize/preview 单测。
5. 文档：计划（本文件）、需求附录 A E344、当日 handoff 登记。

**验收标准**

- 内容型思维导图回复为「中心主题 + 一级分支（含子项数）+ 规模」的短预览 + ⏸ 生成卡（卡可见，不再被长文压没）；
- 批准后落盘的 .xmind 无重复中心主题、无“证据未覆盖/说明”垃圾节点，Xmind 打开结构干净。

## 执行过程

### 改动

- `format.ts`：`sanitizeOutlineTree` / `buildOutlinePreviewText`（附 `outlineStats` 私有统计）。
- `pipeline.ts`：E342 块重写（preview + 卡；resume 用清洗后规范文本）。
- `s5_synthesize.ts`：outlineOnly 提示词规则 5/6 + readinessGap 仅非 outlineOnly 注入。
- 测试：pipeline.test（E342 主用例改紧凑断言 + 新增 E344 清洗用例）、s5_synthesize.test（+2 断言 + readinessGap 跳过用例）、pm-xmind/index.test（+2 sanitize/preview 用例）。

### 遇到的问题

- 把新 pipeline 用例插入时误嵌进上一条用例内部（结构错位），已把孤儿尾块移回；序列化大纲是 `1 标题`（无点），测试期望首版误写 `1. 标题`，已按 `treeToOutlineText` 实际格式修正。

## 结果

- 验证：`npm run build` 绿；pipeline + s5 + pm-xmind 定向 105/105 全绿；`npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）。
- 测试：单测见上；全量 test:all/bench 未跑（成本纪律）。
- 提交：未提交，待 owner 拍板批次。
- 遗留事项：owner 手动复验——先在右侧裁决取消旧卡 `0daa7460`（其 resume 为旧杂质版），重启 gateway 后同句提问应得紧凑预览 + ⏸ 卡，批准后 .xmind 结构干净。