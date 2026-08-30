import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  validateIntentFeature,
  extractIntentFeatureRuleBased,
} from './intent-feature.js';
import { routeFromFeatures, routeV2, shouldOptionClarifyByGap } from './router-v2.js';
import { PARAMS } from '../config/params.js';

test('router-v2: 完整 App 前端 → PM plan 直接路由', () => {
  const r = routeV2('帮我做一个完整的 App 前端');
  assert.equal(r.features.actionType, 'create');
  assert.equal(r.features.targetDomain, 'code');
  assert.equal(r.features.scope, 'project_level');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.primaryLens, 'project_manager');
    assert.equal(r.decision.selected.intent, 'plan');
    assert.ok(Math.abs(r.decision.selected.confidence - 0.85) < 1e-6);
  }
});

test('router-v2: PRD → product_manager write_doc 且关闭搜索', () => {
  const r = routeV2('帮我写一份 PRD');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.primaryLens, 'product_manager');
    assert.equal(r.decision.selected.intent, 'write_doc');
    assert.equal(r.decision.selected.searchNeed, false);
    assert.ok(Math.abs(r.decision.selected.confidence - 0.75) < 1e-6);
  }
});

test('router-v2: 登录接口 → architect execute', () => {
  const r = routeV2('帮我写代码实现一个登录接口');
  assert.equal(r.features.scope, 'atomic');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'execute');
    assert.ok(Math.abs(r.decision.selected.confidence - 0.8) < 1e-6);
  }
});

test('router-v2: 查日程 → secretary local_query + calendar skill', () => {
  const r = routeV2('查一下我今天的日程');
  assert.equal(r.features.targetDomain, 'schedule');
  assert.equal(r.features.searchSourceHint, 'local_skill');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'local_query');
    assert.equal(r.decision.selected.skill, 'calendar_skill');
    assert.ok(Math.abs(r.decision.selected.confidence - 0.85) < 1e-6);
  }
});

test('router-v2: 导出日历/日程 → secretary local_query + calendar skill', () => {
  for (const q of ['导出我的日历', '把日程导出成ics文件', '保存我的日历到文件']) {
    const r = routeV2(q);
    assert.equal(r.features.actionType, 'query');
    assert.equal(r.features.targetDomain, 'schedule');
    assert.equal(r.features.searchSourceHint, 'local_skill');
    assert.equal(r.decision.type, 'direct');
    if (r.decision.type === 'direct') {
      assert.equal(r.decision.selected.intent, 'local_query');
      assert.equal(r.decision.selected.skill, 'calendar_skill');
      assert.ok(Math.abs(r.decision.selected.confidence - 0.85) < 1e-6);
    }
  }
});

test('router-v2: 发消息 → secretary send_message + im skill', () => {
  const r = routeV2('发消息给老张');
  assert.equal(r.features.actionType, 'send');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'send_message');
    assert.equal(r.decision.selected.skill, 'im_dispatch');
    assert.ok(Math.abs(r.decision.selected.confidence - 0.8) < 1e-6);
  }
});

test('router-v2: 方案成本 → 选项式消歧而非硬猜', () => {
  const r = routeV2('这个方案成本多少，值不值');
  assert.ok(r.features.ambiguityFlags.includes('missing_referent'));
  assert.ok(Math.abs(r.confidence - 0.4) < 1e-6);
  assert.equal(r.decision.type, 'option_clarify');
  if (r.decision.type === 'option_clarify') {
    assert.ok(r.decision.question.includes('老板'));
    assert.ok(r.decision.options.length >= 2);
  }
});

test('router-v2: IntentFeature 校验拒绝非法枚举', () => {
  assert.throws(() =>
    validateIntentFeature({ actionType: 'bad', targetDomain: 'code' }),
  );
});

test('router-v2: 规则特征提取可离线运行', () => {
  const f = extractIntentFeatureRuleBased('发消息给老张');
  assert.equal(f.actionType, 'send');
  assert.equal(f.targetDomain, 'message');
  assert.equal(f.searchSourceHint, 'local_skill');
});

test('router-v2: PCB 安全审查提取为 analyze/security 且不触发搜索', () => {
  const f = extractIntentFeatureRuleBased('帮我检查一下这个PCB的安全性');
  assert.equal(f.actionType, 'analyze');
  assert.equal(f.targetDomain, 'security');
  assert.equal(f.searchSourceHint, 'none');
  assert.equal(f.requiresExternalSearch, false);
});

