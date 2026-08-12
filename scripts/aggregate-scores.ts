// 聚合 scoring-results.csv → per-query 31 行 markdown 表（附录C使用）
import { readFileSync } from 'fs';

const csv = readFileSync('E:/WorkBuddy_WorkSpace/bench/raw_scores.csv', 'utf-8');
const lines = csv.trim().split('\n');
const header = lines[0].split(',');
// 解析（Query 可能含逗号，用简单解析：ID,引擎,相关性,时效,可用 位置固定）
interface Row { id: string; query: string; engine: string; rel: number; tim: number; usa: number; }
const rows: Row[] = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  // 用引号感知解析
  const parts: string[] = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  // 格式: ID,Query,引擎,相关性,时效,可用,备注
  rows.push({
    id: parts[0],
    query: parts[1],
    engine: parts[2],
    rel: +parts[3],
    tim: +parts[4],
    usa: +parts[5],
  });
}

// 按 ID 分组（保持 CSV 顺序）
const ids: string[] = [];
const byId = new Map<string, Row[]>();
for (const r of rows) {
  if (!byId.has(r.id)) { byId.set(r.id, []); ids.push(r.id); }
  byId.get(r.id)!.push(r);
}

const comp = (r: Row) => +((r.rel + r.tim + r.usa) / 3).toFixed(2);

// 引擎显示顺序
const engineOrder = ['Bocha', 'AnySearch', 'Tavily'];
const short = { Bocha: 'B', AnySearch: 'A', Tavily: 'T' } as Record<string, string>;

console.log('| ID | Query | B(相/时/可/综) | A(相/时/可/综) | T(相/时/可/综) | 最佳 |');
console.log('|----|-------|-----------------|-----------------|-----------------|------|');
for (const id of ids) {
  const group = byId.get(id)!;
  const query = group[0].query;
  const byEngine = new Map(group.map(r => [r.engine, r]));
  const cells: string[] = [];
  let best = '';
  let bestScore = -1;
  for (const e of engineOrder) {
    const r = byEngine.get(e);
    if (!r) { cells.push('-'); continue; }
    const c = comp(r);
    cells.push(`${r.rel}/${r.tim}/${r.usa}/${c}`);
    if (c > bestScore) { bestScore = c; best = short[e]; }
  }
  console.log(`| ${id} | ${query} | ${cells[0]} | ${cells[1]} | ${cells[2]} | ${best} |`);
}
