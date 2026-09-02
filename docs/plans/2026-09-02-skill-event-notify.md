# 推进计划：角色 Skill 输出事件自动入通知库（E316）

> 日期：2026-09-02 · 分支：v0.2b · 状态：已完成

## 目标

补齐 E314/E315 后的剩余缺口：五角色 Skill（PRD/用户故事/技术选型/接口契约/里程碑复盘）生成成功时，自动把「完成事件」写入通知库（source=skill），让 §11.3 秘书日报能聚合「产品经理 PRD 完成 / 系统架构师选型建议」等角色输出（🟡 普通级），不再只有裁决/升级（🔴 紧急）一类来源。

## 计划

1. `src/notifications/notification-store.ts`：`emitSkillNotification`（source=skill，写入失败不阻塞 Skill 主流程）→ verify: store 单测
2. 5 个角色 Skill CLI 成功路径接入 emit——prd-template→产品经理 prd_done、tech-selection→系统架构师 tech_selection、user-story→产品经理 user_story_done、interface-contract→系统架构师 interface_contract、milestone-review→项目经理 milestone_review → verify: 无 LLM 冒烟
3. `notification-hub` NORMAL_RE 增 user_story/用户故事/contract/接口契约（角色输出→🟡 普通）→ verify: hub 单测
4. 冒烟：user-story CLI → 通知库自动出现 user_story_done →「通知汇总」读为 🟡 普通；doc-lint 0 FAIL 0 WARN

**验收标准**

- emitSkillNotification 写入 source=skill 事件（temp store 单测）
- user_story_done / interface_contract / milestone_review → normal 分类
- 冒烟：CLI 成功即自动入通知库，汇总可读出；doc-lint 0 FAIL 0 WARN

## 执行过程

### 改动

- `src/notifications/notification-store.ts`：`emitSkillNotification({role,kind,title,detail?})`——new NotificationStore → add(source='skill') → close，整体 try/catch 兜底。
- `scripts/market-prd-template.ts` / `market-tech-selection.ts` / `market-user-story.ts` / `market-interface-contract.ts` / `market-milestone-review.ts`：成功写盘后调用 emit（prd_done / tech_selection / user_story_done / interface_contract / milestone_review）。
- `src/skills/market/notification-hub.ts`：NORMAL_RE 增 `user_story|用户故事|contract|接口契约`。

### 遇到的问题

- **分类覆盖**：user_story_done / interface_contract 原不在 NORMAL_RE，会落 🟢 低优先级——补 user_story/用户故事/contract/接口契约，角色输出统一 🟡 普通（review 已含 milestone_review）。

## 结果

- 验证：`npm run build` 绿；notification-store 5/5 + notification-hub 8/8（新增 2 条：emit 写入 / 角色输出分类）；doc-lint 0 FAIL 0 WARN；无 LLM 冒烟 ok——`market:user:story` 生成成功后通知库自动出现 `{role:产品经理, kind:user_story_done, source:skill}`，`market:notification:hub`「通知汇总」读为 🟡 普通（含详情路径）。
- 测试：notification-store 5/5 + notification-hub 8/8。
- 提交：未提交（owner 未要求）。
- 遗留事项：通知库「右栏通知区 UI 展示 / projects/ 目录文件变更监听」仍属 §4.1 三栏交互 UI 阶段（登记候选）；剩余候选——Outlook OAuth2、E309-后 confirm 阻断式（等 owner 拍板）、v2.6 pre-ship 封版确认、v1.0 大章节。
