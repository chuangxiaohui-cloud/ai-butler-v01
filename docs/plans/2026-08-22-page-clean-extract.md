# 推进计划：网页正文去噪提取 + 引用编号（E182）

> 日期：2026-08-22 · 分支：v0.2b · 状态：已完成

## 目标

借鉴 crawl4ai 的“Clean Markdown + 引用编号”设计（借设计不借底座，见
`docs/borrowed-designs.md` 纪律），不引入 Python/Playwright 重依赖，在现有
`BrowserSessionManager.fetchPage`（CDP 持久会话）内做两层增强：

1. **去噪提取**：目前 `fetchPage` 只取 `main/body.textContent` 摊平文本，导航/页脚/
   广告会混入正文。改为块级感知提取：优先 `main/article/[role=main]`，跳过
   `nav/header/footer/aside/script/style/form/button/iframe` 及广告类 class/id，
   保留段落/标题/列表的换行边界，限制 2 万字符。
2. **引用编号**：页面内外部链接去重后生成编号引用 `[n] url（锚文本）`，随
   `FetchPageResult.citations` 返回；browser-session skill 与 CLI 输出时附上引用列表，
   让答案可溯源。

## 计划

1. `src/browser/session.ts`：
   - `FetchPageResult` 增加可选 `citations?: Array<{ url: string; text: string }>`。
   - 抽出自包含的 `extractPageScript()`（可单测，body 不依赖模块闭包）：
     - 正文：`main || article || [role=main] || body`，递归收集文本块，跳过噪音标签
       与广告类（`advert/banner/sidebar/breadcrumb/pagination/copyright/social/share/
       menu/navbar`），块级标签间补 `\n`，折叠空白后截断 2 万字符。
     - 链接：`a[href]` 去重，仅保留 `http(s)`；`.pdf` 进 `pdfLinks`（行为不变），
       其余进 `links`（上限 20），带锚文本。
   - `fetchPage` 返回 `citations: links`。
2. `src/skills/browser-session/index.ts`：答案追加“引用：[n] url（锚文本）”列表
   （前 10 条），不改变正文截断。
3. `scripts/browser-session.ts`：fetch 输出附引用列表。
4. 测试：`src/browser/session.test.ts`——既有 mock 用例补 `citations` 断言；新增 1 条
   单测用最小 fake DOM 直接跑 `extractPageScript()`（断言去噪：nav/footer/广告被剔除、
   段落保留换行、链接去重编号、pdf 仍进 pdfLinks）。
5. 文档：附录 A 登记 E182、handoff、skills README、doc-lint。

**验收标准（本次对齐）**

- `fetchPage` 返回新增 `citations`，既有 `text/pdfLinks/sessionDomains` 不变。
- 去噪后正文不含导航/页脚/广告文本，保留段落换行。
- 引用编号去重、可溯源；pdfLinks 行为与 E125 之前完全一致（回归）。
- `npm run build` + `npm run test:all` + `doc-lint`（0 FAIL 0 WARN）全绿。


## 结果

- `extractPageScript()` 落地：优先 `main/article/[role=main]`，跳过 nav/footer/广告类
  噪音，块级标签保留换行，正文上限 2 万字符；外部链接去重编号进 `citations`（同页锚点、
  pdf 分流到 `pdfLinks`，行为与 E125 一致）。函数体自包含，可直接传 `page.evaluate`。
- `FetchPageResult` 新增可选 `citations`；browser-session skill 答案追加引用列表
  （前 10 条），`browser:fetch` CLI 输出 citations。
- 测试：新增 2 条单测（citations 透传 + fake-DOM 去噪/去重/块级换行）；主项目 build；
  单测 536/536 通过 + 1 条 fitz 门控用例按环境跳过 + 集成 17/17 全绿；doc-lint 0 FAIL 0 WARN。
- 已登记 `docs/borrowed-designs.md` 2.8（crawl4ai → clean 提取 + 引用编号，借设计不借底座）。
- 遗留：search-loop 证据补强暂只消费 `text`，后续可把 `citations` 并入 evidence 输出；
  批量结构化抓页/深爬留待出现真实需求再评估 crawl4ai sidecar。
