# 2026-09-12 交接

## E364：layered-arch 右侧文件栏预览收口（未提交）

- 承接：`docs/2026-09-08-progress-handoff.md` 的唯一未决项。
- 根因：`buildStandaloneHtml()` 把内联数据脚本追加在 viewer 脚本之后，viewer 的 `tryNext()` 先启动 `data.json`/目录自加载；UI 的 sandbox iframe origin 为 null，因此出现 CORS/alert 报错。`layered-0908-232110.html` 还是旧生成逻辑，把对象传给 `loadText()` 后 JSON.parse 失败。
- 改动：`src/skills/layered-arch/render.ts` 在 viewer 脚本前写入安全化的 `window.__LAYERED_INLINE__`；`assets/viewer.html` 优先直接渲染内联对象并跳过外部 JSON 加载；`index.test.ts` 增加注入顺序和直接渲染断言。
- 存量产物：已从同名 JSON 重建 `outputs/layered-arch/layered-0908-221449.html` 与 `layered-0908-232110.html`；UI 验证用临时产物 `layered-preview-0912.html` 已清理。
- 验证：`node --import tsx --test src/skills/layered-arch/index.test.ts src/skills/layered-arch/validate.test.ts` 7/7；`npm run build` 绿；真实 gateway + Vite + Playwright 下，5173 右侧文件栏双击原失败的订单图，iframe 完整显示五层内容，无该产物 CORS/alert 错误。`git diff --check` 无空白错误。
- 当日 `npm run doc-lint` 被存量 C7 阻断：需求文档第 19 行的示例 `provisional@2026-08-13` 已超 28 天（输出为 2 FAIL / 0 WARN）；本轮未触及该参数状态，未越界修改。
- 约束：零外部 LLM（¥0）；未跑 E2E/bench；未提交。

## owner 复测与收尾

- owner 已于 2026-09-12 确认右侧栏可正常预览。
- 按 09-08 交接的收尾条件，已清理 `outputs/archify/assets/` 与 `outputs/archify/FreeRTOS系统框架图.{html,json}`；保留 `outputs/archify/SKILL.md` 及 Archify 其他四类图产物。
- `src/skills/README.md` 已明确：架构/框架/分层/模块/组件/系统图归 layered-arch，Archify 保留流程/时序/数据流/生命周期。
- 提交时机仍归 owner。

## E365：安装软件驱动职业画像（未提交）

- 计划：[`docs/plans/2026-09-12-software-profile.md`](./plans/2026-09-12-software-profile.md)。
- 改动：新增 Windows 卸载注册表只读发现与确定性职业推导；`user_profile` 持久化软件清单、职业建议和来源，旧库自动补列；自动画像可更新，手工画像不覆盖；增加 `npm run profile:software -- [--user <id>] [--dry-run]`。
- 本机 dry-run：识别 460 项软件，中文名按 GB18030 正常解码，命中 Altium/Cadence/Keil/KiCad/LTspice/嘉立创EDA，建议「嵌入式电子产品开发工程师」；未写数据库。
- 验证：`npm run build` 绿；`node --test dist/memory/user-context-store.test.js` 8/8；`node --import tsx --test tests/integration/user-context-store.test.ts` 1/1；`git diff --check` 无空白错误。
- `npm run doc-lint` 仍被同一存量 C7 阻断：需求文档第 19 行示例 `provisional@2026-08-13` 已超期，本项未新增 PARAM、未触及该状态。
- 约束：未接启动自动扫描，需用户显式运行 CLI；零外部 LLM（¥0），未跑 E2E/bench，未提交。

## E366：project-writer 单文件事务闭环（未提交）

