# 推进计划：身份问答一致性（路由标签 / 模型档位 / 成本提示 E268）

> 日期：2026-08-27 · 分支：v0.2b · 状态：已完成

## 目标

修复桌面便携版实测「你现在是什么模型？」的 3 个问题：① 回复 meta 错标「工程开发 · 后端」；② 回答称由 deepseek-v4-pro 驱动但 UI 显示 deepseek-chat（状态冲突）；③ 身份问题若真走 heavy 档成本过高。

## 计划

1. UI：回复 meta 改为按后端返回的 `data.mode`/`data.submode` 计算（去掉硬编码「· 后端」），身份问题正确显示「知识咨询」。
2. UI：默认模型档位改为 P-105 缺省中档（medium），FALLBACK_MODELS 标签换成实体模型名（deepseek-v4-flash/pro），目录加载后未手动选择时跟随 catalog.defaultTier。
3. 后端：`buildSelfIdentityAnswer` 措辞改为「当前生效模型」，并明确身份类问题由内置规则秒回、不消耗模型调用额度。
4. 测试：更新 self-identity 单测断言；跑 `npm run build` + `npm run test:all` + doc-lint。
5. playwright 端到端：问「你现在是什么模型？」验证 meta=知识咨询、切换器显示 deepseek-v4-flash（medium）、回答与 UI 一致。
6. 重新打包便携版/安装版，同步 `data\` 副本，登记附录 A E268 并提交。

**验收标准**

- 身份问题回复 meta 显示「知识咨询」，不再出现「工程开发 · 后端」。
- 未手动切换模型时，UI 切换器与回答均为 medium 档（deepseek-v4-flash），两者一致。
- 回答明确身份问题不消耗模型额度，成本担忧解除。
- 单测全绿 + doc-lint 0 FAIL 0 WARN + 便携版实测通过。

## 执行过程

### 改动

- `ui/prototype/src/App.tsx`：meta 计算、默认档位、FALLBACK_MODELS 标签、defaultTier 跟随。
- `src/search/self-identity.ts`：回答措辞与成本说明。
- `src/search/self-identity.test.ts`：断言更新。

### 遇到的问题

- playwright 端到端确认：默认模型 = deepseek:medium（deepseek-v4-flash），身份问题回复 meta=「知识咨询」，正文与 UI 档位一致且说明不消耗模型额度。
- 打包时 electron-builder 写 AppData 缓存目录被沙箱拦截，提权后完成。
- MiniMax 官方文档三档模型名（M2.7-highspeed/M2.7/M3）一并落地，切换器不再出现两个 M2.7。

## 结果

- 验证：UI `tsc -b && vite build` 通过（index-Bt-sen56.js）；playwright-core + Edge 实测通过（meta=知识咨询、默认 deepseek-v4-flash medium、MiniMax M2.7-highspeed/M2.7/M3）；打包版冒烟 DESKTOP_READY；`data\一人公司AI-Agent 0.1.0.exe` 已同步。
- 测试：单测 1015/1016（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 49 key）。
- 提交：`dbc9f09`（E268，10 文件 +150/-25）
- 遗留事项：用户实测新便携版；普通知识问答 30s 耗时调优待排期。
