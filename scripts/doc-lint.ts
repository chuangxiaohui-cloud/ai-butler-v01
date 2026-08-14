#!/usr/bin/env node
/**
 * doc-lint.ts — 文档宪法执法脚本（§0.6 七检查 + §0.7 迁移期）
 *
 * 用法:
 *   node doc-lint.ts [--migration] [--doc <path>]
 *
 * 默认文档路径: ../一人公司AI-Agent需求文档_v2.5.md
 * --migration: 迁移期模式（diff 作用域语义，见 §0.7）
 *
 * 七检查:
 *   C1 数值扫描（三层白名单 + FAIL 模式）
 *   C2 废弃格式（双轨格式校验）
 *   C3 行数预算（按标题统计非空行）
 *   C4 引用解析（[P-NN] 可解析 + constraint 求值 + 接口契约恰好 1 次 + 引用禁带值）
 *   C5 bench 联动（附录A触及§6/§5必含bench ID）
 *   C6 共变（git diff 触及§6/§5而附录A未变）
 *   C7 provisional 超期（>28天 fail）
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// ============================================================================
// 类型定义
// ============================================================================

type CheckResult = {
  check: string;
  level: 'FAIL' | 'WARN' | 'PASS' | 'INFO';
  message: string;
  line?: number;
  detail?: string;
};

type ParamEntry = {
  id: string;
  name: string;
  value: string;
  type: 'numeric' | 'conditional' | 'placeholder';
  status: string;
  constraint: string;
  numericValue?: number;
  unit?: string;
};

type SectionInfo = {
  number: string;
  title: string;
  startLine: number;
  endLine: number;
  nonEmptyLines: number;
};

// ============================================================================
// 配置
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DOC_PATH = process.argv.includes('--doc')
  ? process.argv[process.argv.indexOf('--doc') + 1]
  : path.join(__dirname, '..', '一人公司AI-Agent需求文档_v2.5.md');

const MIGRATION_MODE = process.argv.includes('--migration');

// 行数预算（§0.5）
const LINE_BUDGETS: Record<string, number> = {
  '§0': 100, '§1': 150, '§2': 150, '§3': 150, '§4': 350, '§5': 150,
  '§6': 600, '§7': 200, '§8': 250, '§9': 150, '§10': 250,
  '§11': 150, '§12': 150, '§13': 100,
};
const TOTAL_BODY_LIMIT = 1800;
const TOTAL_APPENDIX_LIMIT = 950;
const MIGRATION_MULTIPLIER = 1.2;

// 豁免区
const EXEMPT_SECTIONS = ['§0', '§5', '附录C', '附录 C'];

// token 白名单正则
const TOKEN_WHITELIST = [
  /v\d+(\.\d+)*[a-z]?/g,           // 版本号
  /\d{4}-\d{2}-\d{2}/g,             // 日期
  /§\d+(\.\d+)*/g,                  // 章节号
  /\[P-\d+\]/g,                     // PARAM 引用
  /第\d+行/g,                        // 行号
  /[0-9a-f]{7,}/g,                  // hash
];

// FAIL 模式
const FAIL_PATTERNS = [
  { regex: /\d+(\.\d+)?(s|ms|秒|MB|GB|元|次)/g, name: '带单位数值' },
  { regex: /(?<![\d.])0\.\d+(?![\d])/g, name: '裸小数' },
  { regex: /\d+(\.\d+)?%(?!\d)/g, name: '百分比' },
];

// 接口契约锚点串
const INTERFACE_ANCHOR = 'answer(query) → { answer, confidence, evidence[], gate_triggered }';

// 迁移期基线模式：diff 为空时所有 FAIL 降级为 WARN
let BASELINE_MODE = false;

// ============================================================================
// 主函数
// ============================================================================