- 计划：[`docs/plans/2026-09-12-project-writer-transaction.md`](./plans/2026-09-12-project-writer-transaction.md)。
- 改动：project-writer 确认卡新增目标文件/命令变更清单；写入改为同目录临时文件校验后原子替换；失败恢复覆盖文件或删除新建残留；operation-log 增事务状态与回滚关联，用户成功回滚后不会重复回滚同一写入。
- 验证：`npm run build` 绿；confirm-gate + operation-log + project-writer 定向单测 13/13；pipeline E324 挂起回归 1/1；`git diff --check` 无空白错误。
- `npm run doc-lint` 仍仅被存量 C7 阻断：需求文档第 19 行示例 `provisional@2026-08-13` 超期，本项未新增 PARAM、未触及该状态。
- 边界：当前只覆盖 project-writer 单文件事务；多文件/命令型执行器尚未统一接入。零外部 LLM（¥0），未跑 E2E/bench，未提交。

## E367：§8.1.2 记忆资产 ACL（未提交）

- 计划：[`docs/plans/2026-09-12-memory-asset-acl.md`](./plans/2026-09-12-memory-asset-acl.md)。
- 改动：新增三栏固定装备矩阵与默认拒绝 ACL；记忆读取按当前栏位过滤，遗忘在写存储前拒绝越权；UI 随当前栏位请求并显示已装备资产。fact/session 映射 Chat Memory，experience 映射 Skill；Wiki/CodeGraph 未伪造为记忆条目。
- 验证：`npm run build` 绿；ACL + gateway 定向测试 39/39；UI build 绿；`git diff --check` 无空白错误。
- `npm run doc-lint` 仍仅被存量 C7 阻断：需求文档第 19 行示例 `provisional@2026-08-13` 超期；C1–C6/C8 通过，本项未新增 PARAM、未触及该状态。
- 边界：只约束右侧记忆管理 API/UI，未改变问答 pipeline 的上下文注入；零外部 LLM（¥0），未跑 E2E/bench，未提交。

## E368：pipeline 记忆资产 ACL（未提交）

- 计划：[`docs/plans/2026-09-12-pipeline-memory-acl.md`](./plans/2026-09-12-pipeline-memory-acl.md)。
- 改动：`PipelineOptions.mode` 接入三栏 ACL；工程栏仅保留职业/项目画像，不注入长期事实、历史问答和会话上下文；生活栏不检索或透传 Skill 经验；知识栏保留两类资产。`/api/ask`、聊天确认卡、右侧裁决恢复链均传递并校验 mode，缺省调用保持兼容。
- 验证：主项目与 UI build 绿；pipeline 定向测试 4/4；gateway 定向测试 3/3；doc-lint 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 边界：只控制读取/注入，继续保留会话日志、显式事实和经验写入；当前 mode 是本地单用户角色上下文，不替代多租户身份认证。零外部 LLM（¥0），未跑 E2E/bench，未提交。

## E369：§8.1.3 人格数据分层映射（未提交）

- 计划：[`docs/plans/2026-09-12-persona-memory-mapping.md`](./plans/2026-09-12-persona-memory-mapping.md)。
- 改动：新增可审计的事实分类规则；user_facts 只加 kind/layer 两列并自动迁移旧库，旧事实保守归 general/L1；新写入与纠正按内容分类。记忆 API 改为展示真实层级。职业/项目画像继续在 user_profile（L3），回复模板继续在 Skill。
- 验证：主项目与 UI build 绿；persona-memory + user-context-store 单测 11/11；gateway 记忆 API 1/1；既有 UserContext/文化回复集成 3/3；doc-lint 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 边界：不使用 LLM 分类，不从自由文本静默覆盖职业画像；零外部 LLM（¥0），未跑 E2E/bench，未提交。

## E370：显式记忆纠正指令（未提交）

- 计划：[`docs/plans/2026-09-12-memory-correction-command.md`](./plans/2026-09-12-memory-correction-command.md)。
- 改动：新增严格的“纠正/更正记忆”解析；pipeline 在搜索和路由前覆盖旧事实，新事实标记 corrected 并重算人格 kind/layer；无存储或写失败时明确提示未保存。
- 验证：`npm run build` 绿；解析/分类/存储定向单测 14/14；pipeline 定向 3/3；doc-lint 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 边界：只接受带旧值、新值和明确分隔符的指令，普通纠错不写记忆；零外部 LLM（¥0），未跑 E2E/bench，未提交。
- 下一轮推荐：实现同一事实的新旧冲突检测，并以当前栏位事实优先，继续闭环 §8.3.2。

