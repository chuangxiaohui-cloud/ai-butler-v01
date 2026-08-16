# 进度交接 2026-08-16（v0.2b 续作）

> 当前分支：`v0.2b`｜最新提交：`1cc1671`｜Gitee 与 GitHub 已同步。

## 今日已收口

1. **魔鬼训练缺陷清单审阅**：审阅 `魔鬼训练_模型能力问题参考.csv`（8 条）与 `魔鬼训练_系统级故障Bug清单.csv`（35 条），并逐条对照 `results.jsonl` 复现；43 条 0 分 = 35 系统级故障 + 8 兜底/澄清问题，覆盖完整；详见 `docs/plans/2026-08-16-devil-bug-review.md`。
2. **最小修复包落地（E100）**：响应净化器 + Skill 纯文本契约（calendar/content-writer/im-dispatch）、路由 actionType 硬门 + qa 优先、安全三分（illegal/property/personal）、基准脚本注入 CLI 同款依赖；`npm run test:all` 276/276 + 17/17 全绿；详见 `docs/plans/2026-08-16-devil-minimal-fix.md`。
3. **修复后全量重跑验证**：122 条重跑完成；35 条系统级 Bug 29/35 修复（JSON 7/7、安全 4/4、路由 18/24 转正），8 条能力项 3/8 有进展；新增 `npm run compare:devil-v25` 前后对比脚本；剩余 EC11/EC22/P05/C02/C06/E39、SM07/EC03/EC30/P08、SM31/ET06/EC06/EC23/P03/C05 待第二轮；详见 `docs/plans/2026-08-16-devil-fix-verify.md`。
4. **第二轮修复与全量验证（E101）**：新增 rewrite/pack 意图与管道分支、hasGithubLink 特征与 R017、compare 规则、create/modify 直接执行与缺信息澄清、qa/query/modify 词表补漏、周末休市规则；122 条全量重跑：路由选项 25→0、JSON 7→0、35 条系统级 Bug 35/35 修复、8 条能力项 5/8 有进展；详见 `docs/plans/2026-08-16-devil-fix-verify.md`。
5. **今日收尾修复（E102）**：LLM 重模型超时 8s→30s（C02/E39 实测生成代码）、新增 project-packager Skill（C05）、github-reader 转真（C06）、天气+芯片多意图拆分（P03）、s1 动作词豁免指代澄清；全量测试通过；详见 `docs/plans/2026-08-16-devil-minimal-fix.md`。
6. **OpenSquilla 借鉴审阅（E103）**：审阅本地 `opensquilla/` v0.5.3 源码与文档；确定 7 项可直接借鉴（Provider Registry + 便宜优先模型路由、单一共享 TurnLoop、路由数据飞轮闭环、记忆双通道召回、分层沙箱 + 拒绝账本、工具结果压缩/上下文预算、Skill 按需过滤）；登记 `docs/borrowed-designs.md` 与需求文档附录 A；详见 `docs/plans/2026-08-16-opensquilla-review.md`。
7. **Provider Registry + 模型分档路由（E104）**：`OpenAiCompatibleClient` 拆到 `llm-client.ts`；新增 `llm-registry.ts`（三厂抽象 + `LLM_PROVIDER_ORDER` 便宜优先 + fallback 链 [P-107]）与 `model-router.ts`（重/中/轻分档 [P-105]/[P-106]）；Stage 5 按档选模型，旧单家配置行为不变；新增 `npm run bench:provider-router` 与 `.env.example` 三厂配置；单测 308/308 + 集成 17/17 全绿，bench:B-20260816-04；详见 `docs/plans/2026-08-16-provider-registry.md`。
8. **模型路由数据飞轮 + UI 目录接入（E105）**：trajectory 新增 `model_route` 事件；route-case 新增 `modelRoute` 字段与 `attachModelRoute`；Stage 5 合成成功后自动写轨迹并回写 case；新增 `npm run model:export`，UI 模型切换器优先读 `ui/prototype/public/model-providers.json`；单测 310/310 + 集成 17/17 全绿，UI 构建通过；详见 `docs/plans/2026-08-16-model-data-flywheel.md`。
9. **单一共享 TurnLoop Gateway（E106）**：新增 Express gateway（`npm run gateway`，`http://127.0.0.1:8787`），`POST /api/ask` 走同一 `answer(query)` 契约；UI `send()` 优先调 gateway，失败回落本地草稿；模型 id（`<provider>:<role>`）经 `PipelineOptions.modelSelection` 覆盖 Stage 5；`src/config/model-catalog.ts` 统一模型目录；单测 316/316 + 集成 17/17 全绿，UI 构建通过，gateway 已启动；详见 `docs/plans/2026-08-16-shared-turnloop-gateway.md`。
10. **Gateway 附件接口 + UI 上传（E107）**：`/api/ask` 接收 base64 data URL 附件并解码为 `RawFileLike`，图片/文档走与 CLI 相同的 Skill 链路；UI `+` 菜单接图片/文件上传，粘贴图片继续可用，`send()` 携带附件；单测 319/319 + 集成 17/17 全绿；详见 `docs/plans/2026-08-16-gateway-attachments.md`。
11. **输入框用量图 + 模式收缩（E108）**：聊天输入框右下角新增上下文用量环（消息长度估算）；Ask/Craft/Plan 改为可收缩单按钮 + 弹出层；UI 构建通过，Playwright 验证无横向溢出、弹出层选择后收起；详见 `docs/plans/2026-08-16-composer-refine.md`。
12. **UI v2 外壳 + mode/submode 契约（E109）**：按《AI-Agent-v2.5_3》重构 UI 为 L0/L1 侧边栏 + 右侧产物栏 + 终端抽屉 + 设置双栏 + 对话区顶部模式胶囊；新增 `src/agent/mode-mapper.ts`，`/api/ask` 返回 `mode/submode`；单测 321/321 + 集成 17/17 全绿；详见 `docs/plans/2026-08-16-ui-v2-shell.md`。
13. **路由校准设置面板接真实数据（E110）**：gateway 新增 `/api/routing/cases`、`/api/routing/batch-mark`、`/api/routing/export`；UI 路由校准表格读取真实 route-case，支持标记正确、刷新、导出 CSV；单测 322/322 + 集成 17/17 全绿；详见 `docs/plans/2026-08-16-routing-calibration-api.md`。
14. **服务商设置接真实数据（E111）**：新增 `src/config/provider-order.ts` 持久化默认 provider 顺序；gateway 新增 `/api/providers`、`/api/providers/default`、`/api/providers/test`；UI 服务商设置显示真实状态，支持测试连接、设为默认；单测 323/323 + 集成 17/17 全绿；详见 `docs/plans/2026-08-16-provider-settings-api.md`。
15. **技能库设置接真实数据（E112）**：新增 `src/config/skills-config.ts` 持久化禁用列表；pipeline 执行跳过禁用 Skill；gateway 新增 `/api/skills`、`/api/skills/sync`；UI 技能库显示真实 19 项，支持启用/禁用、类别筛选；单测 325/325 + 集成 17/17 全绿；详见 `docs/plans/2026-08-16-skills-settings-api.md`。

## 明天继续（按优先级）

1. 解决“低置信兜底话术”回升：强化浏览器兜底/重试/查询改写（SM18/SM31/C08/ET20 等搜索质量类）。
2. 按新基线重打分（旧定稿分只代表旧行为），推进 A/B 套评测拆分。
3. 给 35 条 Bug 清单补状态字段与回归用例，验证 C05 打包与 C06 README 抓取在真实环境稳定。
4. 设置面板写操作接真实 API（记忆/Token 计量）、artifact 事件流与右侧文件列表联动、终端真实执行通道。

## 常用命令

```bash
npm run bench:devil-v25
npm run worksheet:devil-v25
npm run score-sheet:devil-v25
npm run review:devil-v25
npm run evidence:devil-v25
```
