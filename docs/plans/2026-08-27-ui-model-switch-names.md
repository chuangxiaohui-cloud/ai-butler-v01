# 推进计划：UI 体验修复——模型切换器显示实体模型名（E267）

> 日期：2026-08-27 · 分支：v0.2b · 状态：执行中

## 目标

桌面便携版实测反馈：模型切换器里 DeepSeek 三档都显示「deepseek-chat」（应为 deepseek-v4-flash/pro），
MiniMax 连续两个 M2.7。根因：UI 拉取打包内的静态 `model-providers.json`（8/16 默认值），而非网关动态目录
（读 `.env` 实际 `DEEPSEEK_*` 配置）。

## 计划

1. `ui/prototype/src/App.tsx`：模型目录改为优先拉 `GET /api/model-providers`（网关动态），失败回退静态
   `model-providers.json`，均失败保留 FALLBACK_MODELS；修复动态 fetch 失败时直接跳 catch 未回退的 bug。
2. 重新生成 `ui/prototype/public/model-providers.json`（buildModelCatalog 读 .env）。
3. 重建 UI + playwright 实测 + 重新打包便携版。
4. 文档：附录 A 登记 E267；handoff 追加。

## 执行过程

### 改动

- `App.tsx` useEffect：动态 fetch 后加 `.catch(() => null)`，静态 fetch 后加 `.catch(() => [])`，
  确保网关不可达时仍回退静态目录。
- 用 tsx 脚本调 `buildModelCatalog()` 重写 `public/model-providers.json`
  （deepseek-v4-flash / deepseek-v4-pro；minimax M2.7/M3；zhipu glm-5-turbo/5.2/5.3）。

### 遇到的问题

- 网关动态目录正确但 UI 仍显示 chat：定位到 UI 动态 fetch 失败即跳 catch 不回退静态（首次测试 8787 无服务时）。
  补 `.catch(() => null)` 后回退链生效。

## 结果

- UI `tsc -b && vite build` 通过（index-Dp0AQ0fx.js）。
- playwright-core + Edge 实测（gateway 8787 动态）：DeepSeek 显示 deepseek-v4-flash（快速/均衡）+
  deepseek-v4-pro（旗舰·推理）、MiniMax M2.7/M2.7/M3、智谱 glm-5-turbo/5.2/5.3。
- 重新打包便携版与安装版；后端不变 1014/1015（1 skip）+ 32/32；doc-lint 0 FAIL 0 WARN。

## 说明

- deepseek-v4-flash-vision 是视觉档模型，不走聊天档（light/medium/heavy）切换器，属设计如此。
- MiniMax light/medium 同用 M2.7（同一模型两档配置），note（快速/均衡）加以区分。
