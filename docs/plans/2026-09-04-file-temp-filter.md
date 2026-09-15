# 推进计划：文件面板临时文件过滤（E335，2026-09-04）

> 关联：E328（projects/ 目录变更监听）B1 手动复验已知项 / 需求 §4.1 UI 文件面板。
> 前置裁决：owner 在 B1 复验后把「/api/files 列表含 ~$/ .tmp 临时文件，删除后残留至下次真实刷新」从“记为已知项不修”改为选「1」——按与 watcher 同口径在列表侧过滤。

## 目标

让 `/api/files` 列表也剔除编辑器/Office 临时文件（`~$*.docx`、`*.tmp`、`*.swp`、`*.lock`、`.~*`），文件面板不再显示临时文件、删除后也不残留；与 `project-watcher` 保持同一口径，避免两处规则漂移。

## 计划

1. `src/gateway/files.ts`：把 watcher 的 `EDITOR_TEMP` 正则上提为导出常量并复用，`walk()` 在 `push` 前按 basename 过滤临时文件（过滤在 push 前做，不占 maxFiles 名额）。
2. `src/gateway/project-watcher.ts`：删本地重复常量，改从 `files.js` 导入 `EDITOR_TEMP`，二次剔除逻辑保留（surgical，不做顺手清理）。
3. `src/gateway/files.test.ts`：补临时文件剔除用例。
4. 文档：附录 A 增 E335 登记；本计划；09-04 交接补小节、后续轮候选行标记改为“E335 已修”；e2e 清单 B1 已知项备注更新。

**验收标准**

- `npm run build` 绿。
- 定向单测（dist 后）：`files.test.js` 2/2 + `project-watcher.test.js` 3/3。
- `npm run doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/gateway/files.ts`：新增 `export const EDITOR_TEMP`（正则与 E328 watcher 原口径逐字一致），`listProjectFiles` 的 `walk()` 对文件分支先 `EDITOR_TEMP.test(name)` 再 push，过滤不占 maxFiles 名额。
- `src/gateway/project-watcher.ts`：删除本地 `EDITOR_TEMP` 定义与注释，改 `import { EDITOR_TEMP, listProjectFiles } from './files.js'`；`snapshotProjects` 二次剔除不变（行为不变式）。
- `src/gateway/files.test.ts`：新增用例「剔除编辑器/Office 临时文件（E335）」——`projects/p1/` 下建 `~$a.docx`/`a.tmp`/`x.swp`/`.~lock.b.docx#`，`sandbox/` 下建 `~$keep.pdf`，断言均不进 `paths`，普通 `.kicad_sch`/`.pdf` 保留。

### 遇到的问题

- 首次跑定向单测时新用例因 `sandbox/` 目录未建而 ENOENT 失败 → 补 `mkdirSync(sandbox)` 后 5/5 绿。
- 无。

## 结果

- 验证：`npm run build` 绿；`node --test dist/gateway/files.test.js dist/gateway/project-watcher.test.js` → files 2/2 + watcher 3/3 全绿。
- 测试：单测 2+3/5 绿（本次波及文件定向），全量 test:all 未跑（成本纪律，待提交批次）。
- 文档：需求附录 A E335 登记、本计划、09-04 交接小节、e2e 清单 B1 备注已同步。
- 提交：未提交（待 owner 拍板批次）。
- 遗留事项：真实 UI 冒烟——新建 `~$a.txt` 后面板不显示（owner 复验通过，2026-09-04）；`bench/search-metrics.jsonl` 有 C2 冒烟新增 10 行未提交，与 E335 无关，待并入后续指标批次。
