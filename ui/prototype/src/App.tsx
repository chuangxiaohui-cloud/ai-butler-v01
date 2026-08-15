import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  Code2,
  Cpu,
  FileText,
  Globe,
  HeartPulse,
  PanelBottom,
  PenLine,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  User,
  Wrench,
} from 'lucide-react';

type TabKey = 'engineering' | 'knowledge' | 'life';
type Mode = 'ask' | 'craft' | 'plan';

interface Evidence {
  type: 'file' | 'terminal' | 'test' | 'search';
  label: string;
  detail: string;
  hard?: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'agent';
  text: string;
  evidence?: Evidence[];
  meta?: string;
}

const TABS: Array<{ key: TabKey; label: string; short: string; icon: typeof Code2 }> = [
  { key: 'engineering', label: '工程开发', short: '工程', icon: Code2 },
  { key: 'knowledge', label: '知识咨询', short: '知识', icon: BookOpen },
  { key: 'life', label: '生活助手', short: '生活', icon: HeartPulse },
];

const MODES: Array<{ key: Mode; label: string; hint: string }> = [
  { key: 'ask', label: 'Ask', hint: '只看不改' },
  { key: 'craft', label: 'Craft', hint: '直接干' },
  { key: 'plan', label: 'Plan', hint: '先出方案' },
];

const INITIAL_MESSAGES: Record<TabKey, Message[]> = {
  engineering: [
    {
      id: 'eng-user-1',
      role: 'user',
      text: '帮我在 KiCad 里画 STM32F103C8T6 最小系统原理图',
    },
    {
      id: 'eng-agent-1',
      role: 'agent',
      meta: 'PM 拆解 → 架构师审查 → 子 Agent 执行',
      text:
        '我把任务拆成 4 步：① 引脚与电源规划；② 晶振/复位/BOOT 电路；③ 最小系统网络表；④ 原理图规则检查。KiCad 子 Agent 正在执行，完成后我会给你审查报告。',
      evidence: [
        { type: 'file', label: 'hardware/stm32-min.kicad_sch', detail: 'STM32F103C8T6 最小系统：电源/晶振/复位', hard: true },
        { type: 'terminal', label: 'erc.log:128', detail: 'ERC 0 Error(s), 0 Warning(s)' },
        { type: 'test', label: 'netlist-smoke', detail: '电源网络与 ST 官方参考一致' },
      ],
    },
  ],
  knowledge: [
    {
      id: 'know-user-1',
      role: 'user',
      text: 'STM32F103C8T6 最大主频是多少？',
    },
    {
      id: 'know-agent-1',
      role: 'agent',
      meta: '结论：72MHz · 置信度 88%',
      text:
        'STM32F103C8T6 最高主频为 72MHz，内核为 Arm Cortex-M3，64KB Flash、16KB SRAM。官方数据手册是最权威来源，立创/芯查查/半导小芯可作国内快速核对入口。',
      evidence: [
        { type: 'search', label: '[hard] ST 官网产品页', detail: 'www.st.com/stm32f103c8.html', hard: true },
        { type: 'search', label: '[soft] 立创商城资料页', detail: 'item.szlcsc.com/9243.html' },
        { type: 'search', label: '[soft] 芯查查物料页', detail: 'www.xcc.com/chip/material/search?title=STM32F103C8T6' },
      ],
    },
  ],
  life: [
    {
      id: 'life-user-1',
      role: 'user',
      text: '最近压力大，晚上一直睡不好',
    },
    {
      id: 'life-agent-1',
      role: 'agent',
      meta: '秘书模式 · 不评判 · 给可执行动作',
      text:
        '先别急，我们分三步走：把手机放到另一个房间；今晚固定 23:00 前躺下，只做 10 分钟腹式呼吸；明早记录一次醒来的时间。连续三天没改善，我们再一起看睡眠环境或作息。',
    },
  ],
};

