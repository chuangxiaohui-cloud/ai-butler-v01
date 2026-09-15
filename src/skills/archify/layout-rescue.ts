/**
 * E359：Archify 架构图「本地确定性版式救援」。
 * LLM 修复轮穷尽仍不过校验时不直接 0.35 收场——降 standard 档 + 读诊断（含坐标与建议值）
 * 本地修补：① 标签重叠照抄 labelAt/labelDy 建议；② 端点方向补显式 fromSide/toSide；
 * ③ 竖穿/交叉把障碍或端点组件与其它组件交换、或挪到空单元格（grid），validate 作 oracle 有界搜索。
 * ④ 反平行双线合并（E362）：被 label-route-clearance 点名的同对节点反向双线先合并成一条双向虚线。
 * 全程无 LLM，纯本地确定性；仍不过才交由上层诚实收据。
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { archifyValidate, countDiagnostics } from './render.js';
import type { ArchifyDiagnostic, ArchifyReceipt, ArchifyRunner } from './render.js';

export interface LayoutRescueOptions {
  jsonPath: string;
  run: ArchifyRunner;
  vendorDir: string;
  /** validate 次数上限（本地子进程，无 LLM）；默认 36 */
  maxValidations?: number;
}

export interface LayoutRescueResult {
  ok: boolean;
  receipt: ArchifyReceipt;
  candidateText: string;
  validations: number;
}

type JsonObject = Record<string, unknown>;

const SIDES = new Set(['left', 'right', 'top', 'bottom']);
const MAX_LABEL_APPLY = 3; // E362：同连接最多跟随新建议应用 3 次，防原地踏步

interface Candidate {
  obj: JsonObject;
}

function componentsOf(candidate: Candidate): JsonObject[] {
  const value = candidate.obj.components;
  return Array.isArray(value) ? (value as JsonObject[]) : [];
}

function connectionsOf(candidate: Candidate): JsonObject[] {
  const value = candidate.obj.connections;
  return Array.isArray(value) ? (value as JsonObject[]) : [];
}

function connById(candidate: Candidate, id: unknown): JsonObject | undefined {
  return typeof id === 'string' ? connectionsOf(candidate).find((c) => c.id === id) : undefined;
}

function componentById(candidate: Candidate, id: unknown): JsonObject | undefined {
  return typeof id === 'string' ? componentsOf(candidate).find((c) => c.id === id) : undefined;
}

function connByLabel(candidate: Candidate, label: string | undefined): JsonObject | undefined {
  if (!label) return undefined;
  return connectionsOf(candidate).find((c) => c.label === label);
}
/** E362：找被 label-route-clearance 诊断同时点名两个 label 的反平行连接对（a↔b 方向互反） */
function findImplicatedAntiPair(candidate: Candidate, diagnostics: ArchifyDiagnostic[]): [JsonObject, JsonObject] | null {
  const conns = connectionsOf(candidate);
  const diagMsgs = diagnostics
    .filter((d) => String(d.code ?? '').includes('label-route-clearance'))
    .map((d) => d.message ?? '');
  for (let i = 0; i < conns.length; i += 1) {
    const a = conns[i];
    for (let j = i + 1; j < conns.length; j += 1) {
      const b = conns[j];
      if (String(a.from) !== String(b.to) || String(a.to) !== String(b.from)) continue;
      const aLabel = typeof a.label === 'string' ? a.label : '';
      const bLabel = typeof b.label === 'string' ? b.label : '';
      if (!aLabel || !bLabel) continue;
      const bothNamed = diagMsgs.some(
        (msg) => msg.includes(`label "${aLabel}"`) && msg.includes(`label "${bLabel}"`),
      );
      if (!bothNamed) continue;
      return [a, b];
    }
  }
  return null;
}

