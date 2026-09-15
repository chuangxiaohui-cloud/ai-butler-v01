# 推进计划：左栏角色面板——角色 + 子 Agent / Skill 目录真实接入（E350）

> 日期：2026-09-05 · 分支：v0.2b · 状态：完成（未提交，待 owner 拍板批次 + 手动复验）

## 目标

owner 选定 A（§4.1.2 工程开发栏三列布局）：左侧此前只有 l0 图标导航，没有独立的「角色面板」。本轮把左侧补齐为真实数据面板——当前模式角色标识（老板/产品经理/项目经理/系统架构师 或 老专家/贴身女秘书）+ 已接入子 Agent 目录（按 EDA/结构/编码/仿真/构建/系统控制分组、标接入状态）+ Skill 目录概览，数据来自 gateway 只读接口，不再用 mock。

## 计划

1. 后端 `src/gateway/app.ts` 新增只读 `GET /api/agents`：`getSubAgents()`（预置注册表 7 个，§4.1.2 EDA/结构/编码/仿真/构建/系统）+ `loadMcpAgentConfig()`（configs/mcp-agents.json 已配置 id）合并出 `{ id, name, category, available }`，返回 total/available/agents。
2. `src/gateway/app.test.ts` 补用例：`/api/agents` 返回 ≥7 子 Agent、kicad 目录项字段与类别合法、available 为布尔。
3. UI `App.tsx`：新增 `RolePanel`（左栏 `.role-v2`）——顶部当前模式/子模式标签 + 收起；「当前角色」按模式列角色（工程=老板/产品经理/项目经理/系统架构师，知识=老专家，生活=贴身女秘书；submode 命中时高亮）；「子 Agent」按类别分组展示名称 + 可用/未接入状态；「Skill」展示已启用数 + 前 10 个启用 Skill + 管理入口；gateway 未连显示兜底文案。l0 导航新增「角色面板」开关按钮（Users 图标）；`roleOpen` 默认开（App 起于工程模式），`.shell-v2` 加 `role-open` 网格态（46px 图标栏 + 240px 角色列 + 中间 + 右侧）。
4. `styles.css`：`.shell-v2.role-open` 四列网格 + `.role-v2/.role-head/.role-body/.role-block/.role-row/.role-group/.role-status` 等样式。
5. 文档：计划（本文件）、目录文档（gateway API 表 + App.tsx 描述）、需求附录 A E350、当日 handoff 登记。

**验收标准**

- 5173 打开后左栏直接可见「角色面板」：当前模式为工程开发，列老板/产品经理/项目经理/系统架构师；「子 Agent」按类别列出注册表 7 个（接入状态真实反映 configs/mcp-agents.json）；「Skill」显示启用/总数与已启用名单。
- 点 l0 导航 Users 图标可收起/展开左栏；收起后中间对话区回宽。
- gateway 关闭时面板显示「未连接 gateway」提示而非假数据。
- 切换到知识/生活模式，角色区随之变为老专家/贴身女秘书。

## 执行过程

### 改动

- `src/gateway/app.ts`：新增 `GET /api/agents`（只读、无鉴权，同 /api/skills）。
- `src/gateway/app.test.ts`：新增 /api/agents 用例。
- `ui/prototype/src/App.tsx`：RolePanel 组件 + l0 开关 + role-open 网格 + Users 图标。
- `ui/prototype/src/styles.css`：.shell-v2.role-open 四列 + .role-* 样式。
- `docs/directory-structure.md`（Gateway API 表）、`docs/code-directory.md`（App.tsx 行）。

### 遇到的问题

- 需求 §4.1.2 的「子 Agent（KiCad/Altium/…）按类别标注」没有现成 gateway 读接口：补 /api/agents，合并预置注册表与 mcp-agents.json 配置，占位项标「未接入」而非硬编码假可用。
- 左侧面板若做成与 l1-panel 相同的浮层会盖住对话区；改用真实网格列（.shell-v2.role-open 四列 grid-template-areas），收起时回到原三列，避免遮内容。

## 结果

- 验证：`npm run build` 绿；`node --test dist/gateway/app.test.js` 35/35（新增 agents 用例，全量回归绿）；`npm --prefix ui/prototype run build` 绿（tsc+vite）；`npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）；全量 test:all/bench 未跑（成本纪律）。
- 提交：未提交，待 owner 拍板批次。
- 遗留事项：owner 手动复验——重启 gateway + 刷新 5173 后见左栏角色面板（内容与 验收标准 一致）；当前 configs/mcp-agents.json 若只配置了占位/未启用 agent，子 Agent 区会显示「未接入」，属预期。
