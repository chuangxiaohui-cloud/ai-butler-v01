# 进度交接 2026-08-23（v0.2b 续作）

> 当前分支：`v0.2b`｜E199-E206 + SEV-1.1~1.4 安全批已提交（E199-E201 `ba41dbb`、E202 `8857b47`、
> E203 `7cb6f3c`、SEV `24399d6`、E204 `4b7e34e`、E205 `a05e9fc`、E206 `<pending>`）。
> 上一份交接见 `docs/2026-08-22-progress-handoff.md`。

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
6. **斜杠命令层（E204）**：新增 `src/slash/slash-commands.ts`——`/context` 输出会话状态
   （轮次/逐字窗口 [P-29]/待压缩/摘要/token 粗估 [P-109]），`/compact` 手动压缩窗口外轮次
   （复用 E193 `compact`，输出前后对比）；输出与 `answer()` 契约同形。gateway `/api/ask`
   命中斜杠不进入问答管线；CLI `main.ts` 普通问答补 `conversationId='cli'`，CLI 会话进入
   E193 上下文管理。slash 单测 9 条 + gateway 集成 2 条；CLI 真实冒烟通过。
7. **表格 OCR 网格补位（E205）**：`scripts/office_image_ocr.py` 新增 `_grid_fill_empty_cells`——
   按网格线裁剪「编号锚定数据行」内空的非代码列单元重 OCR（原尺寸优先、2x 兜底），
   score≥0.95 且 ≤4 字符才补入；仅补「短值列」（数量/单位类）、排除合并覆盖单元与代码列；
   新增 `grid_filled` warning。真值对比脚本 `scripts/table_ocr_bench.py`（编号对齐 + 续行合并）。
   bench:B-20260823-02：FR407 单位「套」补入（score 0.979）、FR407-01~-20 未误补；
   登加型确认已被 E201 词典解决；全表 +15s。
8. **v0.2b L2 记忆蒸馏验收收口（E206）**：[P-08] 由 草稿/TODO 转 conditional 定稿，验收口径
   对齐 §4.4 v0.2b 切片（v0.1 数据零丢失自动迁移 + 回归测试）：蒸馏链路以 E6
   bench:B-20260813-01 为证据（137→191，无提取 7 ≈5.1%，失败不阻塞主对话）；
   MemoryCoreStore 同接口同 schema 切换回归通过（记忆相关单测 26/26）；
   `migrate:memorycore` 零丢失校验就绪（dry-run 读源 903 条 L0/2 会话）。
   L2 embedding/向量检索「后置」诚实登记，不在验收内。bench:B-20260823-03。

## 待提交（本批次）

本批次已全部提交（E202 `8857b47`、E203 `7cb6f3c`、E204 `4b7e34e`、E205 `a05e9fc`）。
- 本批次：需求文档 §5 [P-08] + 附录 A E206 + `bench/B-20260823-03-l2-distill-acceptance.md`
  + `docs/plans/2026-08-23-l2-distill-acceptance.md` + 本交接文档（同一主题：v0.2b 记忆蒸馏验收收口）。
- `bench/search-metrics.jsonl` 与根目录临时文件**不在任何批次**，勿混入提交。

## 明日继续（按优先级）

1. **OCR 残差已收口**：登加型（E201 词典）、FR407 单位「套」（E205 网格补位）均已解决。
   已知限制（诚实登记）：长文本列整格漏检仍无法补；FR133 合并行（`叠加型 分开型`/`1 1`/`条 条`）
   与编号半角括号为结构/字形口径差异。方向 3（超分）维持暂缓——「换模型即提升」假设已被方向 1
   实测证伪，残差集中在整格漏检与结构口径，词典/网格优先。
2. **Tavily（备忘，勿忘）**：已接入并启用（`src/search/providers/tavily.ts` + `tavily-trigger.ts`
   条件并联，`.env` 的 `TAVILY_API_KEY` 已配置）。月度配额 [P-64]=1000 落盘
   `data/tavily-monthly.json`；owner 已决策等下月重置，9 月重置后跑 `npm run tavily:smoke` 复核，
   并评估 [P-64] 口径复算（本地计数 vs 远端 credits）。
3. **附录 A 行数预算**：新增 E205/E206 后附录 939/950，继续按 retention 压缩旧段腾行；
   v0.2b 里程碑验收已随 E206 正式收口，下一里程碑动作为 v1.0 切片（深度报告等）。

## 常用命令

```bash
npm run dev -- "/context"            # 斜杠命令：查看会话上下文状态
npm run dev -- "/compact"            # 斜杠命令：手动压缩窗口外轮次
python scripts/office_image_ocr.py --selftest
python scripts/office_image_ocr.py --table <图片> <out.csv>
python scripts/table_ocr_bench.py <图片> data/exp-paddle-gt.json --out <csv>  # OCR 真值对比
python M:\202608111\data\exp-paddle.py        # 方向 1 实测（需读 ~/.paddlex）
npm run build && npm run test:all
npm exec tsx scripts/doc-lint.ts
```