test('router-v2: 会议安排提取为 schedule + timeExpression', () => {
  const f = extractIntentFeatureRuleBased('帮我安排明天上午十点的会议');
  assert.equal(f.actionType, 'schedule');
  assert.equal(f.targetDomain, 'schedule');
  assert.equal(f.hasTimeExpression, true);
  assert.ok(f.timeExpression?.includes('明天'));
});

test('router-v2: 报价对比提取为 compare + vendor_db', () => {
  const f = extractIntentFeatureRuleBased('帮我做一次供应商报价对比');
  assert.equal(f.actionType, 'compare');
  assert.equal(f.targetDomain, 'finance');
  assert.equal(f.searchSourceHint, 'vendor_db');
});

test('router-v2: 芯片行情 → search/web_search 直接路由', () => {
  const r = routeV2('查一下STM32F103C8T6的行情');
  assert.equal(r.features.targetDomain, 'search');
  assert.equal(r.features.searchSourceHint, 'web_search');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'web_search');
  }
});

test('router-v2: 常识问答 → secretary/web_search 不再兜底澄清', () => {
  for (const query of ['什么是状态机？', 'Python是什么语言', '嵌入式里的定时器是什么？']) {
    const r = routeV2(query);
    assert.notEqual(r.decision.type, 'must_clarify');
    assert.equal(r.candidates[0].primaryLens, 'secretary');
    assert.equal(r.candidates[0].intent, 'web_search');
    assert.equal(r.candidates[0].searchNeed, true);
  }
});

test('router-v2: 度量型问句（版本号）→ qa 直答且候选去重', () => {
  const r = routeV2('openclaw最新版本号是多少');
  assert.equal(r.features.actionType, 'qa');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.primaryLens, 'secretary');
    assert.equal(r.decision.selected.intent, 'web_search');
    assert.equal(r.decision.selected.searchNeed, true);
  }
  const seen = new Set(r.candidates.map((c) => c.intent));
  assert.equal(seen.size, r.candidates.length, '同目标候选合并后无重复');
});

test('router-v2: 度量型问句全集 → qa/web_search 直答', () => {
  const queries = [
    'STM32F103C8T6 最大主频是多少',
    '这个开发板多少钱',
    '这款示波器什么价位',
    'STM32最小系统多大面积',
    '这颗芯片有几位ADC',
    'TPS5430的输入电压范围是多少',
    '北京大学今年本科线是多少',
    '七号电池电压是多少',
  ];
  for (const q of queries) {
    const r = routeV2(q);
    assert.equal(r.features.actionType, 'qa', q);
    assert.equal(r.decision.type, 'direct', q);
    if (r.decision.type === 'direct') {
      assert.equal(r.decision.selected.intent, 'web_search', q);
    }
  }
});

test('router-v2: 度量型问句不抢业务评估路由（E194 豁免）', () => {
  const r = routeV2('这个方案成本多少，值不值');
  assert.equal(r.features.actionType, 'analyze');
  assert.ok(r.features.ambiguityFlags.includes('missing_referent'));
  assert.equal(r.decision.type, 'option_clarify');
  const r2 = routeV2('帮我评估这个方案的收益');
  assert.equal(r2.features.actionType, 'analyze');
  const r3 = routeV2('如何评估风险');
  assert.equal(r3.features.actionType, 'qa');
  assert.equal(r3.decision.type, 'direct');
});

test('router-v2: 蛇咬 → emergency 紧急路由', () => {
  const r = routeV2('在野外被不知名的蛇咬了，怎么办');
  assert.equal(r.features.actionType, 'emergency');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'emergency');
    assert.equal(r.decision.selected.searchNeed, false);
  }
});

