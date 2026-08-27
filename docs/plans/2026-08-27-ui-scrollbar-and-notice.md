# 推进计划：UI 体验修复——回复区滚动条 + 预警提示去重（E266）

> 日期：2026-08-27 · 分支：v0.2b · 状态：执行中

## 目标

桌面便携版实测反馈：① 回复内容过长时窗口右边无下拉条，需拉伸窗口才能看全；
② Tavily 超限等提示在顶部 banner 与消息内重复显示。

## 计划

1. `ui/prototype/src/styles.css`：补齐 grid/flex 高度链（`.app-shell` 行 2 改 `minmax(0, 1fr)`、
   `.center-v2` +`min-height:0`+`overflow:hidden`）；`.message-list` 增加深色主题滚动条样式。
2. `ui/prototype/src/App.tsx`：去掉回答后自动设置顶部 banner（`data.notice`），保留消息内 `msg.notice`。
3. 验证：vite build + playwright-core(Edge) 实测滚动；重新打包便携版。
4. 文档：附录 A 登记 E266；handoff 追加。

## 执行过程

### 改动

- `styles.css`：`.app-shell` grid 行 `58px 1fr 30px` → `58px minmax(0, 1fr) 30px`；`.center-v2` 加
  `min-height: 0; overflow: hidden;`；`.chat-v2 .message-list` 加 `scrollbar-gutter: stable` +
  `::-webkit-scrollbar` 深色主题 thumb 样式。
- `App.tsx`：删除 `if (data.notice) setBannerNotice(data.notice);`（banner 仅保留手动预警入口，不再自动弹）。

### 遇到的问题

- 无阻塞；根因为 grid `1fr` 行与 `.center-v2` 缺 `min-height: 0`，内容把视口撑开而非内部滚动。

## 结果

- UI `tsc -b && vite build` 通过（index-D7Olf8Ee.js / index-D8UfKu3Z.css）。
- playwright-core + Edge（820x620 窗口）实测：`.message-list` 注入 40 条后 `scrollHeight 2224 > clientHeight 395`、
  `scrollTop` 可滚动——修复前内容撑开视口无滚动条。
- 重新打包便携版与安装版；后端不变 1014/1015（1 skip）+ 32/32；doc-lint 0 FAIL 0 WARN。
