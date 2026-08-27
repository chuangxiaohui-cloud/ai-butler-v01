import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { checkEvidenceReadiness, classifyPredicate } from './answer-readiness.js';

test('answer-readiness: predicate 四分类覆盖跨领域疑问词', () => {
  assert.equal(classifyPredicate('中国AI公司中市值较高的是哪几家？'), 'numeric');
  assert.equal(classifyPredicate('STM32F103C8T6 最大主频是多少'), 'numeric');
  assert.equal(classifyPredicate('现在空间站里有几位航天员？'), 'temporal');
  assert.equal(classifyPredicate('这个补丁什么时候上线？'), 'temporal');
  assert.equal(classifyPredicate('如何部署 Kubernetes 集群？'), 'procedural');
  assert.equal(classifyPredicate('怎么配置 I2C 时序？'), 'procedural');
  assert.equal(classifyPredicate('这个方案的优缺点如何？'), 'opinion');
  assert.equal(classifyPredicate('介绍一下这家公司的产品线'), 'other');
});

test('answer-readiness: 数值型 query 证据缺数值时标记缺口', () => {
  const r = checkEvidenceReadiness('中国AI公司中市值较高的是哪几家？', [
    'AI 公司生态图谱与业务介绍',
    '从技术路线看行业发展',
  ]);
  assert.equal(r.kind, 'numeric');
  assert.equal(r.ready, false);
  assert.equal(r.gap, '具体数值/数量信息');
});

test('answer-readiness: 数值型 query 证据含数值时通过', () => {
  const r = checkEvidenceReadiness('中国AI公司中市值较高的是哪几家？', [
    'A 公司市值 5000 亿元，B 公司市值 1200 亿元',
  ]);
  assert.equal(r.ready, true);
  assert.equal(r.gap, undefined);
});

test('answer-readiness: 时序型 query 缺日期标记缺口', () => {
  const r = checkEvidenceReadiness('现在空间站里有几位航天员？', ['空间站乘组介绍（无日期）']);
  assert.equal(r.kind, 'temporal');
  assert.equal(r.ready, false);
  assert.equal(r.gap, '时间信息（日期/时点）');
});

test('answer-readiness: 时序型 query 证据含日期通过', () => {
  const r = checkEvidenceReadiness('现在空间站里有几位航天员？', ['2026-08-20 在轨乘组名单公布']);
  assert.equal(r.ready, true);
});

test('answer-readiness: 操作型 query 缺步骤标记缺口', () => {
  const r = checkEvidenceReadiness('如何部署 Kubernetes 集群？', ['K8s 整体架构说明与设计理念']);
  assert.equal(r.kind, 'procedural');
  assert.equal(r.ready, false);
  assert.equal(r.gap, '操作步骤/流程信息');
});

test('answer-readiness: 操作型 query 证据含步骤通过', () => {
  const r = checkEvidenceReadiness('如何部署 Kubernetes 集群？', ['第一步 安装依赖', '第二步 初始化集群']);
  assert.equal(r.ready, true);
});

test('answer-readiness: 观点型 query 缺引述标记缺口', () => {
  const r = checkEvidenceReadiness('这个方案的优缺点如何？', ['方案背景资料与功能列表']);
  assert.equal(r.kind, 'opinion');
  assert.equal(r.ready, false);
  assert.equal(r.gap, '观点/评价类表述');
});

test('answer-readiness: 观点型 query 证据含引述通过', () => {
  const r = checkEvidenceReadiness('这个方案的优缺点如何？', ['业内专家指出该方案成本偏高']);
  assert.equal(r.ready, true);
});

test('answer-readiness: 其他类型恒 ready 不 gate', () => {
  const r = checkEvidenceReadiness('介绍一下这家公司的产品线', ['没有任何数字 也没有日期']);
  assert.equal(r.kind, 'other');
  assert.equal(r.ready, true);
});