## E371：记忆冲突与当前栏位优先（未提交）

- 计划：[`docs/plans/2026-09-12-memory-conflict-scope.md`](./plans/2026-09-12-memory-conflict-scope.md)。
- 改动：人格事实新增 scope/conflict_key；同栏同槽位新偏好归档旧值，当前栏同键事实覆盖 global，其他栏私有事实不参与注入或记忆管理；普通事实无冲突键，继续并存。旧库自动补列为 global/空键。
- 验证：`npm run build` 绿；冲突键/存储 13/13；pipeline 接线 2/2；gateway 栏位隔离 1/1；doc-lint 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 边界：只对可确定槽位做规则冲突检测，不猜普通事实的语义关系；零外部 LLM（¥0），未跑 E2E/bench，未提交。
- 下一轮推荐：补时间敏感记忆的过期标记与重新确认提示，完成 §8.3.2 剩余规则。

## E372：时间敏感记忆过期提示（未提交）

- 计划：[`docs/plans/2026-09-12-time-sensitive-memory.md`](./plans/2026-09-12-time-sensitive-memory.md)。
- 改动：新增库存、价格、版本、排期四类确定性识别；复用 [P-93] 的 90 天长期事实老化检查点，不新增参数。`user_facts` 无损补齐 temporal_kind/expires_at 并回填已有时间敏感事实；新增与纠正均重算时效元数据。到期事实继续保留和展示，但 prompt 注入及 UI 明确标注“可能已过时，建议重新确认”；专用文化回复不把过期事实当作确定偏好。
- 验证：主项目与 UI build 绿；时间分类 + user-context-store 14/14；gateway 记忆 API 1/1；既有 UserContext/文化回复集成 3/3；`git diff --check` 无空白错误。
- 边界：只识别四类明确关键词，普通事实不猜测；到期是提醒复核，不自动删除。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 下一轮推荐：推进 §8.3.1“已解决的日常/情绪话题退出活跃上下文，并作为 L2 人格素材保留”，补齐上下文生命周期边界。

## E373：已解决生活话题退出活跃上下文（未提交）

- 计划：[`docs/plans/2026-09-12-resolved-life-context.md`](./plans/2026-09-12-resolved-life-context.md)。
- 改动：生活栏收到“解决了/没事了/好多了/想通了”等明确结束语时，只检查最近一个用户话题；若命中保守的日常/情绪词，则在会话文件锁内原子移出该组问答，并将原始主题作为 inferred、life scope 的 general/L2 事实保存。知识/工程栏不触发，技术话题与单独“谢谢”等模糊表达不清理。
- 验证：`npm run build` 绿；session-context + persona-memory 26/26；pipeline 会话接线 4/4；`git diff --check` 无空白错误。
- 边界：只处理最近一组明确完成的话题，不追溯清理已进入旧摘要的内容，不调用 LLM 猜测情绪。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 下一轮推荐：推进 §9.3 轻量反馈闭环，把 UI 现有 👍/👎 从本地状态接入持久化反馈与可审计统计。

## E374：回复 👍/👎 持久化反馈（未提交）

- 计划：[`docs/plans/2026-09-12-answer-feedback.md`](./plans/2026-09-12-answer-feedback.md)。
- 改动：新增 append-only `FeedbackStore`（`data/answer-feedback.jsonl`，复用 [P-113] 轮转）；记录用户、会话、回复消息、问答、栏位、反馈与时间。用户改票保留完整事件历史，但统计按 user/conversation/message 只取最新值。gateway 提供受鉴权保护的写入/审计明细/最新值/统计 API；UI 写入成功后才点亮按钮，并在刷新后恢复当前会话的最新选择。
- 验证：主项目与 UI build 绿；feedback-store 1/1；gateway feedback API 1/1；`git diff --check` 无空白错误。
- 边界：本轮只接 👍/👎；尚未实现 👎 原因标签、可选文字、修改建议及自动 Skill 调权。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 下一轮推荐：继续 §9.3，给 👎 增加原因标签与可选文字补充，并沿用同一 append-only 反馈记录。

