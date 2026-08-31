# 推进计划：查收件箱按邮件日期排序（E293-后，QQ IMAP seq≠时间顺序）

> 日期：2026-08-31 · 分支：v0.2b · 状态：已完成

## 目标

真实 QQ IMAP 冒烟发现：QQ 邮箱的 IMAP seq 不按时间顺序（2019 年老邮件 seq 2800 > 今天上午邮件 seq 2247，INTERNALDATE 证实为原到达时间；授权码昨日重建后触发重排），导致「最后 N 个 seq」≠「最近 N 封」。将 `fetchRecentEmails` 改为按邮件 Date 排序取最近 N 封。

## 计划

1. `src/mail/imap.ts`：`fetchRecentEmails` 改为 `SEARCH SINCE` 逐档放宽（7→28→112→448→1792 天，~5 年封顶）取候选 seq，取候选尾部 `limit*3` 个 FETCH 头部，按 Date 头解析倒序取前 limit
2. 测试：`imap.test.ts` 列表/limit 断言改为按日期（seq [1,2,3]）；`office-daily/index.test.ts` fake 调整为日期顺序≠seq 顺序，列表与读第 1/2 封断言按日期位次更新
3. 验证：`npm run build` + imap / office-daily 相关单测全绿

**验收标准**

- 列表按 Date 倒序（最新日期在前），不依赖 seq 顺序
- 读第 N 封按日期位次定位（fake 中 seq 顺序与日期顺序不同仍正确）
- 空收件箱 → 空数组；候选不足时返回实际数量
- `npm run build` 绿；相关单测全绿

## 执行过程

### 改动

1. `src/mail/imap.ts`：新增 `searchRecentSeqs`（SEARCH SINCE 逐档放宽）与 `parseHeaderTime`（去时区注释后 `Date.parse`，失败按 0）；`fetchRecentEmails` 改为候选头部按 Date 倒序取前 limit。
2. `src/mail/imap.test.ts`：列表/limit 断言改为按日期排序。
3. `src/skills/office-daily/index.test.ts`：fake 消息调整为日期顺序≠seq 顺序（bob seq1 旧 / alice seq2 新）；列表与读第 1/2 封断言按日期位次更新。

### 遇到的问题

QQ 邮箱 IMAP 的 seq 不按时间顺序：INTERNALDATE 证实 2019-2022 老邮件（seq 2248-2984）原始到达时间远早于今天上午的邮件（seq 2247 NVIDIA），但序号更大——授权码昨日重建后触发重排。SEARCH ALL + 取最后 N 个 seq 的方案失效，改为 SEARCH SINCE 逐档放宽 + 本地按 Date 排序。

## 结果

- 验证：`npm run build` 绿；imap 8/8、office-daily 66/67（1 skip）全绿；真实 QQ 冒烟通过——`查收件箱` 按日期显示（8/31 15:12 电子发烧友 → 8/31 10:17 NVIDIA → … → 8/27 NVIDIA Events），2020 老批次不再混入；`读第 1 封` 读到最新一封正文（带 untrusted_data 标记）。
- 测试：imap.test.ts 列表/limit 2 处断言改按日期（seq [1,2,3]）；office-daily fake 调整为日期顺序≠seq 顺序，列表与读第 1/2 封断言按日期位次更新。
- 提交：本次未提交（待 owner 决定是否随 v0.2b 收尾一并提交）
- 遗留事项：候选窗口取 `limit*3` 个 seq 再按日期取前 limit；5 年内无邮件时返回窗口内实际数量；主题 MIME 解码 / HTML 清洗仍为 v2.6 候选
