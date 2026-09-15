/**
 * pm-xmind 纯格式核心（E340）
 * .xmind = zip 包，树结构存 content.json（根 sheet.rootTopic）。仓库已依赖 jszip，零新依赖。
 * 文本大纲支持三种写法：WBS 编号（1. / 1.1. / 1.1.2）、缩进、- / * 列表。
 */

import JSZip from 'jszip';

export interface MindNode {
  id: string;
  title: string;
  children: MindNode[];
}

/** 文本大纲中的一行：level = 相对层级（0 为中心主题），title = 节点文字 */
export interface OutlineItem {
  level: number;
  title: string;
}

let idSeq = 0;

/** 生成 Xmind 可接受的唯一 id（字母数字 + -，避免特殊字符） */
export function nextId(): string {
  idSeq += 1;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `n${Date.now().toString(36)}${idSeq.toString(36)}${rnd}`;
}

export function createNode(title: string, children: MindNode[] = []): MindNode {
  return { id: nextId(), title, children };
}

/** 缩进列宽：tab 记 2 格，供层级换算 */
function indentCol(line: string): number {
  const m = /^[ \t]*/.exec(line)?.[0] ?? '';
  let col = 0;
  for (const ch of m) col += ch === '\t' ? 2 : 1;
  return col;
}

/** 尝试把一行识别为大纲条目；不可识别返回 null */
function classifyLine(line: string): OutlineItem | null {
  const trimmed = line.replace(/\s+$/u, '');
  if (!trimmed.trim()) return null;
  // WBS 编号：1 / 1.1 / 1.2.3 开头，分隔符为 . 、 ． : ： - — 或空白
  const wbs = /^\s*(\d+(?:\.\d+)*)\s*([.、．:：\-—)]\s*|\s+)(.*)$/.exec(trimmed);
  if (wbs) {
    const levels = wbs[1].split('.').length;
    const title = wbs[3].trim();
    if (!title) return null;
    return { level: levels, title };
  }
  const col = indentCol(trimmed);
  const bullet = /^([ \t]*)[-*•]\s+(.*)$/.exec(trimmed);
  if (bullet) {
    const title = bullet[2].trim();
    if (!title) return null;
    return { level: 1 + Math.floor(col / 2), title };
  }
  const plain = /^[^ \t].*$/.test(trimmed) || col > 0;
  if (plain && trimmed.trim()) {
    const title = trimmed.trim();
    // 纯编号行（如 “1.2”）没有文字，不作为条目
    if (/^\d+(?:\.\d+)*[.、．:：\-—)]?\s*$/.test(title)) return null;
    return { level: col > 0 ? Math.floor(col / 2) : 0, title };
  }
  return null;
}

/** 提取“把 X 做成思维导图”里的主题词；没有则返回 null（由调用方决定默认主题） */
export function extractCentralTitle(text: string): string | null {
  const m =
    /(?:把|将)\s*([^，。；：:、\n]{1,28}?)(?:的)?(?:任务|工作|内容|文本|计划|事项|项目)?\s*(?:拆解|整理|做成|整理成|制作|生成|画|转为|转化为|转成|导出)?\s*(?:成\s*)?(?:思维导图|xmind|脑图|mind\s*map|\.xmind)/i.exec(
      text,
    );
  if (!m) return null;
  const subject = m[1]
    .replace(/^(这个|以下|下面|下列|这些|上面|上述|这份|那个)/u, '')
    .trim();
  if (!subject || subject.length > 20) return null;
  return subject;
}

function isLeadInstruction(title: string): boolean {
  return /^(?:帮|请|把|将|按|根据|给我|帮我|请将|请把|用|下面|以下|这个|这些|生成|创建|绘制|制作|整理|转为|转成|导出)/u.test(
    title,
  );
}