function main(): void {
  console.log('══════════════════════════════════════════════════');
  console.log('  doc-lint.ts — 文档宪法执法');
  console.log(`  文档: ${DOC_PATH}`);
  console.log(`  模式: ${MIGRATION_MODE ? '--migration (迁移期)' : '全量执法'}`);
  console.log('══════════════════════════════════════════════════\n');

  if (!fs.existsSync(DOC_PATH)) {
    console.error(`❌ 文档不存在: ${DOC_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(DOC_PATH, 'utf-8');
  const lines = content.split('\n');

  // 检测基线模式（diff 为空）
  if (MIGRATION_MODE) {
    try {
      const diff = execSync(
        `git diff v2.4..HEAD -- "${path.basename(DOC_PATH)}"`,
        { cwd: path.dirname(DOC_PATH), encoding: 'utf-8', stdio: 'pipe' }
      );
      if (!diff.trim()) {
        BASELINE_MODE = true;
        console.log('  🟡 基线模式：diff 为空，所有 FAIL 降级为 WARN\n');
      }
    } catch {
      // 忽略 git diff 失败，继续常规迁移期模式
    }
  }

  const results: CheckResult[] = [];

  // 解析章节结构
  const sections = parseSections(lines);
  console.log(`📂 共 ${sections.length} 个章节\n`);

  // 解析 PARAM 注册表
  const params = parseParamRegistry(lines);
  console.log(`📋 共 ${params.length} 个 PARAM 注册项\n`);

  // C1: 数值扫描
  results.push(...checkC1(lines, sections));

  // C2: 废弃格式
  results.push(...checkC2(lines, sections));

  // C3: 行数预算
  results.push(...checkC3(sections));

  // C4: 引用解析
  results.push(...checkC4(lines, sections, params));

  // C5: bench 联动
  if (!MIGRATION_MODE) {
    results.push(...checkC5(lines, sections));
  } else {
    results.push({ check: 'C5', level: 'WARN', message: '迁移期跳过 bench 联动检查' });
  }

  // C6: 共变
  if (!MIGRATION_MODE) {
    results.push(...checkC6(lines, sections));
  } else {
    results.push({ check: 'C6', level: 'WARN', message: '迁移期跳过共变检查' });
  }

  // C7: provisional 超期
  results.push(...checkC7(lines));

  // 迁移期进度报告
  if (MIGRATION_MODE) {
    printMigrationProgress(lines, sections);
  }

  // 基线模式：FAIL 降级为 WARN
  if (BASELINE_MODE) {
    for (const r of results) {
      if (r.level === 'FAIL') {
        r.level = 'WARN';
        r.message = '[baseline] ' + r.message;
      }
    }
  }

  // 汇总
  printSummary(results);

  const hasFail = results.some(r => r.level === 'FAIL');
  process.exitCode = hasFail ? 1 : 0;
}

// ============================================================================
// 章节解析
// ============================================================================

function parseSections(lines: string[]): SectionInfo[] {
  const sections: SectionInfo[] = [];
  const sectionRegex = /^(#{1,3})\s+(§\S+|附录\s*[A-E])/;
  // v2.4 baseline 兼容：中文/阿拉伯数字标题；仅在文档无 § 章节时启用
  const hasModernSections = lines.some(l => sectionRegex.test(l));
  const fallbackRegex = !hasModernSections
    ? /^(#{1,3})\s+([\d一二三四五六七八九十]+([、.]\d+)*)\s*(.+)$/
    : null;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(sectionRegex);
    const fallback = fallbackRegex && lines[i].match(fallbackRegex);
    if (match) {
      sections.push({
        number: match[2].replace(/\s+/g, ' '),
        title: lines[i].replace(/^#{1,3}\s+/, ''),
        startLine: i + 1,
        endLine: lines.length,
        nonEmptyLines: 0,
      });
    } else if (fallback) {
      sections.push({
        number: fallback[2].replace(/[、.]/g, '.'),
        title: lines[i].replace(/^#{1,3}\s+/, ''),
        startLine: i + 1,
        endLine: lines.length,
        nonEmptyLines: 0,
      });
    }
  }

  // 设置 endLine 和 nonEmptyLines
  for (let i = 0; i < sections.length; i++) {
    sections[i].endLine = i + 1 < sections.length ? sections[i + 1].startLine - 1 : lines.length;
    let count = 0;
    for (let j = sections[i].startLine - 1; j < sections[i].endLine && j < lines.length; j++) {
      if (lines[j].trim().length > 0) count++;
    }
    sections[i].nonEmptyLines = count;
  }

  return sections;
}

function getSectionNumber(lineNum: number, sections: SectionInfo[]): string {
  for (const s of sections) {
    if (lineNum >= s.startLine && lineNum <= s.endLine) return s.number;
  }
  return '';
}

function isExemptSection(sectionNum: string): boolean {
  return EXEMPT_SECTIONS.some(e => sectionNum.startsWith(e) || sectionNum.includes(e));
}

function isInDetailsBlock(lineNum: number, lines: string[]): boolean {
  // 向上查找最近的 <details> 或 </details>
  let depth = 0;
  for (let i = lineNum - 1; i >= 0; i--) {
    if (lines[i].includes('</details>')) depth++;
    if (lines[i].includes('<details>')) {
      if (depth === 0) return true;
      depth--;
    }
  }
  return false;
}

function isInCodeFence(lineNum: number, lines: string[]): boolean {
  let fenceCount = 0;
  for (let i = 0; i < lineNum; i++) {
    if (lines[i].trim().startsWith('```')) fenceCount++;
  }
  return fenceCount % 2 === 1;
}

// ============================================================================
// PARAM 注册表解析
// ============================================================================

function parseParamRegistry(lines: string[]): ParamEntry[] {
  const params: ParamEntry[] = [];
  let inRegistry = false;
  const tableRowRegex = /^\|\s*(P-\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(numeric|conditional|placeholder)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|/;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('PARAM 注册表') || lines[i].includes('5.5')) {
      inRegistry = true;
    }
    if (inRegistry && lines[i].match(/^##\s/)) {
      inRegistry = false;
    }
    if (inRegistry) {
      const match = lines[i].match(tableRowRegex);
      if (match) {
        const entry: ParamEntry = {
          id: match[1],
          name: match[2].trim(),
          value: match[3].trim(),
          type: match[4] as 'numeric' | 'conditional' | 'placeholder',
          status: match[5].trim(),
          constraint: match[6].trim(),
        };
        // 提取数值
        if (entry.type === 'numeric') {
          const numMatch = entry.value.match(/(\d+(?:\.\d+)?)/);
          if (numMatch) entry.numericValue = parseFloat(numMatch[1]);
          const unitMatch = entry.value.match(/(s|ms|MB|GB|元|次|天|轮|%|条)/);
          if (unitMatch) entry.unit = unitMatch[1];
        }
        params.push(entry);
      }
    }
  }
  return params;
}

// ============================================================================
// C1: 数值扫描
// ============================================================================

function checkC1(lines: string[], sections: SectionInfo[]): CheckResult[] {
  const results: CheckResult[] = [];
  const issues: CheckResult[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const sectionNum = getSectionNumber(lineNum, sections);

    // 跳过豁免区
    if (isExemptSection(sectionNum)) continue;

    // 跳过 <details> 块内
    if (isInDetailsBlock(lineNum, lines)) continue;

    // 检查是否在代码围栏内
    const inFence = isInCodeFence(lineNum, lines);

    // 移除 token 白名单
    let cleaned = line;
    for (const wl of TOKEN_WHITELIST) {
      cleaned = cleaned.replace(wl, '');
    }

    // 检查 FAIL 模式
    for (const pattern of FAIL_PATTERNS) {
      pattern.regex.lastIndex = 0;
      const matches = cleaned.match(pattern.regex);
      if (matches) {
        for (const match of matches) {
          // 检查是否在 §5.5 注册表表格行内（numeric 行豁免）
          if (line.match(/^\|\s*P-\d+\s*\|/) && line.includes('numeric')) continue;

          const level = inFence ? 'WARN' : 'FAIL';
          issues.push({
            check: 'C1',
            level: level as 'FAIL' | 'WARN',
            message: `${pattern.name} "${match}" 在 ${sectionNum} 第 ${lineNum} 行`,
            line: lineNum,
            detail: inFence ? '代码围栏内降级为 WARN' : undefined,
          });
        }
      }
    }
  }

  if (issues.length === 0) {
    results.push({ check: 'C1', level: 'PASS', message: '数值扫描通过' });
  } else {
    const fails = issues.filter(i => i.level === 'FAIL');
    const warns = issues.filter(i => i.level === 'WARN');
    if (fails.length > 0) {
      results.push({ check: 'C1', level: 'FAIL', message: `${fails.length} 处违规数值` });
      fails.slice(0, 20).forEach(f => results.push(f));
      if (fails.length > 20) results.push({ check: 'C1', level: 'FAIL', message: `...还有 ${fails.length - 20} 处` });
    }
    if (warns.length > 0) {
      results.push({ check: 'C1', level: 'WARN', message: `${warns.length} 处代码围栏内数值（WARN）` });
    }
  }

  return results;
}

// ============================================================================
// C2: 废弃格式
// ============================================================================

function checkC2(lines: string[], sections: SectionInfo[]): CheckResult[] {
  const results: CheckResult[] = [];
  const issues: CheckResult[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sectionNum = getSectionNumber(i + 1, sections);

    // §0 豁免（定义格式规则，自然包含"废弃"字样）
    if (isExemptSection(sectionNum)) continue;

    // 检查裸"废弃"字样
    if (line.includes('废弃') && !line.includes('~~') && !line.includes('[废弃@') && !line.includes('已废弃')) {
      issues.push({
        check: 'C2',
        level: 'FAIL',
        message: `裸"废弃"字样在 ${sectionNum} 第 ${i + 1} 行`,
        line: i + 1,
      });
    }

    // 检查 <details> 块配对（跳过代码围栏内的格式说明）
    if (line.includes('<details>') && !isInCodeFence(i + 1, lines) && !lines.slice(i, Math.min(i + 50, lines.length)).some(l => l.includes('</details>'))) {
      issues.push({
        check: 'C2',
        level: 'FAIL',
        message: `<details> 块缺少配对 </details>，在 ${sectionNum} 第 ${i + 1} 行`,
        line: i + 1,
      });
    }
  }

  if (issues.length === 0) {
    results.push({ check: 'C2', level: 'PASS', message: '废弃格式检查通过' });
  } else {
    results.push({ check: 'C2', level: 'FAIL', message: `${issues.length} 处废弃格式违规` });
    issues.forEach(i => results.push(i));
  }

  return results;
}

// ============================================================================
// C3: 行数预算
// ============================================================================

function checkC3(sections: SectionInfo[]): CheckResult[] {
  const results: CheckResult[] = [];
  const issues: CheckResult[] = [];
  const multiplier = MIGRATION_MODE ? MIGRATION_MULTIPLIER : 1.0;

  let totalBody = 0;
  let totalAppendix = 0;

  // 无章节识别时，全部非空行计入正文（用于 v2.4 baseline）
  if (sections.length === 0) {
    totalBody = sections.reduce((sum, s) => sum + s.nonEmptyLines, 0) || lines.filter(l => l.trim().length > 0).length;
  }

  for (const s of sections) {
    const isAppendix = s.number.includes('附录');
    if (isAppendix) {
      totalAppendix += s.nonEmptyLines;
    } else {
      totalBody += s.nonEmptyLines;
    }

    // 查找预算
    for (const [key, budget] of Object.entries(LINE_BUDGETS)) {
      if (s.number.startsWith(key) || s.number === key) {
        const adjustedBudget = Math.floor(budget * multiplier);
        if (s.nonEmptyLines > adjustedBudget) {
          issues.push({
            check: 'C3',
            level: 'FAIL',
            message: `${s.number} 非空行 ${s.nonEmptyLines} > 预算 ${adjustedBudget}${MIGRATION_MODE ? ' (×1.2)' : ''}`,
          });
        }
        break;
      }
    }
  }

  const adjustedBodyLimit = Math.floor(TOTAL_BODY_LIMIT * multiplier);
  if (totalBody > adjustedBodyLimit) {
    issues.push({
      check: 'C3',
      level: 'FAIL',
      message: `正文总非空行 ${totalBody} > 预算 ${adjustedBodyLimit}${MIGRATION_MODE ? ' (×1.2)' : ''}`,
    });
  }

  if (totalAppendix > TOTAL_APPENDIX_LIMIT) {
    issues.push({
      check: 'C3',
      level: 'FAIL',
      message: `附录总非空行 ${totalAppendix} > 预算 ${TOTAL_APPENDIX_LIMIT}`,
    });
  }

  if (issues.length === 0) {
    results.push({ check: 'C3', level: 'PASS', message: `行数预算通过（正文 ${totalBody}/${adjustedBodyLimit}，附录 ${totalAppendix}/${TOTAL_APPENDIX_LIMIT}）` });
  } else {
    results.push({ check: 'C3', level: 'FAIL', message: `${issues.length} 处行数超限` });
    issues.forEach(i => results.push(i));
  }

  return results;
}

// ============================================================================
// C4: 引用解析
// ============================================================================

function checkC4(lines: string[], sections: SectionInfo[], params: ParamEntry[]): CheckResult[] {
  const results: CheckResult[] = [];
  const issues: CheckResult[] = [];

  const paramMap = new Map<string, ParamEntry>();
  params.forEach(p => paramMap.set(p.id, p));

  // 4a: [P-NN] 引用可解析
  const refRegex = /\[P-(\d+)\]/g;
  for (let i = 0; i < lines.length; i++) {
    let match;
    refRegex.lastIndex = 0;
    while ((match = refRegex.exec(lines[i])) !== null) {
      const id = `P-${match[1]}`;
      if (!paramMap.has(id)) {
        issues.push({
          check: 'C4',
          level: 'FAIL',
          message: `悬空引用 [${id}] 在第 ${i + 1} 行`,
          line: i + 1,
        });
      }
    }
  }

  // 4b: 引用携带数值副本
  const valueRefRegex = /\[[Pp]-(\d+)\s+\d+(\.\d+)?(%|s|ms|元|条)\]/g;
  for (let i = 0; i < lines.length; i++) {
    // 跳过 §5 注册表行和 §0 定义行
    const sectionNum = getSectionNumber(i + 1, sections);
    if (sectionNum.startsWith('§5') || isExemptSection(sectionNum)) continue;

    valueRefRegex.lastIndex = 0;
    if (valueRefRegex.test(lines[i])) {
      issues.push({
        check: 'C4',
        level: 'FAIL',
        message: `引用携带数值副本在第 ${i + 1} 行`,
        line: i + 1,
        detail: lines[i].trim().substring(0, 80),
      });
    }
  }

  // 4c: 接口契约恰好 1 次
  let anchorCount = 0;
  const anchorLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cleaned = lines[i].trim();
    if (cleaned === INTERFACE_ANCHOR || cleaned.includes(INTERFACE_ANCHOR)) {
      // 排除 §0 定义行和注释
      const sectionNum = getSectionNumber(i + 1, sections);
      if (sectionNum.startsWith('§0')) continue;
      // 排除代码围栏内的注释行
      if (lines[i].trim().startsWith('//') || lines[i].trim().startsWith('>')) continue;
      anchorCount++;
      anchorLines.push(i + 1);
    }
  }
  if (anchorCount === 0) {
    issues.push({ check: 'C4', level: 'FAIL', message: '接口契约悬空（0 次）' });
  } else if (anchorCount > 1) {
    issues.push({ check: 'C4', level: 'FAIL', message: `接口契约副本漂移（${anchorCount} 次：行 ${anchorLines.join(', ')}）` });
  }

  // 4d: constraint 求值
  for (const p of params) {
    if (p.type === 'conditional' && p.constraint.trim().length > 0) {
      issues.push({ check: 'C4', level: 'FAIL', message: `${p.id} conditional 不可约束: "${p.constraint}"` });
    }
    if (p.type === 'placeholder' && p.constraint.trim().length > 0) {
      issues.push({ check: 'C4', level: 'FAIL', message: `${p.id} placeholder 不可约束: "${p.constraint}"` });
    }
  }

  // 4e: constraint 线性不等式求值
  const constraintIssues = evaluateConstraints(params);
  issues.push(...constraintIssues);

  if (issues.length === 0) {
    results.push({ check: 'C4', level: 'PASS', message: '引用解析通过（含 constraint 求值）' });
  } else {
    results.push({ check: 'C4', level: 'FAIL', message: `${issues.length} 处引用/约束违规` });
    issues.slice(0, 30).forEach(i => results.push(i));
    if (issues.length > 30) results.push({ check: 'C4', level: 'FAIL', message: `...还有 ${issues.length - 30} 处` });
  }

  return results;
}

