# Bench B-20260822-04：Bocha 余额探测真跑验证（E192）

> 日期：2026-08-22 · 对应 E192（§D.3 资源包健康检查落地）

## 目的

验证 `/v1/fund/remaining` 余额接口在真实 key 下的可用性、响应结构解析、[P-75] 剩余次数折算，
以及告警文案在健康余额下的行为（不误报）。

## 实测记录

| 项 | 值 |
|----|-----|
| 主 host | `https://api.bocha.cn/v1/fund/remaining` → 200 |
| 备 host | `https://api.bochaai.com/v1/fund/remaining` → 200 |
| 响应结构 | `{ success, code, msg, data: { remaining } }`，remaining 单位元 |
| remaining | 2.80 元 |
| 剩余次数（[P-75] 0.0036 元/次折算） | floor(2.80 / 0.0036) = 777 次 |
| 探测延迟 | 310ms（含 2 host 顺序验证） |
| 告警 | 健康余额 → null（不误报） |
| 持久缓存 | 写 `data/bocha-balance.json`，30 分钟冷却 |

## 结论

- 余额接口双 host 均可用，Bearer 鉴权与文档一致；代码侧 `queryBochaBalance()` 主备回退 + 静默失败可用。
- 剩余次数与账户实况一致（用户充值后余额 2.80 元），可作为「次数预警」的实时依据。
- 回归：`search:smoke` 双引擎 10/10 不回归。
