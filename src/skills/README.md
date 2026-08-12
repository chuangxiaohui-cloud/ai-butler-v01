# 预置 Skill 清单（v0.1）

v0.1 冷启动采用 **2 项核心 + 4 项占位** 策略，占位项先建目录与接口，防止遗忘。

## 核心项（v0.1 必须实现）

| 目录 | Skill | 作用 | 对应规格 |
|------|-------|------|---------|
| `chip-analysis/` | 芯片/器件分析 | STM32、MOSFET、运放等器件速答 | §7 Datasheet 解析子系统 |
| `jargon-map/` | 黑话映射 | Protel→Altium Designer、"大殖子"等 | §3.2 扩展原则 + §8.2 程序性记忆 |

## 占位项（v0.2a 及以后启用）

| 目录 | Skill | 计划启用版本 | 占位理由 |
|------|-------|-------------|---------|
| `github-reader/` | GitHub 项目解读 | v0.2a | 需要 MCP/浏览器子 Agent |
| `datasheet-speed/` | Datasheet 速读 | v0.2a | 依赖 Datasheet PDF 解析管道 |
| `circuit-topology/` | 常见电路拓扑 | v0.2b | 需要 ExperienceManager 积累 |
| `industry-kits/` | 行业知识包 | v0.2b | 需要 L1/L2 蒸馏后装备 |

> 占位目录保留最小入口文件（`index.ts` + `README.md`），确保构建不报错且版本升级时不会遗漏。