test('router-v2: GitHub 链接 + 用途问答 → github_analysis（E242 改判，v2.5 §6.1.2 API 优先）', () => {
  const r = routeV2('https://github.com/PaddlePaddle/PaddleOCR这个项目是做什么用的');
  assert.equal(r.features.actionType, 'analyze');
  assert.equal(r.features.hasGithubLink, true);
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'github_analysis');
    assert.equal(r.decision.selected.skill, 'github-reader');
  } else {
    assert.fail('GitHub 链接 + 用途问答应直接路由到 github_analysis');
  }
});
test('router-v2: 是什么 + 写个例子 → qa 而非 create 澄清', () => {
  const r = routeV2('函数指针是什么，给我写个简单的代码例子');
  assert.equal(r.features.actionType, 'qa');
  assert.equal(r.candidates[0].intent, 'web_search');
  assert.notEqual(r.decision.type, 'option_clarify');
});

test('router-v2: PCB 安全审查 → owner/risk_review 且关闭搜索', () => {
  const r = routeV2('帮我检查一下这个PCB的安全性');
  assert.equal(r.features.actionType, 'analyze');
  assert.equal(r.features.targetDomain, 'security');
  assert.ok(r.candidates.length >= 1);
  assert.equal(r.candidates[0].primaryLens, 'owner');
  assert.equal(r.candidates[0].intent, 'risk_review');
  assert.equal(r.candidates[0].searchNeed, false);
  // B1：top 与 second 分差 ≥ P-82 时不再消歧，直接 confirm（P-82 分差门槛恢复生效）
  assert.equal(r.decision.type, 'confirm');
  if (r.decision.type === 'confirm') {
    assert.equal(r.decision.selected.intent, 'risk_review');
  }
});

test('router-v2: B1 消歧分差门槛（P-82）', () => {
  const gap = PARAMS.routeCandidateGap;
  // 无第二候选：永不该消歧
  assert.equal(shouldOptionClarifyByGap(0.6, undefined), false);
  // 窄分差（gap < P-82）：进入选项式消歧
  assert.equal(shouldOptionClarifyByGap(0.4, 0.4 - gap + 0.02), true);
  // 宽分差（gap ≥ P-82）：直接 confirm
  assert.equal(shouldOptionClarifyByGap(0.7, 0.7 - gap - 0.02), false);
  // 恰好等于 P-82：受 1e-9 容差保护，不算窄分差
  assert.equal(shouldOptionClarifyByGap(0.7, 0.7 - gap), false);
});

test('router-v2: 窄分差仍选项式消歧（B1 不误伤原行为）', () => {
  const r = routeV2('这个方案成本多少，值不值');
  assert.equal(r.decision.type, 'option_clarify');
  assert.ok(Math.abs(r.candidates[0].confidence - r.candidates[1].confidence) < PARAMS.routeCandidateGap);
});

test('router-v2: 会议安排 → secretary/create_calendar 且带时间门控', () => {
  const r = routeV2('帮我安排明天上午十点的会议');
  assert.equal(r.features.actionType, 'schedule');
  assert.equal(r.features.hasTimeExpression, true);
  assert.ok(r.candidates.length >= 1);
  assert.equal(r.candidates[0].primaryLens, 'secretary');
  assert.equal(r.candidates[0].intent, 'create_calendar');
  assert.equal(r.candidates[0].searchNeed, false);
});

test('router-v2: 报价对比 → owner/compare_vendor_quotes 且关闭搜索', () => {
  const r = routeV2('帮我做一次供应商报价对比');
  assert.equal(r.features.actionType, 'compare');
  assert.equal(r.features.targetDomain, 'finance');
  assert.equal(r.features.searchSourceHint, 'vendor_db');
  assert.ok(r.candidates.length >= 1);
  assert.equal(r.candidates[0].primaryLens, 'owner');
  assert.equal(r.candidates[0].intent, 'compare_vendor_quotes');
  assert.equal(r.candidates[0].searchNeed, false);
});

test('router-v2: 附件信号进入 IntentFeature', () => {
  const f = extractIntentFeatureRuleBased('这个图是什么', [
    { type: 'image', mimeType: 'image/png', sizeBytes: 8, fileName: 'shot.png' },
  ]);
  assert.equal(f.hasImage, true);
  assert.equal(f.hasDocument, false);
  assert.deepEqual(f.attachmentTypes, ['image/png']);
});

test('router-v2: 文化梗路由到 secretary/cultural_reference', () => {
  const r = routeV2('小鸡啄米图是什么梗');
  assert.equal(r.features.actionType, 'cultural_reference');
  const selected =
    r.decision.type === 'direct' || r.decision.type === 'confirm'
      ? r.decision.selected
      : null;
  assert.ok(selected);
  assert.equal(selected.primaryLens, 'secretary');
  assert.equal(selected.intent, 'cultural_reference');
  assert.equal(selected.postProcess, 'cultural_reply');
});