const SUBAGENTS = [
  { name: 'KiCad', category: 'EDA', status: '运行中' },
  { name: 'LTspice', category: '仿真', status: '待命' },
  { name: 'Keil', category: '编码', status: '待命' },
  { name: 'FreeCAD', category: '结构', status: '待命' },
];

const PRODUCTS = [
  { name: 'hardware/stm32-min.kicad_sch', state: '生成中', risk: '低' },
  { name: 'hardware/stm32-min.net', state: '待检查', risk: '中' },
  { name: 'docs/min-system-checklist.md', state: '草稿', risk: '低' },
];

function ReplyDraft(tab: TabKey, mode: Mode, input: string): Message {
  const base: { text: string; evidence: Evidence[] } =
    tab === 'engineering'
      ? {
          text:
            mode === 'plan'
              ? '我先给出方案拆解与验收标准，再让对应子 Agent 执行。'
              : mode === 'craft'
                ? '我直接开始执行，并把每一步产物与检查日志放在右侧。'
                : '我先只做分析与取证，不改动任何项目文件。',
          evidence: [
            { type: 'file', label: 'hardware/next-task.kicad_sch', detail: input.slice(0, 40) },
            { type: 'terminal', label: 'task-run.log:1', detail: '子 Agent 任务队列已建立' },
          ],
        }
      : tab === 'knowledge'
        ? {
            text:
              mode === 'plan'
                ? '我会先拆出需要查证的子问题，再逐条给出证据链。'
                : mode === 'craft'
                  ? '我直接生成结论和可复制的资料清单，证据都带来源。'
                  : '我先把问题范围界定清楚，再回答，不急着给结论。',
            evidence: [
              { type: 'search', label: '[hard] 官方资料', detail: '厂商官网/数据手册', hard: true },
              { type: 'search', label: '[soft] 国内资料站', detail: '立创 / 芯查查 / 半导小芯' },
            ],
          }
        : {
            text:
              mode === 'plan'
                ? '我会先陪你把情况理清楚，再给一个可执行的小计划。'
                : mode === 'craft'
                  ? '我直接给你现在就能做的一小步。'
                  : '我先听你说完，不做判断，只陪你一起看。',
            evidence: [],
          };
  return {
    id: `reply-${Date.now()}`,
    role: 'agent',
    text: base.text,
    evidence: base.evidence,
    meta: `${TABS.find((t) => t.key === tab)?.label} · ${MODES.find((m) => m.key === mode)?.label}`,
  };
}