/** E362：合并被诊断点名的反平行对——保留组件序更靠前者为正向，label 用「/」并列，任一侧异步/回程则整条 dashed，删除另一条 */
function mergeImplicatedAntiPair(candidate: Candidate, diagnostics: ArchifyDiagnostic[]): boolean {
  const pair = findImplicatedAntiPair(candidate, diagnostics);
  if (!pair) return false;
  const [x, y] = pair;
  const comps = componentsOf(candidate);
  const pos = (id: string): number => comps.findIndex((c) => c.id === id);
  const [keep, drop] = pos(String(x.from)) <= pos(String(x.to)) ? [x, y] : [y, x];
  const conns = connectionsOf(candidate);
  const dropIdx = conns.indexOf(drop);
  if (dropIdx === -1) return false;
  const variant = keep.variant === 'dashed' || drop.variant === 'dashed' ? 'dashed' : undefined;
  if (variant) keep.variant = variant;
  keep.label = `${String(keep.label)}/${String(drop.label)}`;
  conns.splice(dropIdx, 1);
  return true;
}

/** E362：从 label-route-clearance 诊断消息解析两段连线涉及的端点（connections[i] "a" -> "b"） */
function labelRouteTroubleIds(candidate: Candidate, message: string): string[] {
  const ids: string[] = [];
  const re = /connections\[\d+\]\s+"([^"]+)"\s*->\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    ids.push(m[1], m[2]);
  }
  return ids;
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cloneCandidate(candidate: Candidate): Candidate {
  return { obj: JSON.parse(JSON.stringify(candidate.obj)) as JsonObject };
}

function toText(candidate: Candidate): string {
  return JSON.stringify(candidate.obj, null, 2);
}

function parseLabelFix(
  message: string,
): { kind: 'labelAt'; x: number; y: number } | { kind: 'labelDy'; dy: number } | null {
  const labelAt = /Suggested fix:\s*labelAt\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/i.exec(message);
  if (labelAt) return { kind: 'labelAt', x: Number(labelAt[1]), y: Number(labelAt[2]) };
  const labelDy = /labelDy\s*([+-]\d+)/i.exec(message);
  if (labelDy) return { kind: 'labelDy', dy: Number(labelDy[1]) };
  return null;
}

function labelTextOfMessage(message: string): string | undefined {
  const direct = /Label\s+"([^"]+)"/i.exec(message);
  if (direct) return direct[1];
  const inline = /label\s+"([^"]+)"/i.exec(message);
  return inline?.[1];
}

/** 预检：meta 转 standard、grid 右侧留空列（给绕行走廊） */
function prepareStandard(candidate: Candidate): void {
  const meta = candidate.obj.meta;
  if (meta && typeof meta === 'object') (meta as JsonObject).quality_profile = 'standard';
  const layout = candidate.obj.layout;
  if (layout && typeof layout === 'object' && (layout as JsonObject).mode === 'grid') {
    const maxCol = componentsOf(candidate).reduce((acc, c) => Math.max(acc, num(c.col, 0)), 0);
    const cols = num((layout as JsonObject).cols, 3);
    const targetCols = Math.max(cols, maxCol + 2); // 至少留 1 空列当绕行走廊
    if (targetCols > cols) (layout as JsonObject).cols = targetCols;
  }
}

/**
 * 有界本地救援：返回 ok=候选已通过 standard 校验（调用方随后用 standard 交付）。
 */
