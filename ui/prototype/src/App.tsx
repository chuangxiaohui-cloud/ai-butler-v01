import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpRight,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronLeft,
  Code2,
  Database,
  FileText,
  FolderKanban,
  FolderOpen,
  Globe,
  HeartPulse,
  Image,
  Layers,
  MessageSquare,
  PanelRight,
  Paperclip,
  PenLine,
  Plug,
  Plus,
  Route,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  User,
  X,
  Zap,
} from 'lucide-react';

type UiMode = 'engineering' | 'knowledge' | 'life';
type RightTab = 'files' | 'browser' | 'terminal';
type SettingsKey = 'providers' | 'security' | 'routing' | 'skills' | 'memory' | 'usage';

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
  images?: string[];
  evidence?: Evidence[];
  meta?: string;
}

interface ModelOption {
  id: string;
  provider: string;
  label: string;
  note: string;
}

interface Attachment {
  name: string;
  type: string;
  dataUrl: string;
}

const MODES: Array<{ key: UiMode; label: string; icon: LucideIcon }> = [
  { key: 'engineering', label: '工程开发', icon: Code2 },
  { key: 'knowledge', label: '知识咨询', icon: BookOpen },
  { key: 'life', label: '生活助手', icon: HeartPulse },
];

const SUBMODE_LABELS: Record<string, string> = {
  product_planning: '产品规划',
  review_critique: '代码审查',
};

const FALLBACK_MODELS: ModelOption[] = [
  { id: 'deepseek:heavy', provider: 'DeepSeek', label: 'deepseek-chat', note: '旗舰 · 推理' },
  { id: 'deepseek:medium', provider: 'DeepSeek', label: 'deepseek-chat', note: '均衡' },
  { id: 'deepseek:light', provider: 'DeepSeek', label: 'deepseek-chat', note: '快速' },
  { id: 'zhipu:heavy', provider: '智谱', label: 'glm-5.3', note: '旗舰' },
  { id: 'zhipu:medium', provider: '智谱', label: 'glm-5.2', note: '均衡' },
  { id: 'zhipu:light', provider: '智谱', label: 'glm-5-turbo', note: '快速' },
];

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://127.0.0.1:8787';

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'welcome-user',
    role: 'user',
    text: '帮我在 KiCad 里画 STM32F103C8T6 最小系统原理图',
  },
  {
    id: 'welcome-agent',
    role: 'agent',
    meta: '工程开发 · 产品规划 → 架构师执行',
    text:
      '我把任务拆成 4 步：① 引脚与电源规划；② 晶振/复位/BOOT 电路；③ 最小系统网络表；④ 原理图规则检查。KiCad 子 Agent 正在执行，完成后我会给你审查报告。',
    evidence: [
      { type: 'file', label: 'hardware/stm32-min.kicad_sch', detail: 'STM32F103C8T6 最小系统：电源/晶振/复位', hard: true },
      { type: 'terminal', label: 'erc.log:128', detail: 'ERC 0 Error(s), 0 Warning(s)' },
      { type: 'test', label: 'netlist-smoke', detail: '电源网络与 ST 官方参考一致' },
    ],
  },
];

const MOCK_PROJECTS = [
  {
    id: 'p1',
    name: 'STM32 最小系统',
    mode: 'engineering' as UiMode,
    updated: '10 分钟前',
    sessions: ['原理图绘制', '电源审查'],
  },
  {
    id: 'p2',
    name: 'LED 驱动选型',
    mode: 'knowledge' as UiMode,
    updated: '昨天',
    sessions: ['芯片参数核对'],
  },
  {
    id: 'p3',
    name: '会议室预约',
    mode: 'life' as UiMode,
    updated: '2 天前',
    sessions: ['下周排期'],
  },
];

const TERMINAL_LINES = [
  '$ kicad-cli sch erc hardware/stm32-min.kicad_sch',
  '[INFO] 检查 12 条电源规则',
  '[PASS] VDD 3.3V 网络已连接',
  '[PASS] VDDA 与 VREF 去耦电容已放置',
  '[PASS] ERC 0 Error(s), 0 Warning(s)',
];

const SETTINGS_MENU: Array<{ key: SettingsKey; label: string; icon: LucideIcon }> = [
  { key: 'providers', label: '服务商', icon: Plug },
  { key: 'security', label: '安全中心', icon: ShieldCheck },
  { key: 'routing', label: '路由校准', icon: Route },
  { key: 'skills', label: '技能库', icon: Layers },
  { key: 'memory', label: '记忆管理', icon: Database },
  { key: 'usage', label: 'Token 用量', icon: Zap },
];

const SETTINGS_FORMS: Record<SettingsKey, { title: string; desc: string }> = {
  providers: { title: '服务商管理', desc: '管理 API Key、模型列表、默认模型与连接状态。' },
  security: { title: '安全中心', desc: '配置三分支安全策略与 Shell/文件/外部调用权限。' },
  routing: { title: '路由校准', desc: '持续采集误判样本，标记后导出供路由规则优化。' },
  skills: { title: '技能库', desc: '管理子 Agent / Skill 的启用状态、参数与输出契约。' },
  memory: { title: '记忆管理', desc: '查看 L1 情景记忆与 L2 语义记忆，支持搜索、置顶、遗忘。' },
  usage: { title: 'Token 用量', desc: '今日/本月消耗、费用与预算，超预算自动降级。' },
};