function evaluateConstraints(params: ParamEntry[]): CheckResult[] {
  const issues: CheckResult[] = [];
  const paramMap = new Map<string, number>();
  params.forEach(p => {
    if (p.type === 'numeric' && p.numericValue !== undefined) {
      paramMap.set(p.id, p.numericValue);
    }
  });

  for (const p of params) {
    if (!p.constraint || p.constraint.trim().length === 0) continue;
    if (p.type !== 'numeric') continue;

    // 解析 constraint 表达式（简化版：P-NN+P-NN <= P-NN）
    const constraints = p.constraint.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const expr of constraints) {
      // 提取注释（# 之后）
      const exprParts = expr.split('#').map(s => s.trim());
      const formula = exprParts[0];

      // 解析不等式：左侧表达式 <= 右侧表达式
      const match = formula.match(/^(.+?)\s*(<=|>=|<|>)\s*(.+)$/);
      if (!match) continue;

      const leftExpr = match[1].trim();
      const op = match[2];
      const rightExpr = match[3].trim();

      const leftVal = evalExpr(leftExpr, paramMap);
      const rightVal = evalExpr(rightExpr, paramMap);

      if (leftVal === null || rightVal === null) continue; // 有 placeholder 跳过

      let violated = false;
      switch (op) {
        case '<=': violated = leftVal > rightVal; break;
        case '>=': violated = leftVal < rightVal; break;
        case '<': violated = leftVal >= rightVal; break;
        case '>': violated = leftVal <= rightVal; break;
      }

      if (violated) {
        issues.push({
          check: 'C4',
          level: 'FAIL',
          message: `${p.id} constraint 违反: ${formula} → ${leftVal} ${op} ${rightVal} = ${!violated}`,
        });
      }
    }
  }

  return issues;
}

