# 推进计划：datasheet 下载内容校验

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

修复 `npm run datasheet` 只按链接挑选、不校验 PDF 内容导致的“下载错文件”问题：例如 `item.szlcsc.com/515651.html` 是 TPS5430DDA 页面，却被存成 `STM32F103C8T6.pdf`；或页面首条 PDF 是认证证书。下载后必须解析文本并校验型号前缀，不匹配就换下一个候选，全部不匹配则明确报错且不留下错误文件。

## 计划

1. 复现：对 `item.szlcsc.com/515651.html + STM32F103C8T6` 复跑，确认当前会误存 TPS5430 datasheet。
2. 新增 `src/search/datasheet-verify.ts`：型号前缀匹配器（ST 手册正文用 `STM32F103C8` 这种家族前缀，不用死磕完整型号）。
3. 改 `scripts/datasheet.ts`：候选 PDF 逐个下载 → 解析 → 校验；失败删除误存文件并换下一个，全部失败报错并附尝试列表。
4. 补单测，跑 `npm run test:all`。
5. 真实验证：`item.szlcsc.com/9243.html + STM32F103C8T6` 下载校验通过；`515651.html + STM32F103C8T6` 拒绝误存。
6. 登记 v2.5 附录 A（E83）、更新进度与计划文档，doc-lint，提交推送。

**验收标准**

- 正确页面能下载并校验通过。
- 错误页面/认证证书不再被存成目标型号。
- 单测全绿，doc-lint 0 FAIL/0 WARN。

## 执行过程

### 改动

- 新增 `src/search/datasheet-verify.ts`：型号归一化 + 最长前缀匹配（前缀 ≥6 位即通过，ST 手册用 `STM32F103` 家族名也能命中完整型号）。
- 改 `scripts/datasheet.ts`：候选按“数据手册锚文本 → URL 含型号 → 非 ISO/IEC → 页面顺序”排序，逐个下载 → PyMuPDF 解析 → 校验；失败删除误存文件并换下一个，全部失败报错并附 `attempts`。
- 新增 datasheet-verify 单测 6 条。

### 遇到的问题

- `item.szlcsc.com/515651.html` 是 TPS5430DDA 页面，之前会把 TPS5430 datasheet 存成 `STM32F103C8T6.pdf`；复跑确认旧行为。另发现该页 ISO/IEC 链接就是 665KB 的 DNV 认证证书，现在也会被内容校验拦截。
- ST 数据手册正文用 `STM32F103x8` 家族名而非完整 `STM32F103C8T6`，所以校验用“最长型号前缀”而不是死磕完整型号。

## 结果

- 验证：`item.szlcsc.com/9243.html + STM32F103C8T6` 下载校验通过（179,070 字符）；`515651.html + STM32F103C8T6` 拒绝误存，输出 6 次不匹配尝试，ISO/IEC 证书也被拦截。
- 测试：单测 250/250 + 集成 17/17 全绿；doc-lint 0 FAIL/0 WARN。
- 提交：<hash> · 推送：Gitee / GitHub
- 遗留事项：扫描件 OCR 仍未接入；未传型号参数时保持“不校验直接下载”的旧行为。