function App() {
  const [tab, setTab] = useState<TabKey>('engineering');
  const [mode, setMode] = useState<Mode>('ask');
  const [messages, setMessages] = useState<Record<TabKey, Message[]>>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [liked, setLiked] = useState<Record<string, boolean>>({});

  const activeMessages = messages[tab];
  const activeTab = TABS.find((t) => t.key === tab)!;
  const ActiveIcon = activeTab.icon;

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', text };
    const reply = ReplyDraft(tab, mode, text);
    setMessages((prev) => ({
      ...prev,
      [tab]: [...prev[tab], userMsg, reply],
    }));
    setInput('');
  };

  const stats = useMemo(
    () => ({
      engineering: 4,
      knowledge: 3,
      life: 1,
    }),
    [],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Bot size={20} />
          </div>
          <div>
            <div className="brand-name">一人公司 AI-Agent</div>
            <div className="brand-sub">v1.0 三栏 UI 原型</div>
          </div>
        </div>
        <div className="top-actions">
          <div className="status-pill">
            <ShieldCheck size={14} />
            QQ 会话已连接
          </div>
          <button className="icon-button" aria-label="搜索">
            <Search size={17} />
          </button>
          <button className="icon-button" aria-label="通知">
            <Bell size={17} />
          </button>
          <button className="icon-button" aria-label="设置">
            <Settings size={17} />
          </button>
        </div>
      </header>

      <div className="workspace">
        <nav className="rail" aria-label="内容领域">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={`rail-item ${tab === item.key ? 'active' : ''}`}
                onClick={() => setTab(item.key)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                <small>{stats[item.key]} 项</small>
              </button>
            );
          })}
        </nav>

        <main className="main">
          <div className="workspace-head">
            <div className="head-title">
              <ActiveIcon size={20} />
              <h1>{activeTab.label}</h1>
            </div>
            <div className="mode-switch" role="group" aria-label="执行方式">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  className={mode === m.key ? 'active' : ''}
                  onClick={() => setMode(m.key)}
                >
                  {m.label}
                  <small>{m.hint}</small>
                </button>
              ))}
            </div>
          </div>

          {tab === 'engineering' ? (
            <div className="engineering-grid">
              <aside className="roles-panel panel">
                <div className="panel-head">
                  <Cpu size={16} />
                  <h2>角色与子 Agent</h2>
                </div>
                <div className="role-card">
                  <div className="role-avatar">
                    <User size={17} />
                  </div>
                  <div>
                    <strong>项目经理</strong>
                    <span>拆解 · 调度 · 审查</span>
                  </div>
                </div>
                <div className="subagent-list">
                  {SUBAGENTS.map((agent) => (
                    <div className="subagent" key={agent.name}>
                      <div className="agent-icon">
                        <Wrench size={15} />
                      </div>
                      <div>
                        <strong>{agent.name}</strong>
                        <span>{agent.category}</span>
                      </div>
                      <em className={agent.status === '运行中' ? 'running' : ''}>{agent.status}</em>
                    </div>
                  ))}
                </div>
              </aside>

              <section className="chat-panel panel">
                <div className="message-list">
                  {activeMessages.map((msg) => (
                    <MessageItem
                      key={msg.id}
                      msg={msg}
                      liked={liked[msg.id]}
                      onLike={(value) => setLiked((prev) => ({ ...prev, [msg.id]: value }))}
                    />
                  ))}
                </div>
                <Composer value={input} onChange={setInput} onSend={send} />
              </section>

              <aside className="products-panel panel">
                <div className="panel-head">
                  <FileText size={16} />
                  <h2>产物区</h2>
                </div>
                <div className="product-list">
                  {PRODUCTS.map((p) => (
                    <div className="product" key={p.name}>
                      <div>
                        <strong>{p.name}</strong>
                        <span>{p.state}</span>
                      </div>
                      <em>{p.risk === '低' ? '低风险' : '中风险'}</em>
                    </div>
                  ))}
                </div>
                <div className="review-box">
                  <CheckCircle2 size={16} />
                  <div>
                    <strong>审查报告</strong>
                    <span>等待子 Agent 完成 ERC</span>
                  </div>
                </div>
              </aside>

              <div className="bottom-dock">
                <div className="dock-tabs">
                  <button
                    className={terminalOpen ? 'active' : ''}
                    onClick={() => {
                      setTerminalOpen(true);
                      setBrowserOpen(false);
                    }}
                  >
                    <Terminal size={15} />
                    内置终端
                  </button>
                  <button
                    className={browserOpen ? 'active' : ''}
                    onClick={() => {
                      setBrowserOpen(true);
                      setTerminalOpen(false);
                    }}
                  >
                    <Globe size={15} />
                    内置浏览器
                  </button>
                  <span className="dock-spacer" />
                  <button className="dock-mini" aria-label="折叠">
                    <ChevronDown size={15} />
                  </button>
                </div>
                {terminalOpen && (
                  <pre className="terminal-output">
                    {`$ kicad-cli sch erc hardware/stm32-min.kicad_sch\n[INFO] 检查 12 条电源规则\n[PASS] VDD 3.3V 网络已连接\n[PASS] VDDA 与 VREF 去耦电容已放置\n[PASS] ERC 0 Error(s), 0 Warning(s)`}
                  </pre>
                )}
                {browserOpen && (
                  <div className="browser-preview">
                    <div className="browser-bar">
                      <span>https://item.szlcsc.com/9243.html</span>
                      <ArrowUpRight size={14} />
                    </div>
                    <div className="browser-body">
                      <strong>STM32F103C8T6 · 数据手册下载</strong>
                      <span>来源：立创商城 · 官方 PDF 已由 QQ 会话下载并校验</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="chat-layout">
              <section className="chat-panel panel">
                <div className="message-list">
                  {activeMessages.map((msg) => (
                    <MessageItem
                      key={msg.id}
                      msg={msg}
                      liked={liked[msg.id]}
                      onLike={(value) => setLiked((prev) => ({ ...prev, [msg.id]: value }))}
                    />
                  ))}
                </div>
                <Composer value={input} onChange={setInput} onSend={send} />
              </section>

              <aside className="context-panel panel">
                {tab === 'knowledge' ? (
                  <>
                    <div className="panel-head">
                      <Sparkles size={16} />
                      <h2>证据链</h2>
                    </div>
                    <div className="evidence-note">
                      <ShieldCheck size={16} />
                      <div>
                        <strong>[hard]</strong>
                        <span>ST 官网 · 数据手册</span>
                      </div>
                    </div>
                    <div className="evidence-note soft">
                      <BookOpen size={16} />
                      <div>
                        <strong>[soft]</strong>
                        <span>立创 / 芯查查 / 半导小芯</span>
                      </div>
                    </div>
                    <div className="meta-line">
                      <Clock size={14} />
                      <span>强时效查询自动补官方源</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="panel-head">
                      <HeartPulse size={16} />
                      <h2>秘书备注</h2>
                    </div>
                    <div className="persona-note">
                      <strong>贴身女秘书</strong>
                      <span>只陪伴、不评判；紧急情况先给本地可执行步骤。</span>
                    </div>
                    <div className="meta-line">
                      <Clock size={14} />
                      <span>紧急安全走本地知识库快速通道</span>
                    </div>
                  </>
                )}
                <div className="shortcut-list">
                  <div className="shortcut-head">快捷操作</div>
                  <button>
                    <PanelBottom size={15} />
                    打开终端
                  </button>
                  <button>
                    <Search size={15} />
                    站内搜索
                  </button>
                  <button>
                    <PenLine size={15} />
                    修改建议
                  </button>
                </div>
              </aside>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function MessageItem({
  msg,
  liked,
  onLike,
}: {
  msg: Message;
  liked: boolean | undefined;
  onLike: (value: boolean) => void;
}) {
  const isUser = msg.role === 'user';
  return (
    <article className={`message ${isUser ? 'user' : 'agent'}`}>
      <div className="message-avatar">
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className="message-body">
        {msg.meta && <div className="message-meta">{msg.meta}</div>}
        <div className="message-text">{msg.text}</div>
        {msg.evidence && msg.evidence.length > 0 && (
          <div className="evidence-list">
            {msg.evidence.map((ev, i) => (
              <button className="evidence-chip" key={`${ev.label}-${i}`}>
                <span>{ev.type === 'search' ? (ev.hard ? 'H' : 'S') : ev.type === 'file' ? 'F' : ev.type === 'terminal' ? 'T' : 'C'}</span>
                <div>
                  <strong>{ev.label}</strong>
                  <small>{ev.detail}</small>
                </div>
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
        )}
        {!isUser && (
          <div className="feedback-row">
            <button
              className={liked === true ? 'liked' : ''}
              aria-label="赞"
              onClick={() => onLike(true)}
            >
              <ThumbsUp size={14} />
            </button>
            <button
              className={liked === false ? 'disliked' : ''}
              aria-label="踩"
              onClick={() => onLike(false)}
            >
              <ThumbsDown size={14} />
            </button>
            <button aria-label="修改建议">
              <PenLine size={14} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function Composer({
  value,
  onChange,
  onSend,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="composer">
      <textarea
        value={value}
        placeholder="输入你的问题或任务…"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
      />
      <button className="send-button" onClick={onSend} aria-label="发送">
        <Send size={17} />
      </button>
    </div>
  );
}

export default App;