export async function rescueArchitectureLayout(options: LayoutRescueOptions): Promise<LayoutRescueResult> {
  const { jsonPath, run, vendorDir } = options;
  const maxValidations = options.maxValidations ?? 36;

  let candidate = { obj: JSON.parse(readFileSync(jsonPath, 'utf8')) as JsonObject };
  prepareStandard(candidate);
  let validations = 0;

  const writeValidate = async (c: Candidate): Promise<ArchifyReceipt> => {
    writeFileSync(jsonPath, toText(c), 'utf8');
    validations += 1;
    return archifyValidate(run, 'architecture', jsonPath, 'standard', vendorDir);
  };
  const validateNow = (): Promise<ArchifyReceipt> => writeValidate(candidate);

  const labelApplyCount = new Map<string, number>();
  const appliedSides = new Set<string>();
  const triedPairs = new Set<string>();
  const rejectedAnti = new Set<string>(); // E362：尝试合并但未改善的反平行对，不再重试
  let sidewaysLeft = 6; // 允许一定次数“持平”移动，翻越局部平台

  let receipt = await validateNow();
  let diagCount = countDiagnostics(receipt.diagnostics);
  let idleRounds = 0;

  while (!receipt.ok && validations < maxValidations && idleRounds < 2) {
    const diagnostics = receipt.diagnostics ?? [];
    let touched = false;

    // 0) E362：先合并被诊断点名的反平行双线（同走廊双线是 label 互压根源）；validate 作 oracle，不改善回滚并不再重试该对
    const antiPair = findImplicatedAntiPair(candidate, diagnostics);
    if (antiPair) {
      const antiKey = [String(antiPair[0].from), String(antiPair[0].to)].sort().join('|');
      if (!rejectedAnti.has(antiKey)) {
        const trial = cloneCandidate(candidate);
        if (mergeImplicatedAntiPair(trial, diagnostics)) {
          const next = await writeValidate(trial);
          const count = countDiagnostics(next.diagnostics);
          if (next.ok || count < diagCount) {
            candidate = trial;
            receipt = next;
            diagCount = count;
            if (receipt.ok) break;
            continue;
          }
          rejectedAnti.add(antiKey);
          writeFileSync(jsonPath, toText(candidate), 'utf8'); // 未提交：恢复文件为候选内容，不计 validate 次数
        } else {
          rejectedAnti.add(antiKey);
        }
      }
    }
    // ① 标签重叠：照抄诊断建议（每个连接只改一次）
    for (const diag of diagnostics) {
      const message = diag.message ?? '';
      if (!/(label|Label)/.test(message)) continue;
      const fix = parseLabelFix(message);
      if (!fix) continue;
      const conn =
        connById(candidate, diag.subject?.id) ?? connByLabel(candidate, labelTextOfMessage(message));
      if (!conn || typeof conn.id !== 'string') continue;
      const appliedN = labelApplyCount.get(conn.id) ?? 0;
      if (appliedN >= MAX_LABEL_APPLY) continue;
      if (fix.kind === 'labelAt') {
        const cur = Array.isArray(conn.labelAt) ? conn.labelAt : undefined;
        if (cur && cur[0] === fix.x && cur[1] === fix.y) continue; // 同坐标建议已应用过，跳过
        conn.labelAt = [fix.x, fix.y];
        delete conn.labelDy;
      } else {
        if (conn.labelDy === fix.dy) continue;
        conn.labelDy = fix.dy;
        delete conn.labelAt;
      }
      labelApplyCount.set(conn.id, appliedN + 1);
      touched = true;
    }

    // ② 端点方向：显式写入推断 side（可能触发 side-aware 桥接路由）
    for (const diag of diagnostics) {
      if (!/endpoint-side-direction/.test(diag.code ?? '')) continue;
      const conn = connById(candidate, diag.subject?.id);
      const evidence = (diag.evidence ?? {}) as JsonObject;
      const side = String(evidence.side ?? '');
      const field = String(evidence.authoredField ?? '');
      if (!conn || typeof conn.id !== 'string' || (field !== 'fromSide' && field !== 'toSide')) continue;
      if (!SIDES.has(side)) continue;
      const key = `${conn.id}:${field}`;
      if (appliedSides.has(key)) continue;
      conn[field] = side;
      appliedSides.add(key);
      touched = true;
    }

    if (touched) {
      receipt = await validateNow();
      diagCount = countDiagnostics(receipt.diagnostics);
      idleRounds = 0;
      continue;
    }

    // ③ 交换/挪位：给 trouble 组件找更干净布局（validate 作 oracle）
    const troubleIds = troubleComponentIds(candidate, diagnostics);
    const comps = componentsOf(candidate);
    const layout = candidate.obj.layout;
    const cols = layout && typeof layout === 'object' ? num((layout as JsonObject).cols, 3) : 3;
    const maxRow = comps.reduce((acc, c) => Math.max(acc, num(c.row, 0)), 0);
    const occupiedCells = new Set(comps.map((c) => `${num(c.row, 0)},${num(c.col, 0)}`));
    let best: { trial: Candidate; receipt: ArchifyReceipt; count: number } | null = null;
    const snapshot = cloneCandidate(candidate);

    outer: for (const id of troubleIds) {
      const target = componentById(candidate, id);
      if (!target) continue;
      const targetRow = num(target.row, 0);
      const targetCol = num(target.col, 0);
      // 与其它组件交换
      for (const other of comps) {
        if (other === target) continue;
        const pairKey = [String(target.id), String(other.id)].sort().join('|');
        if (triedPairs.has(pairKey)) continue;
        triedPairs.add(pairKey);
        const trial = cloneCandidate(candidate);
        const t = componentById(trial, target.id);
        const o = componentById(trial, other.id);
        if (!t || !o) continue;
        const rowB = num(o.row, 0);
        const colB = num(o.col, 0);
        t.row = rowB;
        t.col = colB;
        o.row = targetRow;
        o.col = targetCol;
        const next = await writeValidate(trial);
        const count = countDiagnostics(next.diagnostics);
        if (!best || next.ok || count < best.count) best = { trial, receipt: next, count };
        if (best?.receipt.ok || validations >= maxValidations) break outer;
      }
      // 移到空格子
      for (let row = 0; row <= maxRow; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          if (occupiedCells.has(`${row},${col}`)) continue;
          const moveKey = `${String(target.id)}->${row},${col}`;
          if (triedPairs.has(moveKey)) continue;
          triedPairs.add(moveKey);
          const trial = cloneCandidate(candidate);
          const t = componentById(trial, target.id);
          if (!t) continue;
          t.row = row;
          t.col = col;
          const next = await writeValidate(trial);
          const count = countDiagnostics(next.diagnostics);
          if (!best || next.ok || count < best.count) best = { trial, receipt: next, count };
          if (best?.receipt.ok || validations >= maxValidations) break outer;
        }
      }
    }

    const canSideways = best && !best.receipt.ok && best.count <= diagCount && sidewaysLeft > 0;
    if (best && (best.receipt.ok || best.count < diagCount || canSideways)) {
      candidate = best.trial;
      receipt = best.receipt;
      diagCount = best.count;
      if (canSideways) sidewaysLeft -= 1;
      idleRounds = 0;
      if (receipt.ok) break;
      continue;
    }
    // 搜索无改善：还原本轮前状态，再给一轮（标签/端点已修尽、交换对已试完则结束）
    candidate = snapshot;
    idleRounds += 1;
  }

  writeFileSync(jsonPath, toText(candidate), 'utf8');
  return { ok: receipt.ok, receipt, candidateText: toText(candidate), validations };
}

function troubleComponentIds(candidate: Candidate, diagnostics: ArchifyDiagnostic[]): string[] {
  const ids = new Set<string>();
  for (const diag of diagnostics) {
    const code = diag.code ?? '';
    if (code.includes('endpoint-side-direction')) {
      const subj = (diag.subject ?? {}) as JsonObject;
      if (typeof subj.from === 'string') ids.add(subj.from);
      if (typeof subj.to === 'string') ids.add(subj.to);
    }
    if (code.includes('edge-through-node')) {
      const subj = (diag.subject ?? {}) as JsonObject;
      if (typeof subj.id === 'string') {
        const conn = connById(candidate, subj.id);
        if (conn) {
          if (typeof conn.from === 'string') ids.add(conn.from);
          if (typeof conn.to === 'string') ids.add(conn.to);
        }
      }
      const obstacle = String(((diag.evidence ?? {}) as JsonObject).obstacleId ?? '');
      if (obstacle) ids.add(obstacle);
    }
    if (code.includes('label-route-clearance')) {
      for (const id of labelRouteTroubleIds(candidate, diag.message ?? '')) ids.add(id);
    }
  }
  return [...ids];
}
