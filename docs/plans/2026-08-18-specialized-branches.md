# 推进计划：P01/P06/EC31/C01 专用分支

> 日期：2026-08-18 · 分支：v0.2b · 状态：已完成

## 目标

处理 low_confidence 复查里三个“不该走搜索”的条目与 C01 多轮落地问题：
未知黑话不乱猜、缺城市主动澄清、陪伴聊天不推 App、工程落地结构化澄清。

## 计划

1. 新增 `chat` 与 `apply_to_project` 意图特征与路由规则。
2. 新增陪伴回复模板，pipeline 直接返回，不搜索。
3. Stage 1 增加未知黑话与位置缺失澄清。
4. C01 路由为工程落地澄清，收集路径/文件/备份信息。
5. 补测试、CLI 真跑、登记 E130。

**验收标准**

- P01 不再猜驱动总裁/驱动人生，改为请求补充含义。
- P06 无城市时主动问城市。
- EC31 返回陪伴回复且 evidence=0、mode=life。
- C01 返回工程落地结构化澄清且不再带无关搜索证据。

## 执行过程

### 改动

- `src/agent/intent-feature.ts`：新增 `chat`、`apply_to_project`。
- `src/agent/routing-table.ts`：新增 `R_CHAT`、`R_APPLY_TO_PROJECT`。
- `src/search/companion-reply.ts`：陪伴回复模板。
- `src/search/pipeline.ts`：陪伴与工程落地早退。
- `src/search/stages/s1_prepare.ts`：位置缺失与未知黑话澄清。
- 测试：router-v2 2 条、s1 3 条、companion 2 条、pipeline 2 条。

## 结果

- CLI 四题实测均不搜索、不乱猜：P01 请求补充含义；P06 问城市；EC31 陪伴回复；
  C01 结构化澄清。
- 验证：单测 372/372 + 集成 17/17 全绿；doc-lint 通过。
