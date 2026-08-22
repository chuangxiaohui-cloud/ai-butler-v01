# 进度交接 2026-08-23（v0.2b 续作）

> 当前分支：`v0.2b`｜E199-E201 已提交（`ba41dbb`），E202 已提交（`8857b47`），本批次 E203（方向 1 实测归档 + E201 词典扩展）待提交。上一份交接见 `docs/2026-08-22-progress-handoff.md`。

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
5. **方向 1 实测归档 + E201 词典扩展（E203）**：`data/exp-paddle.py` 修复三处阻塞
   （xlrd 残缺 → `data/exp-paddle-gt.json` 真值兜底；oneDNN 指令不兼容 →
   `PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT=False` 同 E97；PP-OCRv6 rec 框 `[l,t,r,b]` → 通用解析）
   后由 owner 本机真跑：目标残差 3 处（糖胶枪/FR405 乱码/FR407 单位套）**全部未修复**，且
   新引入 `LBD补光灯`/`宣鼎SSD`/`GO70VW01`/`LVD8线`/`外亮模具` 5 处新错、单图约 240s
   （比 RapidOCR 慢约 100 倍）——**不达标归档**，默认引擎维持 RapidOCR，`PDF_OCR_ENGINE=paddle`
   保留为可选慢速通道。E201 词典扩展处理残差：型号补 `白色(糖胶枪)`、FR405 两通道乱码读数
   映射规范值、尾片段 `%2.01` 清洗，备件名称 `LBD补光灯→LED补光灯`/`外亮模具→外壳模具`/
   `LVD8线→LVDS线`。bench:B-20260823-01 真跑：型号 43/45→**44/45**（FR405 修复），其余列持平。

## 待提交（本批次）

- 需求文档 §12.6 + 附录 A E202 + 计划文档决策表 + 本交接文档（同一主题：OCR 方向决策收口）。
- 需求文档附录 A E203 + 计划文档 E203 结果段 + 本交接文档 + `bench/B-20260823-01-table-ocr-direction1-dict.md`
  + `scripts/ocr-dict.example.json`（同一主题：方向 1 实测归档 + E201 词典扩展）。
- 并行改动（SEV-1.1~1.4：`sandbox.ts`/`memorycore-store.ts`/`terminal.ts` 及测试）+ `bench/search-metrics.jsonl`
  与根目录临时文件**不在本批次**，勿混入提交。

## 明日继续（按优先级）

1. **剩余残差 2 处**：① 登加型歧义（`叠加型/分开型` 合并行拆分，需按备件名/上下文消歧）；
   ② FR407 单位「套」整格漏检（两通道均未检出，词典无法补缺失文本，需网格补位或源头提分辨率）。
   方向 1（PaddleOCR）已实测归档，方向 3（超分）维持暂缓——「换模型即提升」假设被证伪，
   残差集中在上下文消歧与整格漏检，词典/网格优先。
2. **斜杠命令层（备忘，勿忘）**：`/compact`（手动触发当前会话压缩）+ `/context`（会话状态：
   轮次/逐字窗口/摘要/token 粗估）——E193 上下文压缩的手动入口，参考 AI-Butler 增补方案
   §12.7（MiMo-Code `/compact`，SessionCompaction + COMPACTABLE_TOOL_NAMES）与
   `src/interaction/memory-hub.ts`（规则版滚动摘要 + 实体槽位/指代消解，零 LLM 成本兜底）；
   owner 已确认按计划在合适时机实现。
3. **Tavily（备忘，勿忘）**：已接入并启用（`src/search/providers/tavily.ts` + `tavily-trigger.ts`
   条件并联，`.env` 的 `TAVILY_API_KEY` 已配置）。月度配额 [P-64]=1000 落盘
   `data/tavily-monthly.json`；owner 已决策等下月重置，9 月重置后跑 `npm run tavily:smoke` 复核，
   并评估 [P-64] 口径复算（本地计数 vs 远端 credits）。
4. **附录 A 行数预算**：新增 E203 后行数见 doc-lint 输出，继续按 retention 压缩旧段腾行。

## 常用命令

```bash
python scripts/office_image_ocr.py --selftest
python scripts/office_image_ocr.py --table <图片> <out.csv>
python M:\202608111\data\exp-paddle.py        # 方向 1 实测（需读 ~/.paddlex）
npm run build && npm run test:all
npm exec tsx scripts/doc-lint.ts
```