function evalExpr(expr: string, paramMap: Map<string, number>): number | null {
  // 简化版：解析 P-NN+P-NN+... 形式
  const terms = expr.split('+').map(s => s.trim());
  let sum = 0;
  for (const term of terms) {
    const match = term.match(/^P-(\d+)$/);
    if (match) {
      const val = paramMap.get(`P-${match[1]}`);
      if (val === undefined) return null;
      sum += val;
    } else {
      return null;
    }
  }
  return sum;
}

// ============================================================================
// C5: bench 联动
// ============================================================================

function checkC5(lines: string[], sections: SectionInfo[]): CheckResult[] {
  const results: CheckResult[] = [];
  const issues: CheckResult[] = [];

  // 查找附录 A 区域
  let inAppendixA = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^##\s+附录\s*A/)) inAppendixA = true;
    else if (inAppendixA && lines[i].match(/^##\s+附录\s*B/)) { inAppendixA = false; break; }

    if (inAppendixA && lines[i].includes('affects:')) {
      const affectsMatch = lines[i].match(/affects:\s*(.+?)(\s*\||\s*$)/);
      if (affectsMatch) {
        const affects = affectsMatch[1].trim();
        const touchesSearchOrParams = affects.includes('§6') || affects.includes('§5');

        const hasBench = lines[i].includes('bench:B-') || lines[i].includes('bench:na(');
        if (touchesSearchOrParams && !hasBench) {
          issues.push({
            check: 'C5',
            level: 'FAIL',
            message: `附录A 第 ${i + 1} 行触及 §5/§6 但缺 bench ID`,
            line: i + 1,
          });
        }

        // bench:na 类名校验
        const naMatch = lines[i].match(/bench:na\((\w+)\)/);
        if (naMatch) {
          const validClasses = ['typo', 'new-param', 'deprec'];
          if (!validClasses.includes(naMatch[1])) {
            issues.push({
              check: 'C5',
              level: 'FAIL',
              message: `附录A 第 ${i + 1} 行 bench:na 类名 "${naMatch[1]}" 不在枚举内`,
              line: i + 1,
            });
          }
          // 检查理由非空
          const reasonMatch = lines[i].match(/bench:na\(\w+\)\s+(.+)/);
          if (!reasonMatch || reasonMatch[1].trim().length === 0) {
            issues.push({
              check: 'C5',
              level: 'FAIL',
              message: `附录A 第 ${i + 1} 行 bench:na 缺理由`,
              line: i + 1,
            });
          }
        }
      }
    }
  }

  if (issues.length === 0) {
    results.push({ check: 'C5', level: 'PASS', message: 'bench 联动检查通过' });
  } else {
    results.push({ check: 'C5', level: 'FAIL', message: `${issues.length} 处 bench 联动违规` });
    issues.forEach(i => results.push(i));
  }

  return results;
}

// ============================================================================
// C6: 共变
// ============================================================================

function checkC6(lines: string[], sections: SectionInfo[]): CheckResult[] {
  const results: CheckResult[] = [];

  // 检查 git 是否可用
  try {
    execSync('git rev-parse --git-dir', { cwd: path.dirname(DOC_PATH), stdio: 'pipe' });
  } catch {
    results.push({ check: 'C6', level: 'WARN', message: 'git 不可用，跳过共变检查' });
    return results;
  }

  // 查找上一版本标签
  let lastTag = '';
  try {
    lastTag = execSync('git describe --tags --abbrev=0', { cwd: path.dirname(DOC_PATH), encoding: 'utf-8' }).trim();
  } catch {
    results.push({ check: 'C6', level: 'WARN', message: '未找到版本标签，请先 git tag -a' });
    return results;
  }

  // 获取 diff
  let diff = '';
  try {
    diff = execSync(`git diff ${lastTag}..HEAD -- "${path.basename(DOC_PATH)}"`, {
      cwd: path.dirname(DOC_PATH),
      encoding: 'utf-8',
    });
  } catch {
    results.push({ check: 'C6', level: 'WARN', message: 'git diff 失败' });
    return results;
  }

  if (!diff.trim()) {
    results.push({ check: 'C6', level: 'PASS', message: '无变更，共变检查通过' });
    return results;
  }

  // 分析 diff 归因到章节
  const touchedSections = new Set<string>();
  const diffLines = diff.split('\n');
  for (const line of diffLines) {
    if (line.startsWith('@@')) {
      // 解析 hunk 头获取行号
      const match = line.match(/\+(\d+)/);
      if (match) {
        const lineNum = parseInt(match[1]);
        const sectionNum = getSectionNumber(lineNum, sections);
        if (sectionNum) touchedSections.add(sectionNum);
      }
    }
  }

  const touchesSearchOrParams =
    Array.from(touchedSections).some(s => s.startsWith('§5') || s.startsWith('§6'));

  if (!touchesSearchOrParams) {
    results.push({ check: 'C6', level: 'PASS', message: 'diff 未触及 §5/§6' });
    return results;
  }

  // 检查附录 A 是否有对应变更
  const touchesAppendixA = Array.from(touchedSections).some(s => s.includes('附录A') || s.includes('附录 A'));
  if (!touchesAppendixA) {
    results.push({
      check: 'C6',
      level: 'FAIL',
      message: `diff 触及 ${Array.from(touchedSections).filter(s => s.startsWith('§5') || s.startsWith('§6')).join(', ')} 但附录A 未变`,
    });
  } else {
    results.push({ check: 'C6', level: 'PASS', message: '共变检查通过' });
  }

  return results;
}

// ============================================================================
// C7: provisional 超期
// ============================================================================

function checkC7(lines: string[]): CheckResult[] {
  const results: CheckResult[] = [];
  const issues: CheckResult[] = [];
  const today = new Date();

  const provRegex = /\[provisional@(\d{4}-\d{2}-\d{2})\]/g;

  for (let i = 0; i < lines.length; i++) {
    let match;
    provRegex.lastIndex = 0;
    while ((match = provRegex.exec(lines[i])) !== null) {
      const dateStr = match[1];
      const provDate = new Date(dateStr);
      const diffDays = Math.floor((today.getTime() - provDate.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays > 28) {
        issues.push({
          check: 'C7',
          level: 'FAIL',
          message: `provisional@${dateStr} 已 ${diffDays} 天未晋升（>28天），第 ${i + 1} 行`,
          line: i + 1,
        });
      }
    }
  }

  if (issues.length === 0) {
    results.push({ check: 'C7', level: 'PASS', message: 'provisional 超期检查通过' });
  } else {
    results.push({ check: 'C7', level: 'FAIL', message: `${issues.length} 处 provisional 超期` });
    issues.forEach(i => results.push(i));
  }

  return results;
}

// ============================================================================
// 迁移期进度报告
// ============================================================================

function printMigrationProgress(lines: string[], sections: SectionInfo[]): void {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  迁移进度报告（--migration）');
  console.log('══════════════════════════════════════════════════\n');

  // 统计未登记数值
  let unregisteredCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const sectionNum = getSectionNumber(i + 1, sections);
    if (isExemptSection(sectionNum)) continue;
    if (isInDetailsBlock(i + 1, lines)) continue;

    let cleaned = lines[i];
    for (const wl of TOKEN_WHITELIST) cleaned = cleaned.replace(wl, '');

    for (const pattern of FAIL_PATTERNS) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(cleaned)) {
        if (!lines[i].match(/^\|\s*P-\d+\s*\|/) || !lines[i].includes('numeric')) {
          unregisteredCount++;
        }
      }
    }
  }

  // 统计悬空引用
  const params = parseParamRegistry(lines);
  const paramMap = new Set<string>();
  params.forEach(p => paramMap.add(p.id));
  let danglingRefCount = 0;
  const refRegex = /\[P-(\d+)\]/g;
  for (let i = 0; i < lines.length; i++) {
    let match;
    refRegex.lastIndex = 0;
    while ((match = refRegex.exec(lines[i])) !== null) {
      if (!paramMap.has(`P-${match[1]}`)) danglingRefCount++;
    }
  }

  // 统计未迁移章节
  const migratedSections = sections.filter(s => !s.title.includes('[迁移中]'));
  const unmigratedSections = sections.filter(s => s.title.includes('[迁移中]'));

  console.log(`  未登记数值数: ${unregisteredCount}`);
  console.log(`  悬空引用数: ${danglingRefCount}`);
  console.log(`  未迁移章节: ${unmigratedSections.length}/${sections.length}`);
  if (unmigratedSections.length > 0) {
    unmigratedSections.forEach(s => console.log(`    - ${s.number} ${s.title.substring(0, 40)}`));
  }

  // 填充率
  const total = unregisteredCount + params.length;
  const fillRate = total > 0 ? ((params.length / total) * 100).toFixed(1) : '0.0';
  console.log(`  PARAM 填充率: ${fillRate}% (${params.length}/${total})`);
  console.log(`  退出阈值: ≥80%\n`);

  // 章节触碰表
  console.log('  章节触碰表:');
  console.log('  ┌──────────┬────────────┬──────────┬──────┐');
  console.log('  │ 章节     │ 最后diff   │ 存量WARN │ 状态 │');
  console.log('  ├──────────┼────────────┼──────────┼──────┤');

  // 简化版：检查 git diff 是否触及
  let gitAvailable = true;
  try {
    execSync('git rev-parse --git-dir', { cwd: path.dirname(DOC_PATH), stdio: 'pipe' });
  } catch {
    gitAvailable = false;
  }

  for (const s of sections) {
    let lastDiff = 'N/A';
    let status = '🟡';

    if (gitAvailable) {
      try {
        const diffOutput = execSync(
          `git log -1 --format="%ad" --date=short -L ${s.startLine},${s.endLine}:"${path.basename(DOC_PATH)}"`,
          { cwd: path.dirname(DOC_PATH), encoding: 'utf-8', stdio: 'pipe' }
        ).trim();
        if (diffOutput) lastDiff = diffOutput.substring(0, 10);
      } catch {
        // 无 diff 记录
      }

      if (lastDiff !== 'N/A') {
        const diffDate = new Date(lastDiff);
        const daysSince = Math.floor((Date.now() - diffDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince <= 14) status = '🟡 2周内';
        else if (daysSince <= 28) status = '🔴 >2周';
        else status = '❌ >4周';
      } else {
        status = '🔴 未触碰';
      }
    } else {
      status = '🟡 无git';
    }

    const warnCount = s.title.includes('[迁移中]') ? '—' : '0';
    console.log(`  │ ${s.number.padEnd(8)} │ ${lastDiff.padEnd(10)} │ ${warnCount.padEnd(8)} │ ${status} │`);
  }
  console.log('  └──────────┴────────────┴──────────┴──────┘\n');
}

