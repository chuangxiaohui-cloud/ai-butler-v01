/**
 * E349：思维导图纯布局/计数（横向树）——MindMapViewer 共用。
 * 零新增依赖：叶子逐行分配 y、父节点取均值、三次贝塞尔连线；一级分支 8 色循环。
 */
export interface MindTreeNode {
  id: string;
  title: string;
  children: MindTreeNode[];
}

export const NODE_H = 26;
export const ROW_H = 34;
export const COL_GAP = 230;
export const PAD_X = 18;
export const PAD_Y = 14;
export const MAX_MAP_NODES = 320;

/** 一级分支配色（深色面板上可见的 8 色循环） */
export const BRANCH_COLORS = [
  '#5b8def',
  '#34c98d',
  '#e5a13a',
  '#ef6b6b',
  '#b47ef0',
  '#37c6cf',
  '#f0909f',
  '#a3bd4f',
];

export interface LaidNode {
  id: string;
  title: string;
  fullTitle: string;
  depth: number;
  x: number;
  y: number;
  w: number;
  color: string | null;
}

export interface MindMapLayout {
  laid: LaidNode[];
  edges: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }>;
  width: number;
  height: number;
  total: number;
}

function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch.codePointAt(0)! > 0x2e00 ? 12 : 6.6;
  return w;
}

/** 标题超宽则截断加省略号，完整标题留 tooltip */
function fitTitle(title: string): string {
  const max = 186;
  if (textWidth(title) <= max) return title;
  let acc = '';
  let w = 0;
  for (const ch of title) {
    const cw = ch.codePointAt(0)! > 0x2e00 ? 12 : 6.6;
    if (w + cw > max - 8) break;
    acc += ch;
    w += cw;
  }
  return `${acc}…`;
}

export function countNodes(node: MindTreeNode): number {
  return 1 + (node.children ?? []).reduce((sum, c) => sum + countNodes(c), 0);
}

/** 计算横向树布局：叶子逐行分配 y，父节点取子节点平均 y */
export function layoutTree(root: MindTreeNode): MindMapLayout {
  const laid: LaidNode[] = [];
  const byNode = new Map<MindTreeNode, LaidNode>();
  let leafCount = 0;

  const walk = (node: MindTreeNode, depth: number, color: string | null) => {
    const kids = node.children ?? [];
    let y: number;
    if (kids.length === 0) {
      y = PAD_Y + ROW_H / 2 + leafCount * ROW_H;
      leafCount += 1;
    } else {
      let sum = 0;
      for (const k of kids) {
        walk(k, depth + 1, color);
        sum += byNode.get(k)!.y;
      }
      y = sum / kids.length;
    }
    const title = fitTitle(node.title);
    laid.push({
      id: node.id,
      title,
      fullTitle: node.title,
      depth,
      x: PAD_X + depth * COL_GAP,
      y,
      w: Math.max(44, Math.round(textWidth(title) + 18)),
      color,
    });
    byNode.set(node, laid[laid.length - 1]);
  };

  const rootKids = root.children ?? [];
  if (rootKids.length === 0) {
    walk(root, 0, null);
  } else {
    rootKids.forEach((k, i) => walk(k, 1, BRANCH_COLORS[i % BRANCH_COLORS.length]));
    const kidsY = rootKids.map((k) => byNode.get(k)!.y);
    const title = fitTitle(root.title);
    laid.push({
      id: root.id,
      title,
      fullTitle: root.title,
      depth: 0,
      x: PAD_X,
      y: kidsY.reduce((a, b) => a + b, 0) / kidsY.length,
      w: Math.max(52, Math.round(textWidth(title) + 20)),
      color: null,
    });
    byNode.set(root, laid[laid.length - 1]);
  }

  const edges: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }> = [];
  const collectEdges = (node: MindTreeNode) => {
    const p = byNode.get(node)!;
    for (const k of node.children ?? []) {
      const c = byNode.get(k)!;
      edges.push({ x1: p.x + p.w, y1: p.y, x2: c.x, y2: c.y, color: c.color ?? '#8a93a3' });
      collectEdges(k);
    }
  };
  collectEdges(root);

  let maxRight = PAD_X;
  for (const n of laid) maxRight = Math.max(maxRight, n.x + n.w);
  const width = maxRight + PAD_X;
  const height = Math.max(ROW_H, PAD_Y * 2 + leafCount * ROW_H);
  return { laid, edges, width, height, total: countNodes(root) };
}
