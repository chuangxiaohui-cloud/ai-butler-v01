/**
 * E360：Archify architecture JSON 的内容语义自检（本地确定性，零 LLM）。
 * validate 只查版式（clean-flow/layout），不查「谁连谁的库、回调/异步边是否指向库」这类语义；
 * 本检查在交付前兜底，防止「版式合格但拓扑画错」的图被直接交付。
 */

export type SemanticIssueCode =
  | 'orphan-database'
  | 'cross-write-database'
  | 'owner-database-unconnected'
  | 'async-edge-to-database'
  | 'service-leaf';

export interface SemanticIssue {
  code: SemanticIssueCode;
  message: string;
}

export interface SemanticCheckResult {
  ok: boolean;
  issues: SemanticIssue[];
}

type JsonObject = Record<string, unknown>;

interface NodeLike {
  id: string;
  type: string;
  label: string;
}

interface EdgeLike {
  from: string;
  to: string;
  label: string;
  variant: string;
}

function isObj(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

const BACKEND_TYPES = new Set(['backend', 'service', 'cloud', 'security']);
const DATABASE_TYPES = new Set(['database']);

/** 词干：order-svc/order-db/order-service → order（归属匹配用） */
function ownerKey(id: string): string {
  return id.replace(
    /-(?:svc|service|server|api|app|worker|backend|db|database|store|mysql|postgres|mongo|repository)$/i,
    '',
  );
}

function parseNodes(obj: JsonObject): NodeLike[] {
  const raw = obj.components;
  if (!Array.isArray(raw)) return [];
  const out: NodeLike[] = [];
  for (const item of raw) {
    if (!isObj(item)) continue;
    const id = item.id;
    const type = item.type;
    const label = item.label;
    if (isStr(id) && isStr(type)) out.push({ id, type, label: isStr(label) ? label : id });
  }
  return out;
}

function parseEdges(obj: JsonObject): EdgeLike[] {
  const raw = obj.connections;
  if (!Array.isArray(raw)) return [];
  const out: EdgeLike[] = [];
  for (const item of raw) {
    if (!isObj(item)) continue;
    const { from, to } = item;
    if (!isStr(from) || !isStr(to)) continue;
    out.push({
      from,
      to,
      label: isStr(item.label) ? item.label : '',
      variant: isStr(item.variant) ? item.variant : '',
    });
  }
  return out;
}

const ASYNC_LABEL_HINT = /结果|回调|通知|回执|确认|异步|事件|callback|notify|ack|result|event/i;

/**
 * 检查 architecture JSON 的拓扑语义。返回 ok=false 时 issues 说明问题；
 * 无 database 组件或非 architecture 图型直接视为通过（规则只约束含库的微服务架构图）。
 */
export function checkArchitectureSemantics(obj: unknown): SemanticCheckResult {
  const issues: SemanticIssue[] = [];
  if (!isObj(obj) || obj.diagram_type !== 'architecture') return { ok: true, issues };

  const nodes = parseNodes(obj);
  const edges = parseEdges(obj);
  const dbs = nodes.filter((n) => DATABASE_TYPES.has(n.type));
  if (dbs.length === 0) return { ok: true, issues };

  const svcs = nodes.filter((n) => BACKEND_TYPES.has(n.type));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, number>();
  for (const e of edges) {
    outgoing.set(e.from, (outgoing.get(e.from) ?? 0) + 1);
  }

  const push = (code: SemanticIssueCode, message: string): void => {
    issues.push({ code, message });
  };

  for (const db of dbs) {
    const dbKey = ownerKey(db.id);
    const incoming = edges.filter((e) => e.to === db.id);
    const owners = svcs.filter((s) => ownerKey(s.id) === dbKey);
    const foreignIncoming = incoming.filter((e) => {
      const src = byId.get(e.from);
      return src !== undefined && BACKEND_TYPES.has(src.type) && !owners.some((o) => o.id === e.from);
    });

    if (incoming.length === 0) {
      push('orphan-database', `数据库「${db.label || db.id}」没有任何连线接入，是孤儿节点——应被它的归属服务以实线读写连接。`);
      continue;
    }
    const ownerConnected = owners.some((o) => incoming.some((e) => e.from === o.id));
    if (owners.length > 0 && !ownerConnected && foreignIncoming.length > 0) {
      push(
        'owner-database-unconnected',
        `数据库「${db.label || db.id}」只被非归属服务连接（${foreignIncoming.map((e) => `「${byId.get(e.from)?.label ?? e.from}」`).join('、')}），归属服务（${owners.map((o) => `「${o.label || o.id}」`).join('、')}）反而没有连自己的库——主数据「无家可归」。`,
      );
    } else if (owners.length > 0 && ownerConnected && foreignIncoming.length > 0) {
      push(
        'cross-write-database',
        `数据库「${db.label || db.id}」归属「${owners[0].label || owners[0].id}」，但仍被${foreignIncoming.map((e) => `「${byId.get(e.from)?.label ?? e.from}」`).join('、')}直连——服务不得跨写别人的库。`,
      );
    }
  }

  for (const e of edges) {
    if (e.variant !== 'dashed') continue;
    const dst = byId.get(e.to);
    if (dst && DATABASE_TYPES.has(dst.type) && ASYNC_LABEL_HINT.test(e.label)) {
      push(
        'async-edge-to-database',
        `虚线「${e.label || e.from + '→' + e.to}」（${byId.get(e.from)?.label ?? e.from} → 数据库「${dst.label || dst.id}」）终点是数据库——结果/回调/通知类异步边终点必须是 MQ 或业务服务，严禁落库。`,
      );
    }
  }

  for (const s of svcs) {
    if ((outgoing.get(s.id) ?? 0) === 0) {
      push('service-leaf', `服务「${s.label || s.id}」没有任何出边，是死胡同——要么连自己的库/下游中间件，要么补外部依赖。`);
    }
  }

  return { ok: issues.length === 0, issues };
}
