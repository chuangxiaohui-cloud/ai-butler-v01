# 推进计划：Archify 生成提速——medium v4-flash + maxTokens 4000（E358）

> 日期：2026-09-06 · 分支：v0.2b · 状态：完成（未提交，待 owner 复测）
> 关联：owner 复测短问「画个订单系统的系统架构图」出现第三种失败面：0.3 收据 `LLM fallback 链总预算 90000ms 超时`——JSON 未坏、版式未判，是生成调用 90s（[P-122]）内没跑完。

## 目标

archify 生成不再因慢模型超预算而整次 0.3；复测短问应显著提速并在预算内完成 JSON 生成。

## 定位（根因）

- archify 生成走 `createSkillCompleteClient('archify')` → 其余 skill 默认 heavy 档（E238）：deepseek-v4-pro 推理模型 + per-call [P-122] 90s。
- 单次要出最多 6000 token 的 JSON IR（真实 usage 见 deepseek-v4-pro completion≈6000），大输出 + think 块偶发 >90s → fallback 链总预算强停 → 0.3。
- 与 E283 github-reader / E343 xmind-outline 同病：契约式结构化输出用不上推理档，本地 validate/repair 已兜版式。

## 方案（最小）

1. `src/search/llm.ts` `createSkillCompleteClient` 加 `archify` 分支（同 github-reader）：medium 档 v4-flash + per-call 预算放宽到 [P-122] 90s，timeoutMs 同步放宽（防单 provider 30s 先切链）；未配置 medium 回落既有 heavy 链。不动全局 [P-116]/[P-130]。
2. `src/skills/archify/index.ts` 生成/救场/修复 `maxTokens` 6000→4000（≤7 节点单图 JSON 实际 1.5-2k token；砍掉最坏长输出时长）。
3. 不动：修复轮、渲染、路由、E356/E357 提示。

## 测试与验收

- `llm.test.ts`：E283/E358 合并断言 github-reader/archify 均 medium v4-flash + timeout=[P-122]，engineer 仍 heavy。
- `index.test.ts`：生成+修复（E352 用例 2）与 E356 救场用例均断言两次调用 `maxTokens=4000`。
- `npm run build` 绿；llm + archify index + prompt 定向单测绿；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0）。
- 手动（owner）：重启 gateway 后 5173 重发短问——生成应明显提速、不再 90s 超时；v4-flash 版式不过由修复轮兜底。

## 执行过程

### 改动

- `src/search/llm.ts`：`createSkillCompleteClient` 条件扩为 `github-reader || archify`；注释补 E358 理由。
- `src/search/llm.test.ts`：E283 用例扩展为 github-reader/archify 双断言。
- `src/skills/archify/index.ts`：生成/救场（temperature 0.3）与修复（temperature 0.2）两处 `maxTokens` 6000→4000。
- `src/skills/archify/index.test.ts`：fakeLLM 记录 `maxTokensSeen`；E352 修复用例与 E356 救场用例断言 [4000, 4000]。

### 遇到的问题

- （无。）

## 结果

- `npm run build` 绿；llm.test 8/8 + archify index.test 7/7 + prompt.test 6/6；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0）。
- 待 owner 重启 gateway 复测短问。