function ReplyDraft(mode: UiMode, input: string): Message {
  const base: { text: string; evidence: Evidence[] } =
    mode === 'engineering'
      ? {
          text: '我先把任务拆成可验收的小步，再让对应子 Agent 执行；产物和检查日志会放到右侧。',
          evidence: [
            { type: 'file', label: 'hardware/next-task.kicad_sch', detail: input.slice(0, 40) },
            { type: 'terminal', label: 'task-run.log:1', detail: '子 Agent 任务队列已建立' },
          ],
        }
      : mode === 'knowledge'
        ? {
            text: '我先拆出需要查证的子问题，再逐条给出带来源的证据链，不急着给结论。',
            evidence: [
              { type: 'search', label: '[hard] 官方资料', detail: '厂商官网/数据手册', hard: true },
              { type: 'search', label: '[soft] 国内资料站', detail: '立创 / 芯查查 / 半导小芯' },
            ],
          }
        : {
            text: '我先陪你把情况理清楚，再给一个现在就能执行的小步骤。',
            evidence: [],
          };
  return {
    id: `reply-${Date.now()}`,
    role: 'agent',
    text: base.text,
    evidence: base.evidence,
    meta: `${MODES.find((m) => m.key === mode)?.label} · 本地兜底`,
  };
}

function App() {
  const [mode, setMode] = useState<UiMode>('engineering');
  const [submode, setSubmode] = useState<string | null>('product_planning');
  const [manualLocked, setManualLocked] = useState(false);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [model, setModel] = useState<string>(FALLBACK_MODELS[0].id);
  const [liked, setLiked] = useState<Record<string, boolean>>({});

  const [l1Section, setL1Section] = useState<'sessions' | 'projects'>('projects');
  const [l1Open, setL1Open] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('files');
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsKey, setSettingsKey] = useState<SettingsKey>('providers');

  const [shellEnabled, setShellEnabled] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>(TERMINAL_LINES);
  const [terminalInput, setTerminalInput] = useState('');
  const [files, setFiles] = useState<Array<{ path: string; size: number; kind: string }>>([]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}model-providers.json`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((catalog: { models?: ModelOption[] } | null) => {
        const loaded = catalog?.models ?? [];
        if (loaded.length) {
          setModels(loaded);
          setModel((prev) =>
            loaded.some((item) => item.id === prev) ? prev : (loaded[0]?.id ?? prev),
          );
        }
      })
      .catch(() => {
        // 目录缺失时保留静态列表
      });
  }, []);

  const loadFiles = () => {
    fetch(`${GATEWAY_URL}/api/files`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: { files?: typeof files } | null) => setFiles(data?.files ?? []))
      .catch(() => setFiles([]));
  };

  useEffect(loadFiles, []);

  useEffect(() => {
    if (!rightOpen) return;
    const source = new EventSource(`${GATEWAY_URL}/api/events`);
    source.addEventListener('files_changed', () => loadFiles());
    return () => source.close();
  }, [rightOpen]);

  const contextUsage = useMemo(() => {
    const chars = messages.reduce(
      (sum, msg) => sum + (msg.text?.length ?? 0) + (msg.images?.length ?? 0) * 1200,
      0,
    );
    return Math.min(100, Math.round(6 + chars / 400));
  }, [messages]);

  const applyMode = (next: UiMode, nextSubmode?: string | null) => {
    setMode(next);
    setSubmode(nextSubmode ?? null);
  };

  const send = async (attachments: Attachment[] = []) => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: text || '已发送附件',
      images: attachments
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.dataUrl),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    const appendReply = (reply: Message) => setMessages((prev) => [...prev, reply]);
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: text,
          modelId: model,
          mode,
          userId: 'ui-user',
          attachments: attachments.map((item) => ({
            name: item.name,
            type: item.type,
            dataUrl: item.dataUrl,
          })),
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as {
        answer?: string;
        evidence?: Array<{ title: string; url: string; type: string }>;
        mode?: UiMode;
        submode?: string;
      };
      if (!manualLocked && data.mode) {
        applyMode(data.mode, data.submode);
      }
      const evidence: Evidence[] = (data.evidence ?? []).map((item) => ({
        type: 'search',
        label: item.title,
        detail: item.url,
        hard: item.type === '[hard]',
      }));
      appendReply({
        id: `reply-${Date.now()}`,
        role: 'agent',
        text: data.answer ?? '（后端没有返回内容）',
        evidence,
        meta: `${MODES.find((m) => m.key === mode)?.label} · 后端`,
      });
      loadFiles();
    } catch {
      appendReply(ReplyDraft(mode, text));
      loadFiles();
    }
  };

  const toggleL1 = (section: 'sessions' | 'projects') => {
    if (l1Section === section) {
      setL1Open((prev) => !prev);
    } else {
      setL1Section(section);
      setL1Open(true);
    }
  };

  const runTerminal = () => {
    const cmd = terminalInput.trim();
    if (!cmd || !shellEnabled) return;
    setTerminalLines((prev) => [...prev, `$ ${cmd}`]);
    setTerminalInput('');
    fetch(`${GATEWAY_URL}/api/terminal/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd }),
    })
      .then((resp) => resp.json())
      .then((data: { error?: string; stdout?: string; stderr?: string; exitCode?: number }) => {
        if (data.error) {
          setTerminalLines((prev) => [...prev, `[ERR] ${data.error}`]);
          return;
        }
        const output = [data.stdout ?? '', data.stderr ?? ''].filter(Boolean).join('').trim();
        setTerminalLines((prev) => [
          ...prev,
          ...(output ? output.split('\n') : ['[PASS] 命令完成']),
          `[exit ${data.exitCode ?? '?'}]`,
        ]);
      })
      .catch(() => setTerminalLines((prev) => [...prev, '[ERR] 无法连接 gateway']));
  };

  return (
    <div className="shell-v2">
      <nav className="l0-nav" aria-label="一级导航">
        <button
          className={l1Open && l1Section === 'sessions' ? 'active' : ''}
          onClick={() => toggleL1('sessions')}
          aria-label="对话"
        >
          <MessageSquare size={19} />
        </button>
        <button
          className={l1Open && l1Section === 'projects' ? 'active' : ''}
          onClick={() => toggleL1('projects')}
          aria-label="项目"
        >
          <FolderKanban size={19} />
        </button>
        <button
          className={settingsOpen ? 'active' : ''}
          onClick={() => setSettingsOpen((prev) => !prev)}
          aria-label="设置"
        >
          <Settings size={19} />
        </button>
        <span className="l0-spacer" />
        <button
          className={rightOpen ? 'active' : ''}
          onClick={() => setRightOpen((prev) => !prev)}
          aria-label="右侧产物栏"
        >
          <PanelRight size={19} />
        </button>
      </nav>

      {l1Open && (
        <aside className="l1-panel">
          <div className="l1-head">
            <strong>{l1Section === 'projects' ? '项目列表' : '历史会话'}</strong>
            <button className="new-session" onClick={() => setL1Open(false)}>
              <Plus size={14} />
              新对话
            </button>
          </div>
          <div className="l1-list">
            {l1Section === 'projects'
              ? MOCK_PROJECTS.map((project) => (
                  <div className="project-row active" key={project.id}>
                    <div className="project-main">
                      <strong>{project.name}</strong>
                      <span>{MODES.find((m) => m.key === project.mode)?.label} · {project.updated}</span>
                    </div>
                    <div className="session-list">
                      {project.sessions.map((session) => (
                        <button key={session} onClick={() => setL1Open(false)}>
                          {session}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              : MOCK_PROJECTS.slice(0, 2).map((project) => (
                  <div className="project-row" key={project.id}>
                    <div className="project-main">
                      <strong>{project.sessions[0]}</strong>
                      <span>{project.name}</span>
                    </div>
                  </div>
                ))}
          </div>
          <button className="l1-settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={15} />
            设置
          </button>
        </aside>
      )}

      <main className="center-v2">
        {settingsOpen ? (
          <SettingsPanel
            settingsKey={settingsKey}
            onSelect={setSettingsKey}
            shellEnabled={shellEnabled}
            onShellChange={setShellEnabled}
            onBack={() => setSettingsOpen(false)}
          />
        ) : (
          <section className="chat-v2">
            <header className="chat-head">
              <div>
                <h1>一人公司 AI-Agent</h1>
                <span>意图自动识别 · 无缝切换 · 本地 gateway</span>
              </div>
              <button
                className={rightOpen ? 'active' : ''}
                onClick={() => setRightOpen((prev) => !prev)}
                aria-label="展开右侧栏"
              >
                <PanelRight size={16} />
                产物
              </button>
            </header>
            <div className="message-list">
              {messages.map((msg) => (
                <MessageItem
                  key={msg.id}
                  msg={msg}
                  liked={liked[msg.id]}
                  onLike={(value) => setLiked((prev) => ({ ...prev, [msg.id]: value }))}
                />
              ))}
            </div>
            <Composer
              value={input}
              onChange={setInput}
              onSend={send}
              model={model}
              onModelChange={setModel}
              models={models}
              contextUsage={contextUsage}
              mode={mode}
              submode={submode}
              manualLocked={manualLocked}
              onModeManual={(next) => {
                applyMode(next);
                setManualLocked(true);
              }}
            />
          </section>
        )}
      </main>

      {rightOpen && (
        <aside className="right-v2">
          <div className="right-tabs">
            {(
              [
                ['files', '文件', FileText],
                ['browser', '浏览器', Globe],
                ['terminal', '终端', Terminal],
              ] as Array<[RightTab, string, LucideIcon]>
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                className={rightTab === key ? 'active' : ''}
                onClick={() => setRightTab(key)}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
            <button className="right-close" onClick={() => setRightOpen(false)} aria-label="收起右侧栏">
              <X size={15} />
            </button>
          </div>
          <div className="right-body">
            {rightTab === 'files' && (
              <div className="file-list">
                {files.length === 0 && <p className="settings-note">暂无产物文件</p>}
                {files.map((file) => (
                  <div className="file-row" key={file.path}>
                    <FileText size={15} />
                    <div>
                      <strong>{file.path}</strong>
                      <span>{file.kind} · {(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                    <ArrowUpRight size={13} />
                  </div>
                ))}
              </div>
            )}
            {rightTab === 'browser' && (
              <div className="browser-preview">
                <div className="browser-bar">
                  <span>https://item.szlcsc.com/9243.html</span>
                  <ArrowUpRight size={14} />
                </div>
                <div className="browser-body">
                  <strong>STM32F103C8T6 · 数据手册</strong>
                  <span>内置浏览器使用独立会话；登录态场景走主浏览器或后端代理。</span>
                </div>
              </div>
            )}
            {rightTab === 'terminal' && (
              <TerminalView
                lines={terminalLines}
                shellEnabled={shellEnabled}
                input={terminalInput}
                onInput={setTerminalInput}
                onRun={runTerminal}
              />
            )}
          </div>
        </aside>
      )}

      <footer className="statusbar-v2">
        <span className="status-mode">
          <ShieldCheck size={13} />
          系统正常
        </span>
        <span>
          <Zap size={13} />
          上下文 {contextUsage}%
        </span>
        <span>
          <Sparkles size={13} />
          {models.find((item) => item.id === model)?.label ?? model}
        </span>
        <span className="status-spacer" />
        <span className="status-hint">
          <Terminal size={13} />
          [PASS] VDD 3.3V
        </span>
        <button
          className={terminalOpen ? 'active' : ''}
          onClick={() => setTerminalOpen((prev) => !prev)}
        >
          <Terminal size={13} />
          {terminalOpen ? 'Terminal ▲' : 'Terminal'}
        </button>
      </footer>

      {terminalOpen && (
        <div className="terminal-drawer">
          <div className="terminal-head">
            <strong>
              <Terminal size={14} />
              {'>_ Terminal'}
            </strong>
            <span>{shellEnabled ? 'Shell 权限已开启' : 'Shell 权限未开启（安全中心）'}</span>
            <button onClick={() => setTerminalOpen(false)} aria-label="收起终端">
              <ChevronDown size={15} />
            </button>
          </div>
          <TerminalView
            lines={terminalLines}
            shellEnabled={shellEnabled}
            input={terminalInput}
            onInput={setTerminalInput}
            onRun={runTerminal}
          />
        </div>
      )}
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
        {msg.images && msg.images.length > 0 && (
          <div className="message-images">
            {msg.images.map((src) => (
              <img key={src} src={src} alt="粘贴图片" />
            ))}
          </div>
        )}
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
  model,
  onModelChange,
  models,
  contextUsage,
  mode,
  submode,
  manualLocked,
  onModeManual,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (attachments: Attachment[]) => void;
  model: string;
  onModelChange: (model: string) => void;
  models: ModelOption[];
  contextUsage: number;
  mode: UiMode;
  submode: string | null;
  manualLocked: boolean;
  onModeManual: (mode: UiMode) => void;
}) {
  const [attachOpen, setAttachOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentModel = models.find((item) => item.id === model) ?? models[0];
  const currentMode = MODES.find((item) => item.key === mode) ?? MODES[0];
  const ModeIcon = currentMode.icon;
  const providers = Array.from(new Set(models.map((item) => item.provider)));
  const addFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAttachments((prev) => [
          ...prev,
          { name: file.name, type: file.type, dataUrl: reader.result as string },
        ]);
      }
    };
    reader.readAsDataURL(file);
  };
  const addFiles = (files: FileList | null) => {
    Array.from(files ?? []).forEach(addFile);
  };

  return (
    <div className="composer-v2">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <div className="mode-capsule-row">
        <div className="mode-capsule">
          <button
            className={modeOpen ? 'active' : ''}
            onClick={() => setModeOpen((prev) => !prev)}
            aria-label="切换模式"
          >
            <ModeIcon size={15} />
            <strong>{currentMode.label}</strong>
            {submode && SUBMODE_LABELS[submode] && (
              <em>{SUBMODE_LABELS[submode]}</em>
            )}
            {manualLocked && <span className="lock-tag">锁定</span>}
            <ChevronDown size={14} />
          </button>
          {modeOpen && (
            <div className="mode-overlay">
              {MODES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    className={mode === item.key ? 'active' : ''}
                    onClick={() => {
                      onModeManual(item.key);
                      setModeOpen(false);
                    }}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                    <small>手动覆盖 · 锁定本会话</small>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {attachments.length > 0 && (
        <div className="attach-previews">
          {attachments.map((att) => (
            <div className="attach-preview" key={`${att.name}-${att.dataUrl.length}`}>
              {att.type.startsWith('image/') ? (
                <img src={att.dataUrl} alt={att.name} />
              ) : (
                <div className="attach-file">
                  <FileText size={18} />
                  <span className="attach-name">{att.name}</span>
                </div>
              )}
              <button
                aria-label="移除附件"
                onClick={() => setAttachments((prev) => prev.filter((item) => item !== att))}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="composer-input-row">
        <textarea
          value={value}
          placeholder="输入问题，或直接粘贴图片…"
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            const items = Array.from(event.clipboardData?.items ?? []);
            const image = items.find((item) => item.type.startsWith('image/'));
            if (!image) return;
            event.preventDefault();
            const file = image.getAsFile();
            if (!file) return;
            addFile(file);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSend(attachments);
              setAttachments([]);
            }
          }}
        />
        <button
          className="send-button"
          onClick={() => {
            onSend(attachments);
            setAttachments([]);
          }}
          aria-label="发送"
        >
          <Send size={17} />
        </button>
      </div>
      <div className="composer-tools">
        <div className="attach-wrap">
          <button
            className={`attach-button ${attachOpen ? 'active' : ''}`}
            aria-label="添加"
            onClick={() => setAttachOpen((prev) => !prev)}
          >
            <Plus size={17} />
          </button>
          {attachOpen && (
            <div className="attach-popover">
              <button onClick={() => imageInputRef.current?.click()}>
                <Image size={15} />
                上传图片
              </button>
              <button onClick={() => fileInputRef.current?.click()}>
                <Paperclip size={15} />
                上传文件
              </button>
              <button>
                <FolderOpen size={15} />
                设置工程文件夹
              </button>
            </div>
          )}
        </div>
        <span className="composer-mode-note">
          {manualLocked ? '已手动锁定模式' : '意图自动识别中'}
        </span>
        <div className="model-switch">
          <button
            className={modelOpen ? 'active' : ''}
            onClick={() => setModelOpen((prev) => !prev)}
            aria-label="切换模型"
          >
            <Sparkles size={14} />
            <span>{currentModel.provider}</span>
            <strong>{currentModel.label}</strong>
            <ChevronDown size={14} />
          </button>
          {modelOpen && (
            <div className="model-popover">
              {providers.map((provider) => (
                <div className="model-group" key={provider}>
                  <div className="model-group-name">{provider}</div>
                  {models.filter((item) => item.provider === provider).map((item) => (
                    <button
                      key={item.id}
                      className={model === item.id ? 'active' : ''}
                      onClick={() => {
                        onModelChange(item.id);
                        setModelOpen(false);
                      }}
                    >
                      <span>{item.label}</span>
                      <small>{item.note}</small>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div
          className="context-meter"
          role="img"
          aria-label={`上下文用量 ${contextUsage}%`}
          title={`上下文用量 ${contextUsage}%`}
        >
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <circle className="context-meter-track" cx="18" cy="18" r="15" />
            <circle
              className="context-meter-value"
              cx="18"
              cy="18"
              r="15"
              style={{
                strokeDashoffset: 94.25 * (1 - contextUsage / 100),
              }}
            />
          </svg>
          <span>{contextUsage}%</span>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({
  settingsKey,
  onSelect,
  shellEnabled,
  onShellChange,
  onBack,
}: {
  settingsKey: SettingsKey;
  onSelect: (key: SettingsKey) => void;
  shellEnabled: boolean;
  onShellChange: (enabled: boolean) => void;
  onBack: () => void;
}) {
  const form = SETTINGS_FORMS[settingsKey];
  return (
    <section className="settings-v2">
      <div className="settings-menu">
        <div className="settings-menu-head">
          <button className="settings-back" onClick={onBack}>
            <ChevronLeft size={16} />
            返回
          </button>
          <strong>设置</strong>
        </div>
        {SETTINGS_MENU.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              className={settingsKey === item.key ? 'active' : ''}
              onClick={() => onSelect(item.key)}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="settings-detail">
        <div className="settings-detail-head">
          <h2>{form.title}</h2>
          <p>{form.desc}</p>
        </div>
        {settingsKey === 'providers' && <ProvidersSettings />}
        {settingsKey === 'security' && (
          <SecuritySettings shellEnabled={shellEnabled} onShellChange={onShellChange} />
        )}
        {settingsKey === 'routing' && <RoutingSettings />}
        {settingsKey === 'skills' && <SkillsSettings />}
        {settingsKey === 'memory' && <MemorySettings />}
        {settingsKey === 'usage' && <UsageSettings />}
      </div>
    </section>
  );
}

function ProvidersSettings() {
  const [providers, setProviders] = useState<
    Array<{ id: string; label: string; configured: boolean; models: Record<string, string> }>
  >([]);
  const [order, setOrder] = useState<string[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const load = () => {
    fetch(`${GATEWAY_URL}/api/providers`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: { order?: string[]; providers?: typeof providers } | null) => {
        setProviders(data?.providers ?? []);
        setOrder(data?.order ?? []);
      })
      .catch(() => {
        setProviders([]);
        setOrder([]);
      });
  };

  useEffect(load, []);

  const test = async (id: string) => {
    setTesting(id);
    setTestResult((prev) => ({ ...prev, [id]: '测试中…' }));
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/providers/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: id }),
      });
      const body = (await resp.json()) as { ok?: boolean; error?: string };
      setTestResult((prev) => ({
        ...prev,
        [id]: body.ok ? '连接正常' : (body.error ?? '连接失败'),
      }));
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: '连接失败' }));
    } finally {
      setTesting(null);
    }
  };

  const setDefault = async (id: string) => {
    await fetch(`${GATEWAY_URL}/api/providers/default`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: id }),
    });
    load();
  };

  return (
    <div className="settings-form">
      <button className="add-provider" disabled title="在 .env 中配置 API Key 后刷新">
        <Plus size={14} />
        添加服务商
      </button>
      {providers.length === 0 && <p className="settings-note">加载中…</p>}
      {providers.map((row) => (
        <div className="provider-row" key={row.id}>
          <div>
            <strong>{row.label}</strong>
            <span>{row.models.heavy ?? '-'}</span>
          </div>
          <em className={row.configured ? 'ok' : ''}>
            {row.configured ? '已配置' : '未配置'}
          </em>
          {order[0] === row.id && <span className="default-tag">默认</span>}
          <button disabled={!row.configured} onClick={() => setDefault(row.id)}>
            设为默认
          </button>
          <button disabled={!row.configured} onClick={() => test(row.id)}>
            {testing === row.id ? '测试中…' : '测试连接'}
          </button>
          {testResult[row.id] && <span className="provider-test">{testResult[row.id]}</span>}
        </div>
      ))}
    </div>
  );
}

function SecuritySettings({
  shellEnabled,
  onShellChange,
}: {
  shellEnabled: boolean;
  onShellChange: (enabled: boolean) => void;
}) {
  const [config, setConfig] = useState<{
    shellEnabled: boolean;
    fileAccess: string;
    externalApiEnabled: boolean;
    illegalEnabled: boolean;
    personalEmergencyEnabled: boolean;
    propertyEmergencyEnabled: boolean;
    allowedCommandPrefixes: string[];
  }>({
    shellEnabled: false,
    fileAccess: 'project-only',
    externalApiEnabled: false,
    illegalEnabled: true,
    personalEmergencyEnabled: true,
    propertyEmergencyEnabled: true,
    allowedCommandPrefixes: [],
  });
  const [prefixInput, setPrefixInput] = useState('');

  const load = () => {
    fetch(`${GATEWAY_URL}/api/security`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: typeof config | null) => {
        if (data) {
          setConfig(data);
          onShellChange(data.shellEnabled);
          setPrefixInput(data.allowedCommandPrefixes.join(', '));
        }
      })
      .catch(() => undefined);
  };

  useEffect(load, []);

  const persist = async (patch: Partial<typeof config>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    setPrefixInput(next.allowedCommandPrefixes.join(', '));
    if (typeof patch.shellEnabled === 'boolean') onShellChange(patch.shellEnabled);
    await fetch(`${GATEWAY_URL}/api/security/persist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
  };

  const items: Array<{ key: keyof typeof config; label: string }> = [
    { key: 'illegalEnabled', label: '非法请求拦截' },
    { key: 'personalEmergencyEnabled', label: '人身紧急事件' },
    { key: 'propertyEmergencyEnabled', label: '财产紧急事件' },
    { key: 'externalApiEnabled', label: '外部 API 调用权限' },
  ];

  return (
    <div className="settings-form">
      {items.map((item) => {
        const on = config[item.key] === true;
        return (
          <div className="toggle-row" key={item.key}>
            <span>{item.label}</span>
            <button
              className={`toggle ${on ? 'on' : ''}`}
              onClick={() => persist({ [item.key]: !on } as Partial<typeof config>)}
              aria-pressed={on}
            >
              <i />
            </button>
          </div>
        );
      })}
      <div className="toggle-row">
        <span>Shell 命令权限</span>
        <button
          className={`toggle ${shellEnabled ? 'on danger' : ''}`}
          onClick={() => {
            const next = !shellEnabled;
            if (next && !window.confirm('是否允许 Agent 执行 Shell 命令？此操作可能修改系统文件。')) {
              return;
            }
            persist({ shellEnabled: next });
          }}
          aria-pressed={shellEnabled}
        >
          <i />
        </button>
      </div>
      <div className="toggle-row">
        <span>文件访问仅限项目目录</span>
        <button
          className={`toggle ${config.fileAccess === 'project-only' ? 'on' : ''}`}
          onClick={() =>
            persist({ fileAccess: config.fileAccess === 'project-only' ? 'all' : 'project-only' })
          }
          aria-pressed={config.fileAccess === 'project-only'}
        >
          <i />
        </button>
      </div>
      <div className="allowlist-row">
        <span>允许执行的命令前缀</span>
        <input
          value={prefixInput}
          onChange={(event) => setPrefixInput(event.target.value)}
          onBlur={() =>
            persist({
              allowedCommandPrefixes: prefixInput
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
          placeholder="如 git, npm, kicad-cli"
        />
      </div>
      <p className="settings-note">
        Shell 权限默认关闭；切换工程开发模式不会自动开启。白名单为空时允许任意命令，
        建议填写常用前缀以限制终端执行范围。
      </p>
    </div>
  );
}

function RoutingSettings() {
  const [records, setRecords] = useState<
    Array<{
      id: string;
      timestamp: number;
      query: string;
      primaryLens?: string;
      intent?: string;
      decision: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`${GATEWAY_URL}/api/routing/cases`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: { records?: Array<Record<string, unknown>> } | null) => {
        const list = data?.records ?? [];
        setRecords(
          list.map((item) => {
            const result = item.result as {
              decision?: { type?: string; selected?: { primaryLens?: string; intent?: string } };
            };
            const decision = result?.decision;
            return {
              id: String(item.id ?? ''),
              timestamp: Number(item.timestamp ?? 0),
              query: String(item.query ?? ''),
              decision: decision?.type ?? '',
              primaryLens: decision?.selected?.primaryLens,
              intent: decision?.selected?.intent,
            };
          }),
        );
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const accept = async (id: string) => {
    await fetch(`${GATEWAY_URL}/api/routing/batch-mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: [{ id, feedback: 'accept' }] }),
    });
    load();
  };

  const exportCsv = async () => {
    const resp = await fetch(`${GATEWAY_URL}/api/routing/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'csv' }),
    });
    if (!resp.ok) return;
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'route-cases.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="settings-form">
      <div className="table-wrap">
        <table className="route-table">
          <thead>
            <tr>
              <th>用户输入</th>
              <th>当前路由</th>
              <th>建议意图</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5}>加载中…</td>
              </tr>
            )}
            {!loading && records.length === 0 && (
              <tr>
                <td colSpan={5}>暂无路由 case</td>
              </tr>
            )}
            {records.map((row) => (
              <tr key={row.id}>
                <td>{row.query}</td>
                <td>{row.primaryLens ?? '-'} / {row.intent ?? '-'}</td>
                <td>{row.decision}</td>
                <td>{new Date(row.timestamp).toLocaleString()}</td>
                <td>
                  <button onClick={() => accept(row.id)}>标记正确</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button className="primary" onClick={load}>刷新</button>
        <button onClick={exportCsv}>导出 CSV</button>
      </div>
    </div>
  );
}

function SkillsSettings() {
  const [skills, setSkills] = useState<
    Array<{ name: string; version: string; triggers: string[]; enabled: boolean }>
  >([]);
  const [category, setCategory] = useState('all');

  const categoryOf = (name: string): string => {
    if (['chip-analysis', 'circuit-topology', 'datasheet-speed', 'github-reader', 'industry-kits', 'engineer', 'project-packager', 'color-recognition'].includes(name)) {
      return '工程开发';
    }
    if (['knowledge-qa', 'document-qa', 'content-writer', 'delivery-workflow', 'plan-validation', 'jargon-map', 'quote-compare'].includes(name)) {
      return '知识咨询';
    }
    return '生活助手';
  };

  const load = () => {
    fetch(`${GATEWAY_URL}/api/skills`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: { skills?: typeof skills } | null) => setSkills(data?.skills ?? []))
      .catch(() => setSkills([]));
  };

  useEffect(load, []);

  const toggle = async (name: string, enabled: boolean) => {
    const disabled = skills.filter((skill) => !skill.enabled).map((skill) => skill.name);
    if (enabled) {
      const index = disabled.indexOf(name);
      if (index >= 0) disabled.splice(index, 1);
    } else if (!disabled.includes(name)) {
      disabled.push(name);
    }
    await fetch(`${GATEWAY_URL}/api/skills/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled }),
    });
    load();
  };

  const filtered =
    category === 'all' ? skills : skills.filter((skill) => categoryOf(skill.name) === category);

  return (
    <div className="settings-form skill-grid">
      <div className="skill-filter">
        {['all', '工程开发', '知识咨询', '生活助手'].map((item) => (
          <button
            key={item}
            className={category === item ? 'active' : ''}
            onClick={() => setCategory(item)}
          >
            {item === 'all' ? '全部' : item}
          </button>
        ))}
      </div>
      {filtered.map((skill) => (
        <div className="skill-card" key={skill.name}>
          <div>
            <strong>{skill.name}</strong>
            <span>v{skill.version} · {categoryOf(skill.name)}</span>
            <small>{skill.triggers.slice(0, 3).join(' / ')}</small>
          </div>
          <div className="skill-toggle-row">
            <span>启用</span>
            <button
              className={`toggle ${skill.enabled ? 'on' : ''}`}
              onClick={() => toggle(skill.name, !skill.enabled)}
              aria-pressed={skill.enabled}
            >
              <i />
            </button>
          </div>
          <div className="skill-meta">
            <span>输入参数 / 输出契约 / 错误日志见 Skill 元数据</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MemorySettings() {
  const [items, setItems] = useState<
    Array<{
      id: string;
      type: 'fact' | 'session' | 'experience';
      layer: 'L1' | 'L2';
      content: string;
      createdAt: number;
      lastAccessedAt: number;
      meta: string;
    }>
  >([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = () => {
    fetch(`${GATEWAY_URL}/api/memory`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: { items?: typeof items } | null) => setItems(data?.items ?? []))
      .catch(() => setItems([]));
  };

  useEffect(load, []);

  const forget = async (id: string, type: string) => {
    await fetch(`${GATEWAY_URL}/api/memory/forget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type }),
    });
    load();
  };

  const filtered = items.filter((item) => {
    if (filter !== 'all' && item.layer !== filter) return false;
    if (search && !`${item.content} ${item.meta}`.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const labelOf = (item: { type: string; layer: string }): string => {
    if (item.type === 'fact') return `语义记忆 · ${item.layer}`;
    if (item.type === 'session') return `情景记忆 · ${item.layer}`;
    return `技能经验 · ${item.layer}`;
  };

  return (
    <div className="settings-form">
      <div className="memory-filter">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部</button>
        <button className={filter === 'L1' ? 'active' : ''} onClick={() => setFilter('L1')}>L1 情景</button>
        <button className={filter === 'L2' ? 'active' : ''} onClick={() => setFilter('L2')}>L2 语义</button>
        <div className="memory-search">
          <Search size={13} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索记忆"
          />
        </div>
      </div>
      {filtered.length === 0 && <p className="settings-note">暂无记忆条目</p>}
      {filtered.map((item) => (
        <div className="memory-row" key={item.id}>
          <div>
            <strong>{item.content}</strong>
            <span>{labelOf(item)} · {new Date(item.lastAccessedAt).toLocaleString()}</span>
          </div>
          <button onClick={() => forget(item.id, item.type)}>遗忘</button>
        </div>
      ))}
    </div>
  );
}

function UsageSettings() {
  const [stats, setStats] = useState<{
    todayTokens: number;
    weekTokens: number;
    monthTokens: number;
    byModel: Record<string, { promptTokens: number; completionTokens: number }>;
  }>({ todayTokens: 0, weekTokens: 0, monthTokens: 0, byModel: {} });
  const [budget, setBudget] = useState<{ budgetYuan: number | null; degradeAtPercent: number }>({
    budgetYuan: null,
    degradeAtPercent: 90,
  });
  const [budgetInput, setBudgetInput] = useState('');

  const load = () => {
    fetch(`${GATEWAY_URL}/api/usage/stats`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: { stats?: typeof stats; budget?: typeof budget } | null) => {
        if (data?.stats) setStats(data.stats);
        if (data?.budget) {
          setBudget(data.budget);
          setBudgetInput(data.budget.budgetYuan === null ? '' : String(data.budget.budgetYuan));
        }
      })
      .catch(() => undefined);
  };

  useEffect(load, []);

  const saveBudget = async () => {
    const value = budgetInput.trim() === '' ? null : Number(budgetInput);
    await fetch(`${GATEWAY_URL}/api/usage/budget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetYuan: value }),
    });
    load();
  };

  const modelRows = Object.entries(stats.byModel).sort(
    (a, b) =>
      b[1].promptTokens + b[1].completionTokens - (a[1].promptTokens + a[1].completionTokens),
  );
  const maxModelTokens = Math.max(1, ...modelRows.map(([, v]) => v.promptTokens + v.completionTokens));

  return (
    <div className="settings-form">
      <div className="usage-summary">
        <div>
          <strong>{stats.todayTokens.toLocaleString()}</strong>
          <span>今日 Tokens</span>
        </div>
        <div>
          <strong>{stats.weekTokens.toLocaleString()}</strong>
          <span>近 7 天 Tokens</span>
        </div>
        <div>
          <strong>{stats.monthTokens.toLocaleString()}</strong>
          <span>本月 Tokens</span>
        </div>
      </div>
      <div className="usage-bars">
        {modelRows.map(([model, value]) => {
          const tokens = value.promptTokens + value.completionTokens;
          return (
            <div key={model}>
              <span>{model}</span>
              <i style={{ width: `${Math.round((tokens / maxModelTokens) * 100)}%` }} />
              <em>{tokens.toLocaleString()}</em>
            </div>
          );
        })}
        {modelRows.length === 0 && <p className="settings-note">暂无计量数据</p>}
      </div>
      <div className="budget-row">
        <label>预算上限（¥）</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={budgetInput}
          onChange={(event) => setBudgetInput(event.target.value)}
          placeholder="不设上限"
        />
        <button className="primary" onClick={saveBudget}>保存预算</button>
        <span>降级阈值 {budget.degradeAtPercent}%（P-108）</span>
      </div>
      <p className="settings-note">
        Token 由后端计量服务自动记录；费用换算待配置单价后启用，超预算自动降级到更便宜模型。
      </p>
    </div>
  );
}

function TerminalView({
  lines,
  shellEnabled,
  input,
  onInput,
  onRun,
}: {
  lines: string[];
  shellEnabled: boolean;
  input: string;
  onInput: (value: string) => void;
  onRun: () => void;
}) {
  return (
    <div className="terminal-view">
      <pre className="terminal-output">
        {lines.map((line, i) => (
          <span key={`${i}-${line}`}>{line}</span>
        ))}
      </pre>
      <div className="terminal-input-row">
        <span>$</span>
        <input
          value={input}
          onChange={(event) => onInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onRun();
          }}
          disabled={!shellEnabled}
          placeholder={shellEnabled ? '输入命令…' : 'Shell 权限未开启，请先到安全中心开启'}
        />
      </div>
    </div>
  );
}

export default App;
