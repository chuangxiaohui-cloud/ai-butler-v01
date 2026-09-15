/**
 * Skill: layered-arch 本地校验（E364）
 * 校验分层图轻量 JSON（layers/nodes{name,detail}/层间 connections/rules）：
 * 结构 + 相邻层连线 + 领域无关的词法规则只靠提示词与样板把关，这里只做可判定的硬校验，
 * 纯本地确定性，替代 Archify 的 renderer validate（无 lint/救援/0.3/0.35 链条）。
 */

export interface LayeredNode {
  id: string;
  name: string;
  detail?: string;
  role?: 'core';
}

export interface LayeredLayer {
  id: string;
  name: string;
  subtitle?: string;
  order?: number;
  highlight?: boolean;
  nodes: LayeredNode[];
}

export interface LayeredConnection {
  from: string;
  to: string;
  label?: string;
}

export interface LayeredDiagram {
  meta?: { title?: string; description?: string; canvas?: { direction?: string } };
  layers?: LayeredLayer[];
  connections?: LayeredConnection[];
  rules?: string[];
}

export const LAYER_LIMITS = {
  maxLayers: 10,
  minNodesPerLayer: 1,
  maxNodesPerLayer: 8,
  maxConnections: 30,
} as const;

const ID_RE = /^[a-z][a-z0-9_]*$/;

export function validateLayeredDiagram(data: unknown): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, issues: ['顶层必须是 JSON 对象'] };
  }
  const d = data as Record<string, unknown>;
  const meta = (d.meta ?? {}) as Record<string, unknown>;
  const title = meta.title;
  if (typeof title !== 'string' || !title.trim()) {
    issues.push('meta.title 必填且为非空字符串');
  }

  const layersRaw = d.layers;
  if (!Array.isArray(layersRaw) || layersRaw.length === 0) {
    issues.push('layers 必须是至少 1 层的数组');
  }
  if (Array.isArray(layersRaw) && layersRaw.length > LAYER_LIMITS.maxLayers) {
    issues.push(`层数 ${layersRaw.length} 超过上限 ${LAYER_LIMITS.maxLayers}`);
  }

  const layerOrder: string[] = [];
  const nodeIds = new Set<string>();
  const seenOrders = new Map<number, string>();
  if (Array.isArray(layersRaw)) {
    layersRaw.forEach((layerRaw, i) => {
      const layer = (layerRaw ?? {}) as Partial<LayeredLayer>;
      const id = typeof layer.id === 'string' ? layer.id : '';
      if (!ID_RE.test(id)) issues.push(`第 ${i + 1} 层 id 必须是小写英文开头（收到 ${JSON.stringify(id)}）`);
      if (layerOrder.includes(id)) issues.push(`层 id 重复：${id}`);
      layerOrder.push(id);
      if (typeof layer.name !== 'string' || !layer.name.trim()) issues.push(`层「${id}」缺 name`);
      if (layer.subtitle !== undefined && typeof layer.subtitle !== 'string') {
        issues.push(`层「${id}」subtitle 必须是字符串`);
      }
      if (layer.order !== undefined) {
        if (typeof layer.order !== 'number' || !Number.isInteger(layer.order) || layer.order < 1) {
          issues.push(`层「${id}」order 必须是 ≥1 的整数`);
        } else if (seenOrders.has(layer.order)) {
          issues.push(`order 重复：${layer.order}（${seenOrders.get(layer.order)}/${id}）`);
        } else {
          seenOrders.set(layer.order, id);
        }
      }
      const nodes = Array.isArray(layer.nodes) ? layer.nodes : [];
      if (nodes.length === 0) issues.push(`层「${id}」至少 1 个节点`);
      if (nodes.length > LAYER_LIMITS.maxNodesPerLayer) {
        issues.push(`层「${id}」节点数 ${nodes.length} 超过上限 ${LAYER_LIMITS.maxNodesPerLayer}（超出合并同类）`);
      }
      nodes.forEach((nodeRaw, j) => {
        const node = (nodeRaw ?? {}) as Partial<LayeredNode>;
        const nid = typeof node.id === 'string' ? node.id : '';
        if (!ID_RE.test(nid)) issues.push(`层「${id}」第 ${j + 1} 个节点 id 须小写英文（收到 ${JSON.stringify(nid)}）`);
        if (nodeIds.has(nid)) issues.push(`节点 id 重复：${nid}`);
        nodeIds.add(nid);
        if (typeof node.name !== 'string' || !node.name.trim()) {
          issues.push(`层「${id}」第 ${j + 1} 个节点缺 name`);
        }
        if (node.detail !== undefined && typeof node.detail !== 'string') {
          issues.push(`层「${id}」节点「${nid}」detail 必须是字符串`);
        }
        if (node.role !== undefined && node.role !== 'core') {
          issues.push(`层「${id}」节点「${nid}」role 只允许 "core"`);
        }
      });
    });
  }

  const connRaw = d.connections;
  if (connRaw !== undefined && !Array.isArray(connRaw)) issues.push('connections 必须是数组');
  if (Array.isArray(connRaw)) {
    if (connRaw.length > LAYER_LIMITS.maxConnections) {
      issues.push(`连线数 ${connRaw.length} 超过上限 ${LAYER_LIMITS.maxConnections}`);
    }
    connRaw.forEach((cRaw, k) => {
      const c = (cRaw ?? {}) as Partial<LayeredConnection>;
      const from = typeof c.from === 'string' ? c.from : '';
      const to = typeof c.to === 'string' ? c.to : '';
      if (!from || !to) {
        issues.push(`第 ${k + 1} 条连线缺 from/to`);
        return;
      }
      if (!layerOrder.includes(from) || !layerOrder.includes(to)) {
        issues.push(`连线 ${from}→${to} 引用了不存在的层`);
        return;
      }
      const iFrom = layerOrder.indexOf(from);
      const iTo = layerOrder.indexOf(to);
      if (iTo !== iFrom + 1) {
        issues.push(`连线 ${from}→${to} 必须连接相邻两层（自上而下）`);
      }
      if (c.label !== undefined && typeof c.label !== 'string') {
        issues.push(`连线 ${from}→${to} 的 label 必须是字符串`);
      }
    });
  }

  const rules = d.rules;
  if (rules !== undefined && (!Array.isArray(rules) || rules.some((r) => typeof r !== 'string'))) {
    issues.push('rules 必须是字符串数组');
  }
  return { ok: issues.length === 0, issues };
}