// ============================================================================
// 汇总输出
// ============================================================================

function printSummary(results: CheckResult[]): void {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  检查汇总');
  console.log('══════════════════════════════════════════════════\n');

  const checks = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
  for (const check of checks) {
    const checkResults = results.filter(r => r.check === check);
    const hasFail = checkResults.some(r => r.level === 'FAIL');
    const hasWarn = checkResults.some(r => r.level === 'WARN');
    const topLevel = hasFail ? '❌ FAIL' : hasWarn ? '⚠️  WARN' : '✅ PASS';
    const summary = checkResults.find(r => r.level === 'FAIL')?.message
      || checkResults.find(r => r.level === 'WARN')?.message
      || checkResults.find(r => r.level === 'PASS')?.message
      || '未执行';

    console.log(`  ${topLevel}  ${check}: ${summary}`);

    // 输出详细问题（FAIL 全量；基线模式额外输出 WARN）
    const detailItems = checkResults.filter(r => r.level === 'FAIL' && r !== checkResults[0]);
    if (BASELINE_MODE) {
      detailItems.push(...checkResults.filter(r => r.level === 'WARN' && r !== checkResults[0]));
    }
    detailItems.forEach(r => console.log(`         └─ ${r.message}`));
  }

  const totalFail = results.filter(r => r.level === 'FAIL').length;
  const totalWarn = results.filter(r => r.level === 'WARN').length;
  console.log(`\n  总计: ${totalFail} FAIL, ${totalWarn} WARN`);
  console.log(`  结果: ${totalFail > 0 ? '❌ 阻断' : '✅ 通过'}\n`);
}

// ============================================================================
// 启动
// ============================================================================

main();