test('router-v2: 工作记忆参与选项式消歧', () => {
  const features = extractIntentFeatureRuleBased('这个方案成本多少，值不值');
  const r = routeFromFeatures('这个方案成本多少，值不值', features, 'rule', [
    '之前讨论过 STM32 选型方案',
    '之前讨论过 App 前端方案',
  ]);
  assert.equal(r.decision.type, 'option_clarify');
  if (r.decision.type === 'option_clarify') {
    assert.ok(r.decision.options[0].label.includes('方案'));
    assert.ok(r.decision.options[0].label.includes('STM32'));
  }
});

test('router-v2: 图片颜色查询 → architect color_recognition 直接路由', () => {
  const f = extractIntentFeatureRuleBased('这张图有哪些颜色', [
    { type: 'image', mimeType: 'image/png', sizeBytes: 8, fileName: 'flags.png' },
  ]);
  const r = routeFromFeatures('这张图有哪些颜色', f, 'rule');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.primaryLens, 'architect');
    assert.equal(r.decision.selected.intent, 'color_recognition');
    assert.equal(r.decision.selected.executor, 'color_recognition');
    assert.ok(Math.abs(r.decision.selected.confidence - 0.85) < 1e-6);
  }
});

test('router-v2: 图片通用问题 → secretary image_analysis 确认执行', () => {
  const f = extractIntentFeatureRuleBased('这个图是什么', [
    { type: 'image', mimeType: 'image/png', sizeBytes: 8, fileName: 'shot.png' },
  ]);
  const r = routeFromFeatures('这个图是什么', f, 'rule');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.primaryLens, 'secretary');
    assert.equal(r.decision.selected.intent, 'image_analysis');
    assert.equal(r.decision.selected.executor, 'image_analysis');
    assert.ok(Math.abs(r.decision.selected.confidence - 0.75) < 1e-6);
  }
});

test('router-v2: 文档总结 → secretary document_qa', () => {
  const f = extractIntentFeatureRuleBased('总结这个文档的要点', [
    { type: 'document', mimeType: 'text/markdown', sizeBytes: 80, fileName: 'doc.md' },
  ]);
  const r = routeFromFeatures('总结这个文档的要点', f, 'rule');
  assert.equal(r.decision.type, 'confirm');
  if (r.decision.type === 'confirm') {
    assert.equal(r.decision.selected.primaryLens, 'secretary');
    assert.equal(r.decision.selected.intent, 'document_summary');
    assert.equal(r.decision.selected.executor, 'document_qa');
  }
});

test('router-v2: 文档结构提取 → architect document_qa', () => {
  const f = extractIntentFeatureRuleBased('提取这个文档的结构', [
    { type: 'document', mimeType: 'text/markdown', sizeBytes: 80, fileName: 'doc.md' },
  ]);
  const r = routeFromFeatures('提取这个文档的结构', f, 'rule');
  assert.equal(r.decision.type, 'confirm');
  if (r.decision.type === 'confirm') {
    assert.equal(r.decision.selected.primaryLens, 'architect');
    assert.equal(r.decision.selected.intent, 'document_structure');
    assert.equal(r.decision.selected.executor, 'document_qa');
  }
});

test('router-v2: PDF 原理图生成 BOM → schematic-bom', () => {
  const f = extractIntentFeatureRuleBased('帮我把这个PDF的原理图生成BOM表', [
    { type: 'document', mimeType: 'application/pdf', sizeBytes: 80, fileName: 'schematic.pdf' },
  ]);
  const r = routeFromFeatures('帮我把这个PDF的原理图生成BOM表', f, 'rule');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'generate_bom');
    assert.equal(r.decision.selected.executor, 'schematic_bom');
    assert.equal(r.decision.selected.searchNeed, false);
  }
});

test('router-v2: 考勤表模板 → office-daily', () => {
  const r = routeV2('帮我做一个考勤表模板');
  assert.equal(r.features.actionType, 'office_daily');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'office_daily');
    assert.equal(r.decision.selected.executor, 'office_daily');
    assert.equal(r.decision.selected.searchNeed, false);
  }
});

