# 推进计划：主动提醒（E142）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

实现“明天下午3点提醒我开会”的主动提醒：设置时写 SQLite，gateway 定时检查到期
提醒并通过 SSE 事件流推送，UI 可实时收到。

## 计划

1. 新增 `src/reminder/reminder-store.ts`：SQLite 提醒表 + add/due/list。
2. 提取共享 `parseTimeExpression` 到 `src/agent/time-expression.ts`。
3. `office-daily` 增加 `reminder` 模式。
4. gateway server 启动定时检查，到期发布 `reminder` 事件。
5. 补单测与交接记录。

**验收标准**

- `明天下午3点提醒我开会` 返回“已设置提醒”。
- 到期提醒能被 `dueReminders` 取出且只触发一次。
- gateway 事件流能收到 `reminder` 事件。

## 执行过程

### 改动

- `src/reminder/reminder-store.ts`、`src/agent/time-expression.ts`、
  `src/skills/office-daily/index.ts`、`src/gateway/server.ts`、测试。

### 遇到的问题

- `10:30` 这类冒号分钟原先没被识别，已补 `[点时:：]` 分钟解析。
- `转成PDF` 会先被 Word 词表截走，已把 PDF 转换判定提前。

## 结果

- CLI 真跑“明天下午3点提醒我开会”返回 `2026/8/20 15:00:00 开会`。
- `npm run test:all` 单测 427/427 + 集成 17/17 全绿；`doc-lint` 通过。
