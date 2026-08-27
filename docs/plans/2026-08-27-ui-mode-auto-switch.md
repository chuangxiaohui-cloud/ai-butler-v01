# 推进计划：UI 体验修复——模式自动切换解锁（E265）

> 日期：2026-08-27 · 分支：v0.2b · 状态：执行中

## 目标

桌面便携版实测反馈：问答后模式不自动切换。根因：`manualLocked` 只在手动点模式时置 true，
全代码无解锁入口——一旦点过模式即永久锁定。本批为 UI 增加「恢复自动识别」入口。

## 计划

1. `ui/prototype/src/App.tsx`：Composer 新增 `onModeAuto` prop；模式菜单加「自动识别」项
   （未锁定时高亮）；锁定标签可点击解锁（title 提示）。自动切换逻辑保持
   （`!manualLocked && data.mode → applyMode`）。
2. 重建 UI 产物；desktop:smoke + 打包版冒烟验证。
3. 重新打包安装包（含 E264 身份直达 + 本批 UI 解锁）。
4. 文档：附录 A 登记 E265；handoff 追加。

## 执行过程

### 改动

- `App.tsx`：Composer props +`onModeAuto: () => void`；mode-overlay 末尾加「自动识别」按钮
  （Sparkles 图标，`!manualLocked` 时高亮，点击 `onModeAuto()` + 关菜单）；lock-tag 改为可点击
  （`onClick={onModeAuto}`，title 提示）；App 调用处 `onModeAuto={() => setManualLocked(false)}`。

### 遇到的问题

- 无阻塞；lucide `Sparkles` 已导入，无需新增依赖。

## 结果

- UI `tsc -b && vite build` 通过（index-CrQZuah-.js 195.48 kB）。
- desktop:smoke 与打包版冒烟 DESKTOP_READY；重新打包 `desktop/release/一人公司AI-Agent 0.1.0.exe`（便携版）。
- 后端单测/集成不变：1014/1015（1 skip）+ 32/32；doc-lint 0 FAIL 0 WARN。
