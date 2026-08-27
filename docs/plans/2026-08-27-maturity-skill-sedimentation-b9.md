# 推进计划：成熟度 L2 累积——市场 Skill 沉淀第 9 批（报价单 / 采购申请，E262）

> 日期：2026-08-27 · 分支：v0.2b · 状态：执行中

## 目标

继续 Phase 1.2「每周沉淀 3-5 个市场 Skill」节奏，沉淀 采购办公 2 个市场 Skill：
报价单 / 采购申请（复用 E260/E261 `templates.ts` 底座 + E251 `@input` 输入通道），
用户累积 Skill 28→30，登记附录 A E262。

## 计划

1. **扩展 `src/skills/market/templates.ts`**：`buildQuotation`（标题=报价单（日期），章节：报价
   信息（客户/日期/有效期）/ 报价明细（编号/品名/规格/数量/单价/金额）/ 商务条款 / 备注）、
   `buildPurchaseRequest`（标题=采购申请（日期），章节：申请信息（申请人/部门/日期）/ 采购明细
   （编号/品名/规格/数量/用途）/ 预算与供应商 / 审批意见 / 备注）。
2. **单测扩展**：`templates.test.ts` 新增 3 条（报价单结构/章节、采购申请结构/字段、标题日期）。
3. **2 个薄 CLI**：`scripts/market-{quotation,purchase-request}.ts`（@input 通道）；
   package.json 增 `market:quotation` / `market:purchase:request`。
4. **2 个 Skill manifest**：`configs/market-skills/{quotation,purchase-request}/manifest.json`
   （command + input:query + 中文触发词）；本地安装（--yes）。
5. **真实文件验证**：2 Skill 全链 ok:true——quotation（真实 query → 报价单 docx 落盘 +
   python-docx 复核章节）、purchase-request（真实 query → 采购申请 docx 落盘 + 复核）。
6. **文档**：附录 A 登记 E262；计划文档补结果；handoff 追加。

**验收标准**

- `npm run maturity:check` 用户累积 Skill 28→30。
- 2 个 Skill 安装成功且 `skill:market:run` 真实验证 ok:true。
- `npm run build` + 单测全绿 + 集成全绿 + `doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- 扩展 `src/skills/market/templates.ts`：`buildQuotation`（标题=主题（日期），四章节 报价信息/报价明细/商务条款/备注，报价明细含 编号/品名/规格/数量/单价/金额 字段）、`buildPurchaseRequest`（五章节 申请信息/采购明细/预算与供应商/审批意见/备注）。
- `src/skills/market/templates.test.ts` +3 条；新增 `scripts/market-{quotation,purchase-request}.ts`（E251 @input 通道）；package.json +2 个 `market:*` 脚本。
- 新增 `configs/market-skills/{quotation,purchase-request}/manifest.json` 并本地安装（--yes），status=installed。
- 附录 A 登记 E262（E261 锚点前插入，LF 无 BOM）；handoff 追加第 9 批。

### 遇到的问题

- PowerShell 双引号 `node -e` 会把反引号模板字符串 ${title} 插值吞掉，首次插入 templates.ts 失败；`apply_patch` 传参同样被转义。改用 Python 脚本（PowerShell 单引号 here-string 不插值）写入，并验证 LF 无 BOM、无 CRLF。

## 结果

- 真实冒烟 2 Skill 全链 ok:true——quotation「生成电源模块报价单模板」→ `sandbox/market-skills/quotation/电源模块-模板.docx`（python-docx 复核 14 段落四章节）；purchase-request「生成晶振采购申请模板」→ `sandbox/market-skills/purchase-request/晶振申-模板.docx`（python-docx 复核 18 段落五章节）。
- 全量单测 1007/1008（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN；`maturity:check` 用户累积 Skill 28→30。
