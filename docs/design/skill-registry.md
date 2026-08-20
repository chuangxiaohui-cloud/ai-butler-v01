# Skill 注册表设计

> 权威需求：§8.2 / §12.2；实现：`src/skills/registry.ts`、`lifecycle.ts`、`install.ts`

## 1. 当前 23 项 Skill

| Skill | 类别 | 说明 |
|-------|------|------|
| chip-analysis | 预置核心 | 芯片/器件分析 |
| jargon-map | 预置核心 | 黑话映射 |
| github-reader | 预置 | GitHub 项目解读 |
| datasheet-speed | 预置 | Datasheet 速读 |
| circuit-topology | 预置 | 电路拓扑 |
| industry-kits | 预置 | 行业知识包 |
| color-recognition | 原生 | 图片颜色识别 |
| document-qa | 原生 | 文档 QA/摘要/结构 |
| image-analysis | 原生 | 图片描述 |
| knowledge-qa | 原生 | 文化梗/知识问答 |
| content-writer | 原生 | PRD/文档生成 |
| calendar-skill | 原生 | 本地日历 |
| quote-compare | 原生 | 报价对比 |
| im-dispatch | 原生 | 消息待发队列 |
| engineer | 原生 | 代码实现 |
| delivery-workflow | 原生 | 工程流程注入 |
| plan-validation | 原生 | 计划编译校验 |
| browser-session | 原生 | 浏览器会话 |
| project-packager | 原生 | 项目打包 |
| project-writer | 原生 | 工程文件写入（备份 + 回读校验 + 上一轮记忆回溯） |
| schematic-bom | 原生 | PDF 原理图 BOM：位号解析 + 聚合 + CSV 落盘 |
| office-daily | 原生 | 办公日常：考勤模板 / CSV+xlsx+xlsm 占比 / 邮件草稿 / 图片压缩 / 文档排版（docx/md/txt/pdf）/ PDF→Word / PPT / 主动提醒 |
| video-learner | 原生 | 视频字幕 → LLM → Skill 定义落盘 |

运行时事实以 `src/skills/registry.ts` 与 `/api/skills` 为准。

## 2. 接口与生命周期

```ts
interface ExecutableSkill {
  name: string;
  version: string;
  triggers: string[];
  execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput>;
}
```

生命周期元数据存 `skill_stats`：

- usage_count / thumbs_down_count / consecutive_down
- confidence / last_used_at / created_at / needs_review

`SkillInput` 的 `workingMemory` 可选携带最近 L0 问答（`{ query, answer }`），
供 project-writer 等执行类 Skill 在缺内容时回溯上一轮生成结果。

治理规则：冷存 [P-31]、衰减 [P-30]、最低置信 [P-32]、连续 👎 [P-79] 复审、触发按特异性优先。

## 3. wrapLegacySkill

旧 `LegacySkillDef.handler(query)` 统一包装为 `ExecutableSkill`，默认置信度 [P-89]；
新 Skill 直接实现 `execute`，不再出现双轨接口。

## 4. 市场安装

- manifest：`{ name, version, triggers, description? }`。
- 校验：name 只允许小写字母/数字/连字符，version 非空，triggers 至少 1 个。
- 安装：`npm run install:skill` 生成 `src/skills/<name>/index.ts` 并自动注册进 registry。
- 安全边界：安装 Skill 等同引入可执行能力，须过 §10 沙箱与命令白名单；高风险权限逐项征求用户确认。

## 5. 维护纪律

- 新增 Skill 必须同步维护 registry、生命周期元数据、`src/skills/README.md`、测试。
- 禁用列表由 `src/config/skills-config.ts` 持久化，pipeline 执行与 `findBest` 均跳过禁用项。