function isTrailInstruction(title: string): boolean {
  return /思维导图|xmind|脑图|mind\s*map|\.xmind|生成|创建|制作|整理成|转为|转成|导出|保存|输出|写到|落盘|拆解成/u.test(
    title,
  );
}

/** 把全文切分为大纲条目（跳开引导/收尾说明行），找不到任何结构返回空数组 */
export function parseOutlineItems(text: string): OutlineItem[] {
  const lines = text.split(/\r?\n/u);
  const kept: OutlineItem[] = [];
  let sawStructure = false;
  for (const line of lines) {
    const item = classifyLine(line);
    if (!item) continue;
    // 开头引导句（“帮我把下面内容做成思维导图：”）在结构条目出现前不参与建树
    if (!sawStructure && item.level === 0 && isLeadInstruction(item.title)) continue;
    if (!sawStructure && item.level > 0) {
      sawStructure = true;
      kept.push(item);
      continue;
    }
    if (item.level === 0) {
      // 结构出现后的收尾指引（“以上内容帮我生成 Xmind 文件”）不参与建树
      if (sawStructure && isTrailInstruction(item.title)) continue;
      // 首个纯文本行即中心主题；其后出现的纯文本行视为同级分支（补缩进习惯）
      if (sawStructure) item.level = 1;
      sawStructure = true;
    }
    kept.push(item);
  }
  return kept;
}

/**
 * 文本大纲 → 单根 MindNode 树。
 * 首行中心主题缺省时：尝试从“把 X 做成思维导图”提取主题，无则用“任务拆解”。
 * 解析不出任何结构返回 null。
 */
export function parseOutlineToTree(text: string): MindNode | null {
  const items = parseOutlineItems(text);
  if (items.length === 0) return null;

  const rootTitle =
    items[0].level > 0
      ? extractCentralTitle(text) ?? '任务拆解'
      : items[0].title;
  const root = createNode(rootTitle);

  // 栈式挂接：栈底为中心主题，栈长 = 当前路径深度 + 1
  const stack: MindNode[] = [root];
  for (let i = 0; i < items.length; i += 1) {
    if (i === 0 && items[0].level === 0) continue; // 首行已是中心主题
    const item = items[i];
    let depth = item.level;
    if (depth <= 0) depth = 1; // 中心主题之后出现纯文本行 → 视为一级分支
    const maxDepth = stack.length; // 允许成为当前最深节点的子节点
    if (depth > maxDepth) depth = maxDepth; // 跳级（编号缺层）按最深挂
    while (stack.length - 1 >= depth) stack.pop(); // 回退到同级父节点
    const node = createNode(item.title);
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root;
}

/** 树 → 文本大纲（中心主题 + WBS 编号行） */
export function treeToOutlineText(root: MindNode): string {
  const lines: string[] = [root.title];
  const walk = (children: MindNode[], prefix: number[]): void => {
    children.forEach((child, idx) => {
      const path = [...prefix, idx + 1];
      lines.push(`${path.join('.')} ${child.title}`);
      walk(child.children, path);
    });
  };
  walk(root.children, []);
  return lines.join('\n');
}

/** 统计大纲规模：内容节点数（不含中心主题）与最大层深（中心主题=1） */
function outlineStats(root: MindNode): { nodeCount: number; depth: number } {
  let nodeCount = 0;
  let depth = 1;
  const walk = (children: MindNode[], level: number): void => {
    for (const child of children) {
      nodeCount += 1;
      depth = Math.max(depth, level);
      walk(child.children, level + 1);
    }
  };
  walk(root.children, 2);
  return { nodeCount, depth };
}

/** E344：清洗 LLM 生成大纲中的杂质叶子——与中心主题重复的标题、文末“（证据未覆盖/说明…）”式
 * 注释（只删叶子，不丢任何子结构），返回新树，不改入参。 */
export function sanitizeOutlineTree(root: MindNode): MindNode {
  const cloneNode = (n: MindNode): MindNode => ({
    id: n.id,
    title: n.title,
    children: n.children.map(cloneNode),
  });
  const tree = cloneNode(root);
  const junkNote =
    /^[（(](?:证据|注[：:]?|备注|说明)[^）)]{0,90}[）)]$/;
  const prune = (node: MindNode): void => {
    node.children = node.children.filter(
      (c) =>
        !(
          c.children.length === 0 &&
          (c.title.trim() === tree.title.trim() || junkNote.test(c.title.trim()))
        ),
    );
    for (const c of node.children) prune(c);
  };
  prune(tree);
  return tree;
}

