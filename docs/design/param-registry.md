# PARAM 注册表维护规范

> 权威需求：§5；代码：`src/config/params.ts`

## 1. 权威归属

- 数值唯一权威：需求文档 §5 `[P-NN]` 注册表。
- 代码侧：`src/config/params.ts` 的 `PARAMS` + `PARAM_IDS`。
- 文档正文禁止裸数值，只允许 `[P-NN]` 或 `[P-NN 名称]`。

## 2. ID 纪律

- 已引用 ID 永不重编号；缺口由清点 pass 填充或追加。
- `P-NN` ↔ camelCase key 必须双射且全局唯一。
- 集成测试 `tests/integration/params-registry.test.ts` 校验双射、唯一、格式。
- `PARAMS` 当前只登记已代码化的参数；未代码化参数仍以 §5 为权威，不得在业务代码里写裸值。

## 3. 类型与状态

| type | 含义 | 约束 |
|------|------|------|
| numeric | 纯数值 + 单位 | 可参与 constraint 线性求值 |
| conditional | 复合验收/多级评分/频率 | constraint 必须为空 |
| placeholder | TODO / 草稿 / 预留 | 晋升时补值和类型 |

## 4. 变更流程

1. 修改需求文档 §5 与 `src/config/params.ts` 同步。
2. 跑 `npm run build` + `npm run test:all` + `doc-lint`。
3. 涉及 §5/§6 时登记 E-NN 与 `bench:B-<yyyymmdd>-NN`。
4. PARAM 名称涉及术语变更时完成 tombstone / 附录 E / 附录 A 三件套。

## 5. 快照

版本收口时导出 `PARAM 注册表快照`：P-NN、名称、当前值、状态、constraint、定稿证据
（bench ID + 附录 C 证据 ID）。快照是交付期文档 #6，不替代 §5 权威表。
