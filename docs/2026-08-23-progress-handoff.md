# 进度交接 2026-08-23（v0.2b 续作）

> 当前分支：`v0.2b`｜E199-E201 已提交（HEAD=`ba41dbb`），本批次 OCR 方向决策登记（E202）待提交。上一份交接见 `docs/2026-08-22-progress-handoff.md`。

## 今日已收口

1. **表格 OCR 页脚/页码过滤（E199）**：`scripts/office_image_ocr.py` 新增 `_filter_page_footer`
   （图片底部 10% + 强模式「第X页，共Y页」双条件才剔除，无模式页脚如实保留），真实样本
   `OCRtest.png` 复现并验证（csv 末行页码排除、54×7 结构不变）；E185/E186 跨页回归通过。
2. **编号列识别率提升（E200）**：三通道文本融合（结构用透字抑制通道、非代码列文本用灰度
   通道按位置替换/补框、代码列用 2x 预处理通道）+ 编号模式纠正 `correct_code_cell`
   （数字槽混淆 `{S/B→8, O→0, l→1}`）；`--selftest` 13 用例。编号 0%→**100%**。
3. **词典纠正（E201）**：`correct_dict_cell` 精确命中直接替换、长文本相似度 0.78 模糊替换、
   短文本不模糊替换防误伤；默认 `data/ocr-dict.json`（git 忽略）。名称 49/49、型号 43/45（96%）。
4. **五项增量方向决策收口（E202）**：方向 2 已落地（E200/E201）；方向 4（源头提分辨率：
   截图转 PDF / 高 DPI 导出）登记需求文档 §12.6 长期建议；方向 5 排除项（WinRT OCR/列裁剪/
   二值化/直方图均衡）归档；方向 1（PP-OCRv6）与方向 3（超分）状态与阻塞登记
   `docs/plans/2026-08-22-ocr-accuracy.md` 决策表。doc-lint 0 FAIL 0 WARN（附录 935/950）。

## 待提交（本批次）

- 需求文档 §12.6 + 附录 A E202 + 计划文档决策表 + 本交接文档（同一主题：OCR 方向决策收口）。
- 并行改动（SEV-1.1~1.4：`sandbox.ts`/`memorycore-store.ts`/`terminal.ts` 及测试）+ `bench/search-metrics.jsonl`
  与根目录临时文件**不在本批次**，勿混入提交。

## 明日继续（按优先级）

1. **方向 1（PaddleOCR）实测**：`data/exp-paddle.py` 已备好（原图 + P2@2x 对比、XLS 对齐评估）。
   阻塞：沙箱 ACL 拒读 `C:\Users\zhxh\.paddlex` 模型缓存 + 提权被审核服务误拒——审核器报
   「支持 deepseek-v4-pro/flash 却收到 gpt-5.6-luna」，属审核规则模型名配置 bug、非安全策略拒绝。
   **需 owner 修审核白名单模型名匹配规则**（放开或映射当前模型名），修好后重跑脚本；或 owner
   本机直接跑。Paddle 冷启动约 117s（E97 实测）属正常。若 PP-OCRv6 显著优于 RapidOCR，再评估
   接入 `office_image_ocr.py`（`PDF_OCR_ENGINE=paddle` 已支持）。
2. **方向 3（超分）评估**：等方向 1+2 结果，若残差（登加型歧义/FR405 型号乱码/FR407 单位漏检）
   仍以像素模糊为主再考虑 Real-ESRGAN；否则维持暂缓。
3. **斜杠命令层（备忘，勿忘）**：`/compact`（手动触发当前会话压缩）+ `/context`（会话状态：
   轮次/逐字窗口/摘要/token 粗估）——E193 上下文压缩的手动入口，参考 AI-Butler 增补方案
   §12.7（MiMo-Code `/compact`，SessionCompaction + COMPACTABLE_TOOL_NAMES）与
   `src/interaction/memory-hub.ts`（规则版滚动摘要 + 实体槽位/指代消解，零 LLM 成本兜底）；
   owner 已确认按计划在合适时机实现。
4. **Tavily（备忘，勿忘）**：已接入并启用（`src/search/providers/tavily.ts` + `tavily-trigger.ts`
   条件并联，`.env` 的 `TAVILY_API_KEY` 已配置）。月度配额 [P-64]=1000 落盘
   `data/tavily-monthly.json`；owner 已决策等下月重置，9 月重置后跑 `npm run tavily:smoke` 复核，
   并评估 [P-64] 口径复算（本地计数 vs 远端 credits）。
5. **附录 A 行数预算**：当前 935/950，新增条目继续按 retention 压缩旧段腾行。

## 常用命令

```bash
python scripts/office_image_ocr.py --selftest
python scripts/office_image_ocr.py --table <图片> <out.csv>
python M:\202608111\data\exp-paddle.py        # 方向 1 实测（需读 ~/.paddlex）
npm run build && npm run test:all
npm exec tsx scripts/doc-lint.ts
```
