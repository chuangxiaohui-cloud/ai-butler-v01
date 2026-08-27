# 推进计划：成熟度 L2 累积——市场 Skill 沉淀第 2 批（PDF 合并 / PDF 加密 / 图片格式转换，E255）

> 日期：2026-08-27 · 分支：v0.2b · 状态：已完成

## 目标

继续 Phase 1.2「每周沉淀 3-5 个市场 Skill」节奏，把 PDF 合并、PDF 加密、图片格式转换固化为可执行
市场 Skill（复用 E254 的 `file-readers.ts` 文件工具底座 + E251 `@input` 输入通道），用户累积 Skill
11→14，登记附录 A E255。

## 计划

1. **扩展 `src/skills/market/file-readers.ts`**：`extractFilePaths`（提取全部路径，供多文件输入）、
   `mergePdfs`（office_pdf_merge.py，[P-112]）、`encryptPdf`（office_pdf_encrypt.py，[P-112]，可选密码）、
   `convertImage`（office_image_convert.py，[P-112]，png/jpg/webp/bmp）；统一走 `defaultRunPython`。
2. **单测扩展**：`file-readers.test.ts` 新增多路径提取 + 三个新读写的 fake-run 成败链。
3. **3 个薄 CLI**：`scripts/market-{pdf-merge,pdf-encrypt,image-convert}.ts`（@input 通道；
   merge 输出沙箱 `*-merged.pdf`；encrypt 输出沙箱 `*-encrypted.pdf` + 可选密码；convert 输出沙箱 +
   目标格式）；package.json 增 `market:*` 脚本。
4. **3 个 Skill manifest**：`configs/market-skills/{pdf-merge,pdf-encrypt,image-convert}/manifest.json`
   （command + input:query + 中文触发词）；本地安装（--yes）。
5. **真实文件验证**：pdf-merge（dm365 mb+pb → 沙箱合并，页数相加）、pdf-encrypt（dm365 lb + 密码 →
   沙箱加密，pypdf 带密码可读）、image-convert（AI-Butler/png 真实 PNG → webp）。
6. **文档**：附录 A 登记 E255；计划文档补结果；handoff 追加。

**验收标准**

- `npm run maturity:check` 用户累积 Skill 11→14。
- 3 个 Skill 安装成功且 `skill:market:run` 真实验证 ok:true。
- `npm run build` + 单测全绿 + `doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/skills/market/file-readers.ts`：新增 `extractFilePaths`（按出现顺序去重提取全部路径，
  引号含空格路径先提取并用等长空格占位保持索引）、`mergePdfs` / `encryptPdf` / `convertImage`
  （office_pdf_merge / office_pdf_encrypt / office_image_convert，[P-112]）。
- `src/skills/market/file-readers.test.ts`：新增 9 条（多路径提取 2 + 合并 3 + 加密 2 + 转换 2）。
- `scripts/market-pdf-merge.ts` / `scripts/market-pdf-encrypt.ts` / `scripts/market-image-convert.ts`（新）：
  薄 CLI；密码识别 = 参数中首个 3-32 位字母数字串（中文触发词/路径自动排除）。
- `package.json`：新增 `market:pdf:merge` / `market:pdf:encrypt` / `market:image:convert`。
- `configs/market-skills/{pdf-merge,pdf-encrypt,image-convert}/manifest.json`（新）：command +
  input:query + 中文触发词。
- 附录 A 登记 E255。

### 遇到的问题

- **路径提取顺序**：引号路径先于裸路径处理导致顺序颠倒（破坏文本出现顺序）→ 改为按出现位置
  index 排序，引号段以等长空格占位保持索引不变。
- **密码误判**：触发词（如「加密」「帮我加密」）会被当成密码 → 收紧为「首个 3-32 位字母数字串」
  约定，中文触发词天然排除。

## 结果

- 验证：3 个 Skill 本地安装（--yes）+ `skill:market:run -- <name> --query "<自然语言>"` 全链 ok:true
  并交叉校验产物——pdf-merge（mb+pb → 10 页，pypdf 复核 6+4=10）、pdf-encrypt（lb → is_encrypted=True，
  888888 可解密 1 页）、image-convert（真实 PNG 1440×2359 → webp 有效，76628B）。
- 测试：单测 962/962（新增 9 条）+ 集成 32/32；`npm run build` 通过；`doc-lint` 0 FAIL 0 WARN
  （C8 49 key）；`maturity:check` 用户累积 Skill 11→14。
- 提交：未提交（等待确认后按单一主题提交）· 推送：待执行（Gitee / GitHub）
- 遗留事项：继续 Phase 1 每周沉淀节奏（下一批可做表格 OCR / BOM 对比 / 文档互转类）；复用率/通过率
  观察继续按累积路径节奏记录。