test('router-v2: 导入日历文件 → calendar_skill local_query', () => {
  const r = routeV2('导入这个日历文件');
  assert.equal(r.features.actionType, 'query');
  assert.equal(r.features.targetDomain, 'schedule');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'local_query');
    assert.equal(r.decision.selected.skill, 'calendar_skill');
    assert.equal(r.decision.selected.searchNeed, false);
  }
});

test('router-v2: 导入路径 .ics → calendar_skill local_query', () => {
  const r = routeV2('导入 C:\\Users\\me\\events.ics');
  assert.equal(r.features.actionType, 'query');
  assert.equal(r.features.targetDomain, 'schedule');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.skill, 'calendar_skill');
  }
});

test('router-v2: 发送邮件 → office-daily（不再偏到 im_dispatch）', () => {
  const r = routeV2('发送邮件给 boss@example.com，主题：周报，正文：见附件');
  assert.equal(r.features.actionType, 'office_daily');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'office_daily');
    assert.equal(r.decision.selected.executor, 'office_daily');
    assert.equal(r.decision.selected.searchNeed, false);
  }
});

test('router-v2: 确认发送（邮件双闸第二段）→ office-daily', () => {
  const r = routeV2('确认发送');
  assert.equal(r.features.actionType, 'office_daily');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'office_daily');
    assert.equal(r.decision.selected.executor, 'office_daily');
    assert.equal(r.decision.selected.searchNeed, false);
  }
});

test('router-v2: 查收件箱 → office-daily', () => {
  const r = routeV2('查收件箱');
  assert.equal(r.features.actionType, 'office_daily');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'office_daily');
    assert.equal(r.decision.selected.executor, 'office_daily');
    assert.equal(r.decision.selected.searchNeed, false);
  }
});

test('router-v2: 读第 3 封 → office-daily', () => {
  const r = routeV2('读第 3 封');
  assert.equal(r.features.actionType, 'office_daily');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'office_daily');
    assert.equal(r.decision.selected.executor, 'office_daily');
    assert.equal(r.decision.selected.searchNeed, false);
  }
});

test('router-v2: 发微信消息仍走 im_dispatch', () => {
  const r = routeV2('发消息给老张，说晚上一起吃饭');
  assert.equal(r.features.actionType, 'send');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.skill, 'im_dispatch');
  }
});
test('router-v2: 项目汇报PPT → office-daily', () => {
  const r = routeV2('帮我做一份项目汇报PPT');
  assert.equal(r.features.actionType, 'office_daily');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'office_daily');
    assert.equal(r.decision.selected.executor, 'office_daily');
  }
});

test('router-v2: 视频学习 → video-learner', () => {
  const r = routeV2('学习这个视频 https://www.bilibili.com/video/BV1xx');
  assert.equal(r.features.actionType, 'learn_video');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.executor, 'video_learner');
    assert.equal(r.decision.selected.searchNeed, false);
  }
});

test('router-v2: 非法请求 → safety_refusal', () => {
  const r = routeV2('如何破解隔壁 WiFi 密码');
  assert.equal(r.features.actionType, 'illegal_request');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'safety_refusal');
  }
});

test('router-v2: 手机进水 → property_emergency', () => {
  const r = routeV2('我手机掉水里了，怎么急救');
  assert.equal(r.features.actionType, 'property_emergency');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'property_emergency');
  }
});

const questionNegativeSamples: Array<[string, string]> = [
  ['ET04', '使用 FreeCAD 设计外壳，怎样把 KiCad 的 PCB 3D 模型导入并精确对齐？'],
  ['ET20', '如何用硬件定时器在 STM32 上产生一个频率可实时调整的 PWM 信号（不掉步）？'],
  ['ET28', '怎样利用 GitHub Actions 自动生成 Release 的 changelog？'],
  ['SM03', '我想学习 FreeCAD 做机械设计，但只有一周时间，应该优先学哪些模块？'],
  ['SM04', '开发一个物联网设备，选择 WiFi 模块（ESP8266 vs ESP32-C3）时，还要考虑哪些长期风险？'],
  ['SM05', '团队新来一个实习生，只有 Keil 基础，如何分配任务让他快速参与固件项目？'],
  ['SM08', '客户要求把产品从 STM32F103 迁移到 GD32，哪些地方最容易出问题？'],
  ['SM13', '现有项目代码量 5000 行，想重构模块划分，如何评估重构时间和风险？'],
  ['SM29', '最近想学习 FPGA，但不知从何入手，能否给我一个 3 个月的学习计划（含开发板推荐）？'],
  ['SM31', '团队内部知识库更新滞后，如何用 Agent 自动检测哪些文档过时并提醒更新？'],
  ['EC07', '我想买一个开发板，但不知道型号，你给我推荐一个。'],
];