/** E344：内容型思维导图的紧凑交付预览——中心主题 + 一级分支（带子项数）+ 规模提示。 */
export function buildOutlinePreviewText(root: MindNode): string {
  const { nodeCount, depth } = outlineStats(root);
  const lines = [
    `已把「${root.title}」整理成思维导图大纲：共 ${root.children.length} 个一级分支、${nodeCount} 个内容节点（${depth} 层），完整层级在批准生成的 .xmind 中。`,
    '',
  ];
  root.children.forEach((c, i) => {
    const sub = c.children.length > 0 ? `（${c.children.length} 个分支）` : '';
    lines.push(`${i + 1}. ${c.title}${sub}`);
  });
  return lines.join('\n');
}
interface XmindTopicLike {
  id?: string;
  class?: string;
  title?: string;
  children?: { attached?: XmindTopicLike[]; detached?: XmindTopicLike[] };
}

function toXmindTopic(node: MindNode): XmindTopicLike {
  return {
    id: node.id,
    class: 'topic',
    title: node.title,
    ...(node.children.length > 0
      ? { children: { attached: node.children.map((c) => toXmindTopic(c)) } }
      : {}),
  };
}

/**
 * 生成 .xmind zip Buffer（content.json / metadata.json / manifest.json）。
 * 结构遵循 Xmind 2020+ 格式：根数组为 sheet，sheet.rootTopic 为中心主题。
 */
export async function buildXmindBuffer(root: MindNode): Promise<Buffer> {
  const zip = new JSZip();
  const sheet = {
    id: nextId(),
    class: 'sheet',
    title: root.title,
    rootTopic: toXmindTopic(root),
  };
  zip.file('content.json', JSON.stringify([sheet]));
  zip.file(
    'metadata.json',
    JSON.stringify({ creator: { name: 'AI-Butler', version: '0.1.0' } }),
  );
  zip.file(
    'manifest.json',
    JSON.stringify({ 'file-entries': { 'content.json': {}, 'metadata.json': {} } }),
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

function fromXmindTopic(topic: XmindTopicLike): MindNode {
  const children = [
    ...(topic.children?.attached ?? []),
    ...(topic.children?.detached ?? []),
  ].map((c) => fromXmindTopic(c));
  return createNode(typeof topic.title === 'string' ? topic.title : '', children);
}

/** 解包 .xmind：取第一个 sheet 的根话题转回 MindNode；不是合法 xmind 返回 null */
export async function parseXmindBuffer(buf: Buffer | ArrayBuffer): Promise<MindNode | null> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const entry = zip.file('content.json');
    if (!entry) return null;
    const raw = JSON.parse(await entry.async('string')) as unknown;
    const sheets: Array<Record<string, unknown>> = Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>)
      : Array.isArray((raw as { sheets?: unknown }).sheets)
        ? ((raw as { sheets: unknown }).sheets as Array<Record<string, unknown>>)
        : [raw as Record<string, unknown>];
    const sheet = sheets.find((s) => s && typeof s === 'object' && s.rootTopic) ?? sheets[0];
    if (!sheet) return null;
    const topic = (sheet.rootTopic ?? sheet) as XmindTopicLike;
    if (!topic || typeof topic !== 'object') return null;
    return fromXmindTopic(topic);
  } catch {
    return null; // 非 zip / JSON 损坏均视为不可读
  }
}