## E375：👎 原因标签与文字补充（未提交）

- 计划：[`docs/plans/2026-09-12-negative-feedback-details.md`](./plans/2026-09-12-negative-feedback-details.md)。
- 改动：反馈契约新增 `reason`/`note`；原因固定为“答非所问/太啰嗦/技术错误/漏了重点”。gateway 拒绝未知原因以及 👍 携带负向详情，非法请求不落盘。UI 点击 👎 后展开可选标签与文字框，只有 API 成功才关闭面板并更新选中态；👍 继续一步提交。
- 验证：主项目与 UI build 绿；feedback-store 1/1；gateway feedback API 1/1；`git diff --check` 无空白错误。
- 边界：原因和文字均可选；不在本轮自动调整 Skill 权重或触发升级。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 下一轮推荐：继续 §9.3，接通“修改建议”按钮，把用户修订后的完整回复作为 `correct` 反馈持久化，并写入 Chat Memory L1-L2。

## E376：修改建议反馈与记忆写入（未提交）

- 计划：[`docs/plans/2026-09-12-corrected-answer-feedback.md`](./plans/2026-09-12-corrected-answer-feedback.md)。
- 改动：反馈契约新增 `correct` 与 `correctedAnswer`，append-only 审计同时保留原答和修订答，最新值统计计入 correct。gateway 拒绝空修订、未改动修订及与负反馈详情混用；成功后把技术性修订作为当前栏位 L2、其他回复偏好作为 L1 写入 Chat Memory。UI 的“修改建议”按钮可编辑完整回复，空内容或未改动时不可提交，API 成功后才关闭面板并点亮，刷新后恢复最新反馈状态。
- 验证：主项目与 UI build 绿；feedback-store + persona-memory 6/6；gateway feedback API 2/2；`git diff --check` 无空白错误。
- 边界：修订内容作为回复偏好素材留存，不替换历史消息文本；本轮不做重复模式识别或自动生成 Skill 候选。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 下一轮推荐：继续 §9.3，把 `FeedbackStore` 的按回复最新反馈接入 `maturity:check` 用户反馈指标，避免成熟度仍只读取路由标注样本。

## E377：回复最新反馈接入成熟度指标（未提交）

- 计划：[`docs/plans/2026-09-12-maturity-answer-feedback.md`](./plans/2026-09-12-maturity-answer-feedback.md)。
- 改动：新增成熟度反馈聚合纯函数，继续只保留 source=pipeline 的路由标注，同时合并 `FeedbackStore.latest()` 的回复 accept/reject/correct；同一回复多次改票只计最后一次，correct 沿用 `accept / (accept + reject + correct)` 口径作为未接受样本。
- 验证：`npm run build` 绿；maturity + feedback-store 10/10；`npm run maturity:check -- --json` 只读冒烟通过，当前 L1、反馈 n=23；`git diff --check` 无空白错误。
- 边界：当前工作区回复反馈日志尚无有效新增样本，因此实测数值仍来自既有 pipeline 路由标注；聚合接线和最新值去重分别由单测锁定。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 下一轮推荐：继续 §9.3，把 👎 与实际触发的 Skill 关联；按 [P-79] 检测同一 Skill 连续负反馈并标记“需复审”，暂不自动降权。

## E378：回复负反馈关联 Skill 复审（未提交）