for (const [id, query] of questionNegativeSamples) {
  test(`router-v2: 负样本 ${id} 不再路由到执行型意图`, () => {
    const r = routeV2(query);
    assert.equal(r.features.actionType, 'qa');
    assert.equal(r.decision.type, 'direct');
    if (r.decision.type === 'direct') {
      assert.equal(r.decision.selected.intent, 'web_search');
    }
  });
}

const routeRegressionSamples: Array<[string, string]> = [
  [
    'BUG-008',
    '项目中使用的芯片有停产风险，怎么提前规划替代型号并评估改动工作量？',
  ],
  ['BUG-015', '去火星的飞船方案给我一个。'],
  ['BUG-016', '我需要一个能抗 500V 的 DC-DC 电源方案，但没有任何负载要求。'],
  ['BUG-020', '那个谁，上次推荐的那个电源芯片叫啥来着？'],
  ['BUG-023', '对比一下 KiCad和AD，然后帮我用KiCad新建一个STM32的工程。'],
];

for (const [bugId, query] of routeRegressionSamples) {
  test(`router-v2: 回归 ${bugId} 不再路由到执行型意图`, () => {
    const r = routeV2(query);
    assert.notEqual(r.features.actionType, 'create');
    assert.notEqual(r.features.actionType, 'schedule');
    assert.ok(r.decision.type === 'direct' || r.decision.type === 'confirm');
    if (r.decision.type === 'direct' || r.decision.type === 'confirm') {
      assert.equal(r.decision.selected.intent, 'web_search');
    }
  });
}

test('router-v2: 润色重写 → rewrite 而非发消息', () => {
  const r = routeV2('把刚才那段话，用更专业的语气重写一遍，我要发给客户。');
  assert.equal(r.features.actionType, 'rewrite');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'rewrite');
  }
});

test('router-v2: 项目打包 → pack_project', () => {
  const r = routeV2('把这个项目打包发给我。');
  assert.equal(r.features.actionType, 'pack');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'pack_project');
  }
});

test('router-v2: GitHub 链接分析 → github_analysis skill', () => {
  const r = routeV2('帮我分析一下这个GitHub项目：https://github.com/zephyrproject-rtos/zephyr');
  assert.equal(r.features.hasGithubLink, true);
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'github_analysis');
    assert.equal(r.decision.selected.skill, 'github-reader');
  }
});

test('router-v2: GitHub 链接 + 项目问句（做什么用/值不值）→ github_analysis skill（E242）', () => {
  const r1 = routeV2('https://github.com/andrewyng/openworker 这项目是做什么用的？');
  assert.equal(r1.features.actionType, 'analyze');
  assert.equal(r1.features.hasGithubLink, true);
  if (r1.decision.type === 'direct') {
    assert.equal(r1.decision.selected.intent, 'github_analysis');
    assert.equal(r1.decision.selected.skill, 'github-reader');
  } else {
    assert.fail('应直接路由到 github_analysis');
  }
  const r2 = routeV2('https://github.com/andrewyng/openworker 这个项目值不值得用？');
  if (r2.decision.type === 'direct') {
    assert.equal(r2.decision.selected.intent, 'github_analysis');
  } else {
    assert.fail('值不值得用应直接路由到 github_analysis');
  }
  // 非 github.com 的项目问句不受影响，仍走 web_search
  const r3 = routeV2('https://example.com/foo 这个项目是做什么用的？');
  if (r3.decision.type === 'direct') {
    assert.equal(r3.decision.selected.intent, 'web_search');
  } else {
    assert.fail('非 github 链接应走 web_search');
  }
});
test('router-v2: 芯片对比 → web_search 而非澄清', () => {
  const r = routeV2('对比 ESP32-S3 和 RP2040 在音频 I2S 应用上的功耗和 PSRAM 性能差异？');
  assert.equal(r.features.actionType, 'compare');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'web_search');
  }
});

