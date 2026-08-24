# 推进计划：架构审计中期批·第五批（P9 + P15）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

中期批继续：P9（document-parser / office-daily 两处 Python 子进程无超时——PyMuPDF/OCR
卡死则请求永久挂起；document-parser 的 stdin EPIPE 未捕获；office-daily stdout 累加无上限）
+ P15（轨迹/用量/指标 JSONL 每事件一次 open-write-close 同步追加，且无轮转/大小上限；
readUsage 每次全量解析整文件）。

## 计划

1. P9 `src/search/document-parser.ts`：parsePdfWithPython 加 [P-111] 20s 超时
   （setTimeout + child.kill，settled 防双结算），stdin 加 error 监听吞 EPIPE（子进程
   提前退出不再未捕获异常）。
2. P9 `src/skills/office-daily/index.ts`：runPython 加 [P-112] 120s 超时 + stdout 累加
   64MB 上限（超限杀进程转下一个候选），error/close/timeout 统一 settled 防双结算。
3. P15 新建 `src/log/jsonl.ts`：`appendJsonl`（文件句柄复用 + 内存字节计数 + 超 [P-113]
   50MB 轮转保留一份 `.1` 归档）、`closeJsonl`（优雅关闭）、`readJsonlCached`
   （mtime+size 双键缓存，避免每次全量解析）。trajectory / usage / metrics 三处接入。
4. P15 `src/trajectory/trajectory-log.ts` 增 `close()`，main.ts finally 补 close；
   `readUsage` / `readSearchMetrics` 改走缓存读。
5. 参数：§5 注册 [P-111]/[P-112]/[P-113] + params.ts。
6. 测试：新建 `src/log/jsonl.test.ts`（追加读回 / 小上限轮转出 .1 归档 / 缓存随写入失效）；
   既有三处 JSONL 测试回归。
7. 文档：AGENTS.md 目录地图 + code-directory + directory-structure 补 `src/log/`；
   .gitignore 补 `*.jsonl.1`；附录 A E212 登记；本计划补结果；交接登记。

**验收标准**

- Python 子进程卡死时按 [P-111]/[P-112] 超时被杀，请求不再永久挂起；EPIPE 不冒泡。
- JSONL 文件超过 [P-113] 后轮转出 `.1` 归档，主文件继续追加；三处行为不变。
- readUsage/readSearchMetrics 连续读命中缓存（mtime+size 任一变化即失效重读）。
- build + 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- 参数：§5 注册 [P-111] 文档解析 Python 子进程超时 20000ms / [P-112] office-daily
  Python 子进程超时 120000ms / [P-113] 单文件 JSONL 轮转大小上限 50MB；
  `src/config/params.ts` 同步 PARAMS + PARAM_IDS（C8 校验通过）。
- P9 `src/search/document-parser.ts`：`parsePdfWithPython` 加 [P-111] 20s 超时
  （setTimeout + child.kill，settled + finish 防双结算），stdin 加 error 监听吞 EPIPE。
- P9 `src/skills/office-daily/index.ts`：`runPython` 加 [P-112] 120s 超时 + stdout
  累加 64MB 上限（超限杀进程转下一个候选），error/close/stdout-cap/timeout 统一走
  settled 防双结算；import PARAMS + 两个模块级常量。
- P15 新建 `src/log/jsonl.ts`：`appendJsonl`（文件句柄复用免每事件 open-write-close +
  内存字节计数 + 超 [P-113] 轮转保留一份 `.1` 归档）、`closeJsonl`（优雅关闭）、
  `clearJsonlReadCache`（测试隔离）、`readJsonlCached`（mtime+size+解析函数三重键缓存，
  避免每次调用全量解析整文件）。
- P15 三处接入：`src/trajectory/trajectory-log.ts`（record 改 appendJsonl，新增 close）、
  `src/usage/usage-store.ts`（recordUsage 改 appendJsonl，readUsage 改缓存读）、
  `src/search/metrics.ts`（logSearchRequest 改 appendJsonl，readSearchMetrics 改缓存读）；
  `src/main.ts` finally 补 `trajectoryLog.close()`（在 userContextStore.close() 与
  browserSession.close() 之间）。
- 测试：新建 `src/log/jsonl.test.ts` 2 条（追加读回+缓存随写入失效、小上限轮转出 .1 归档）。

### 遇到的问题

- 仓库没有 apply_patch，所有编辑用 PowerShell 精确锚点 Replace（[regex]::Matches 计数
  ≠1 抛错）；含模板字符串的代码/测试用单引号 here-string，避免反引号被 PowerShell
  转义；含反引号的锚点（如 `.1` 注释行）首次匹配失败，改用单引号 here-string 后成功。
- `readJsonlCached` 首版缓存只按 mtime+size 双键，不同 parse 函数会命中旧解析结果；
  加解析函数身份第三键后修复（usage/metrics 传模块级稳定函数，热路径仍命中缓存）。
- office-daily/index.ts 为 LF、需求文档为 LF、calendar-skill 为 CRLF；精确 `\n` 锚点
  需先验证换行，锚点含反引号时用单引号字符串变量。
- 轮转测试按 maxBytes=10 精确推算字节（行长含换行），主文件/`.1` 归档行数断言通过。

## 结果

- 验证：`npm run build` 通过；`node --test` 定向 JSONL/trajectory/usage/metrics/
  document-parser 10/10；office-daily 60/60（1 skip，真实 Python/OCR 回归无超时误伤）；
  `npm run test:all` 全量单测 641/642（1 skip）+ 集成 15/15；`doc-lint` 0 FAIL 0 WARN
  （附录 942/950）。
- 测试：新增 `src/log/jsonl.test.ts` 2 条全绿；三处 JSONL 既有测试回归通过。
- 提交：109021b（E208-E214 中期批 1-7）
- 遗留事项：中期批剩余 P1/P2/P10/P12-P14/P16-P17 + B2/B3 + S1-S3。