- 计划：[`docs/plans/2026-09-12-skill-feedback-review.md`](./plans/2026-09-12-skill-feedback-review.md)。
- 改动：pipeline 在预置 Skill 直达、市场 Skill 直达及搜索链 Skill 注入成功时返回实际 `skillName`，UI 随回复保存并在反馈时回传；反馈审计增加 Skill 关联。gateway 每次反馈后按该 Skill 的“每条回复最新值”重算 👎 总数与尾部连续 👎，改票不会重复累计；连续 👎 达 [P-79] 时同步 `needs_review`，本轮保持 confidence 不变。gateway 启动时同时把已安装市场 Skill 注册进生命周期库。
- 验证：主项目与 UI build 绿；lifecycle + feedback-store 8/8；pipeline Skill 标识 4/4；gateway feedback 3/3；`git diff --check` 无空白错误。
- 边界：只对带真实 `skillName` 的回复生效；达到阈值只标记复审，不自动降权或弃用。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 下一轮推荐：继续 §9.3，在 Skill 设置页展示“需复审”状态与 👎 计数，并提供由用户确认的“恢复使用”操作，闭合“由用户决定”的管理入口。

## E379：Skill 复审状态与恢复入口（未提交）

- 计划：[`docs/plans/2026-09-12-skill-review-management.md`](./plans/2026-09-12-skill-review-management.md)。
- 改动：`GET /api/skills` 合并 lifecycle 的 active/cold/review 状态、累计 👎、连续 👎 与 confidence，并新增受鉴权保护的恢复接口。Skill 设置页逐卡展示状态与计数；仅 review 状态显示“恢复使用”，用户经原生确认框确认后清除 `needs_review` 与连续 👎，累计 👎 和 confidence 保留。
- 验证：主项目与 UI build 绿；skill-lifecycle 7/7；gateway Skill 管理 API 2/2；`git diff --check` 无空白错误。
- 边界：恢复动作不清空历史反馈、不自动增减权重；未提供一键批量恢复。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 下一轮推荐：继续 §9.3，为重复“修改建议”做确定性模式归并；同类修订重复达到既有候选门槛时只生成 Skill 候选，交由用户确认，不自动安装。

## E380：重复修订生成 Skill 候选（未提交）

- 计划：[`docs/plans/2026-09-12-correction-skill-candidates.md`](./plans/2026-09-12-correction-skill-candidates.md)。
- 改动：新增六类可解释的确定性修订模式与 append-only `SkillCandidateStore`；`correct` 反馈按每条回复最新值归并，同一用户同一模式达到既有 [P-11] 后只生成一个 proposed 候选。gateway 提供候选读取及接受/忽略接口；Skill 设置页展示待确认候选，用户确认后只追加 accepted/rejected 状态。
- 验证：主项目与 UI build 绿；Skill 候选 + gateway 定向测试 46/46；`git diff --check` 无空白错误。
- 边界：候选接受不安装、不启用、不调整 Skill 权重；未调用 LLM 猜测模式。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 下一轮推荐：继续 §9.3，把 accepted 候选生成可审阅的只读 Skill 草案预览；仍需第二次用户确认才允许安装。

## E381：accepted Skill 候选只读草案预览（未提交）

- 计划：[`docs/plans/2026-09-12-skill-candidate-draft-preview.md`](./plans/2026-09-12-skill-candidate-draft-preview.md)。
- 改动：新增确定性草案生成器，仅 accepted 候选可生成；草案包含稳定名称、版本、无权限声明、`answer_postprocess` 适用范围、回复规则、样本证据与 Markdown。gateway 提供按用户隔离的只读接口；Skill 设置页保留 accepted 候选并展示草案全文和阻断原因。
- 验证：主项目与 UI build 绿；候选、草案与 gateway 定向测试 46/46；`git diff --check` 无空白错误。
- 边界：现有市场执行器不支持纯回复规则，草案明确 `installable: false`；本轮未写文件、未注册、未安装、未改变候选审计状态。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 下一轮推荐：继续 §9.3，先定义并接通最小 `answer_postprocess` Skill 运行时契约与单测；契约验证通过前继续禁用安装。