test('router-v2: EDA 工具对比 → web_search 而非 vendor 报价', () => {
  const r = routeV2('对比使用 KiCad 和 Altium Designer 做一个 4 层板的时间成本（学习+设计）差异？');
  assert.equal(r.features.actionType, 'compare');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'web_search');
  }
});

test('router-v2: 明确单文件代码 → execute 直接执行', () => {
  const r = routeV2('帮我写一个I2C的软件模拟驱动。');
  assert.equal(r.features.actionType, 'create');
  assert.equal(r.features.scope, 'atomic');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'execute');
  }
});

test('router-v2: 帮我写个 PID 算法 → execute 直接执行', () => {
  const r = routeV2('帮我写个 PID 算法。');
  assert.equal(r.features.actionType, 'create');
  assert.equal(r.features.targetDomain, 'code');
  assert.equal(r.features.scope, 'atomic');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'execute');
  }
});

test('router-v2: 缺功能信息写代码 → 澄清功能/语言', () => {
  const r = routeV2('帮我写一段代码，但我现在不方便说功能，你先写个通用的。');
  assert.equal(r.decision.type, 'must_clarify');
  if (r.decision.type === 'must_clarify') {
    assert.ok(r.decision.question.includes('功能'));
  }
});

test('router-v2: Protel 还能用吗 → qa/web_search', () => {
  const r = routeV2('Protel 还能用吗？我想画个板子。');
  assert.equal(r.features.actionType, 'qa');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'web_search');
  }
});

test('router-v2: 选技术栈 → qa/web_search', () => {
  const r = routeV2('我想开发一个 App，但不知道用什么技术栈，你帮我选一个最通用的。');
  assert.equal(r.features.actionType, 'qa');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'web_search');
  }
});

test('router-v2: 无参考设计画原理图 → 澄清', () => {
  const r = routeV2('帮我在 KiCad 里画一个复杂 FPGA 原理图，但我不提供任何参考设计。');
  assert.equal(r.decision.type, 'must_clarify');
});

test('router-v2: 综述字数不限 → 澄清范围/格式', () => {
  const r = routeV2('帮我写一篇关于嵌入式发展的综述文章，字数不限。');
  assert.equal(r.decision.type, 'must_clarify');
});

test('router-v2: 修正指令 → modify/execute 而非排期选项', () => {
  const r = routeV2('不对，我要的是位置式 PID，而且积分限幅要 100。');
  assert.equal(r.features.actionType, 'modify');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'execute');
  }
});

test('router-v2: 你现在是什么模型 → secretary self_identity 不搜索（E264）', () => {
  const r = routeV2('你现在是什么模型？');
  assert.equal(r.features.actionType, 'self_identity');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'self_identity');
    assert.equal(r.decision.selected.searchNeed, false);
  }
});

test('router-v2: 陪伴聊天 → secretary/companion_chat 不搜索', () => {
  const r = routeV2('今天心情不好，陪我聊聊天。');
  assert.equal(r.features.actionType, 'chat');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'companion_chat');
    assert.equal(r.decision.selected.searchNeed, false);
  }
});

test('router-v2: 按你说的加工程 → project_manager/apply_to_project', () => {
  const r = routeV2('行，按你说的在我的工程里加上。');
  assert.equal(r.features.actionType, 'apply_to_project');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'apply_to_project');
    assert.equal(r.decision.selected.searchNeed, false);
  }
});

test('router-v2: 直接写入盘符路径 → project_writer', () => {
  const r = routeV2('写入 M:\\projects\\demo\\main.c，内容：int main(void){return 0;}');
  assert.equal(r.features.actionType, 'apply_to_project');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.executor, 'project_writer');
  }
});


test('router-v2: 深度报告意图 → project_manager deep_report 且开搜索', () => {
  const r = routeV2('写一份 STM32 的调研报告');
  assert.equal(r.features.actionType, 'deep_report');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'deep_report');
    assert.equal(r.decision.selected.searchNeed, true);
    assert.equal(r.decision.selected.primaryLens, 'project_manager');
  }
});


