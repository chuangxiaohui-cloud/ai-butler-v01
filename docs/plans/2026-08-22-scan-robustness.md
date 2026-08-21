# 推进计划：扫描件透字/折痕/彩色底鲁棒性（E181）

> 日期：2026-08-22 · 分支：v0.2b · 状态：已完成

## 目标

承接 E178（deskew 倾斜纠正）。真实扫描件除倾斜外还常见三类噪声：彩色底纹、
折痕阴影、背面透字/水印。其中浅灰透字文本 OCR 置信度极高（0.99+），会作为“真实
文本”占据表格空槽，导致合并还原把残影当成垂直标签、产出移位或截断的伪合并。
本期做两层防御：先做局部对比度抑制滤掉低对比度残影墨，再在无法滤除时用相位守卫
把伪合并转为诚实 warning，不让 Agent 输出错结构。

## 计划

1. `scripts/office_image_ocr.py` 新增 `suppress_faint_ink(arr, threshold=85.0)`：
   - 灰度图与高斯模糊 5px 背景做差，`背景 − 前景 > 85`（相对局部背景对比度足够高）
     的暗墨保留，低对比度残影置白；返回等尺寸 RGB。
   - numpy/PIL 缺失或异常回退原图不抛错；对干净扫描件为空操作。
   - `--table` 路径改为 `load_image → deskew_image → suppress_faint_ink →
     run_ocr → detect_table_lines(cleaned)`。
2. `detect_merges` 阶段 B 垂直扩展截断守卫：垂直扩展向上推进到 `r_top` 时若
   `r_top > 0` 且上方同列 `(r_top-1, c)` 不在 covered 集合（即不是被整行标题/水平
   组头覆盖的合法槽位），判定为“上方同列有其它文本”的截断——追加 `merged_conflict`
   warning（文案含“可能为透字/水印噪声，无法自动还原”），并把本应属于垂直标签的
   槽位标 covered，防止阶段 C 水平启发式把空槽误并到其它锚点。
3. 阈值标定：T=70 仍残留残字；T≥100 彩色底图崩出三处合并。85 是安全点（彩色底/
   折痕/透字 160 全保，透字 90-140 诚实降级）。
4. 测试：office-daily 新增 1 条真跑（合成 4 变体：彩色底/折痕/透字 160/透字 90）。
5. 文档：附录 A 登记 E181（压缩 E68 旧条目腾行）、skills README、handoff、doc-lint。

**验收标准（本次对齐）**

- 彩色底/折痕/透字 160 → merges `A1:A3`+`B1:C1`，无 warning，答案“已还原 2 处”。
- 透字 90 → 无伪合并，只剩 `B1:C1` + 1 条 `merged_conflict` warning，答案含“无法自动还原”。
- 既有 10 张回归图 merges 输出与 E177 一致（`suppress` 对干净图为空操作、相位守卫
  只影响 `r_top>0` 场景）。
- `npm run build` + `npm run test:all` + `doc-lint`（0 FAIL 0 WARN）全绿。

## 执行过程

- 合成失效样本：`data/scan-syn/` 8 变体（基于 3 行 L 形 420×430 表格）——
  `base/color/color-noise/crease-v/crease-h/crease-v-rot/bleed{90,120,140,160,180}`。
  crease/color/bleed160 补丁前即正确；bleed90-140 是唯一破坏性场景。
- OCR 置信度验证：透字文本（灰 90-180 全范围）RapidOCR 置信度 0.99+，分数过滤无效；
  必须从图像侧抑制。
- 阈值扫描：T=70 残留残字；T=85 全场景正确；T=100+ 彩色底图 `color` 崩成三处合并
  （`A1:A3`+`B1:C1`+`C1:D3`）。最终取 85。
- 补丁落位：`suppress_faint_ink` 插在 `deskew_image` 与 `run_ocr` 之间，表格路径
  的 OCR 与网格线检测共用清洗图（保结构一致）；相位 B 守卫在垂直扩展循环内。
- 测试内嵌 Python 曾因 `f = font(22)`（`font` 已被 `truetype` 对象占用）抛
  `FreeTypeFont object is not callable`，改为 `bleed()` 内独立创建 22px 字体后通过。

## 结果

- `suppress_faint_ink` + 相位 B 截断守卫落地；`bleed160` 抑制后 OCR 项只剩 11 个真实
  文本，`A1:A3` 恢复；`bleed90` 诚实降级为 `B1:C1` + 1 条 `merged_conflict` warning。
- 合成 8 变体全部通过；既有 10 张回归图 merges 与 E177 一致，零回归。
- 测试：office-daily 新增 1 条真跑（4 变体断言，xlsx 读回 `model.merges` + warnings
  断言）；主项目 build；单测 535/535 通过 + 1 条 fitz 门控用例按环境跳过 + 集成
  17/17 全绿；doc-lint 0 FAIL 0 WARN。
- 已知边界：透字墨色过重（灰度 <90）超出局部对比度阈值范围时无法滤除，靠相位 B
  守卫诚实提示不产出伪合并；下期做合并还原时可直接复用 TSR 的 bbox/span 原始数据。
