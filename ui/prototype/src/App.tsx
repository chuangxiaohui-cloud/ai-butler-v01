import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  Bot,
  Calendar,
  ChevronDown,
  ChevronLeft,
  Code2,
  Database,
  FileText,
  FolderKanban,
  FolderOpen,
  Gavel,
  Globe,
  HeartPulse,
  Image,
  Layers,
  Mail,
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
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';

import MindMapViewer from './MindMapViewer';
import type { MindTreeNode } from './mindMapLayout';
import XmindBubble from './XmindBubble';

type UiMode = 'engineering' | 'knowledge' | 'life';
type FeedbackReason = 'irrelevant' | 'too_verbose' | 'technical_error' | 'missing_key_point';
type FeedbackValue = 'accept' | 'reject' | 'correct';
type RightTab = 'files' | 'browser' | 'terminal' | 'notifications' | 'decisions';
type SettingsKey = 'providers' | 'security' | 'routing' | 'skills' | 'memory' | 'usage' | 'mail' | 'calendar' | 'balance';

interface Evidence {
  type: 'file' | 'terminal' | 'test' | 'search';
  label: string;
  detail: string;
  hard?: boolean;
}

interface VideoCard {
  title: string;
  url: string;
  platform: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  bilibili: 'B站',
  youtube: 'YouTube',
  douyin: '抖音',
  other: '视频',
};

const FEEDBACK_REASON_LABELS: Record<FeedbackReason, string> = {
  irrelevant: '答非所问',
  too_verbose: '太啰嗦',
  technical_error: '技术错误',
  missing_key_point: '漏了重点',
};

interface Message {
  id: string;
  role: 'user' | 'agent';
  text: string;
  images?: string[];
  evidence?: Evidence[];
  videos?: VideoCard[];
  meta?: string;
  notice?: string;
  skillName?: string;
  postprocessSkillNames?: string[];
  artifacts?: SkillArtifact[];
  /** E324 第三刀：confirm 挂起文案附带的对话内确认卡（pendingId 指向 open resume pending） */
  confirm?: { pendingId: string };
  /** E332：网关未连接本地兜底携带原请求，供「重试」按钮重发 */
  retryQuery?: string;
}

interface SkillArtifact {
  kind: string;
  title: string;
  data: Record<string, unknown>;
}

interface ModelOption {
  id: string;
  provider: string;
  label: string;
  note: string;
}

interface ChangeRecord {
  path: string;
  kind: 'added' | 'modified' | 'removed';
  at: number;
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

// E323：右栏「裁决」页——trigger 中文标签
const DECISION_TRIGGER_LABELS: Record<string, string> = {
  human_arbitration: '人类裁决',
  escalation: '困难升级',
  low_confidence: '低置信',
};

interface DecisionPanelEntry {
  id: string;
  trigger: string;
  question?: string;
  options?: string[];
  choices?: Array<{
    id: string;
    label: string;
    description?: string;
    outcome: 'approve' | 'reject';
  }>;
  defaultChoice?: string;
  requiresConfirmation?: boolean;
  context?: { kind?: string; transactionId?: string; conflicts?: unknown[] };
  conversationId?: string;
  /** E324 第二刀：confirm 真阻断挂起载荷——批准后由 gateway 自动恢复执行 */
  resume?: { query?: string; executor?: string };
  confidence?: number;
  createdAt: number;
}

/** E324 第二刀：批准恢复执行的执行回执（gateway POST /api/decisions/:id executed 字段） */
interface ExecutedReceipt {
  answer?: string;
  error?: string;
}

interface DecisionReceipt {
  id: string;
  text: string;
  tone: 'ok' | 'reject' | 'error';
}

const FALLBACK_MODELS: ModelOption[] = [
  { id: 'deepseek:heavy', provider: 'DeepSeek', label: 'deepseek-v4-pro', note: '旗舰 · 推理' },
  { id: 'deepseek:medium', provider: 'DeepSeek', label: 'deepseek-v4-flash', note: '均衡' },
  { id: 'deepseek:light', provider: 'DeepSeek', label: 'deepseek-v4-flash', note: '快速' },
  { id: 'minimax:heavy', provider: 'MiniMax', label: 'MiniMax-M3', note: '旗舰 · 推理' },
  { id: 'minimax:medium', provider: 'MiniMax', label: 'MiniMax-M2.7', note: '均衡' },
  { id: 'minimax:light', provider: 'MiniMax', label: 'MiniMax-M2.7-highspeed', note: '快速' },
  { id: 'minimax:vision', provider: 'MiniMax', label: 'MiniMax-M2.7', note: '视觉' },
  { id: 'zhipu:heavy', provider: '智谱', label: 'glm-5.3', note: '旗舰 · 推理' },
  { id: 'zhipu:medium', provider: '智谱', label: 'glm-5.2', note: '均衡' },
  { id: 'zhipu:light', provider: '智谱', label: 'glm-5-turbo', note: '快速' },
  { id: 'zhipu:vision', provider: '智谱', label: 'glm-5.2', note: '视觉' },
  { id: 'deepseek:vision', provider: 'DeepSeek', label: 'deepseek-v4-flash-vision-exp', note: '视觉' },
];

// P-105 模型路由缺省中档（便宜优先）；UI 未手动选档时跟随该档
const DEFAULT_MODEL_TIER = 'medium';

function defaultModelId(list: ModelOption[]): string {
  return (
    list.find((item) => item.id.endsWith(`:${DEFAULT_MODEL_TIER}`))?.id ??
    list[0]?.id ??
    'deepseek:medium'
  );
}

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://127.0.0.1:8787';

/** E320：通知时间格式化（当日 HH:MM，跨日补 M-D） */
function fmtNotifyTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.getMonth() + 1}-${d.getDate()} ${time}`;
}
// 会话上下文（E193）：每次页面会话一个稳定 conversationId，供 gateway 端逐字窗口 + 压缩
const CHAT_CONVERSATION_ID = `ui-1787395844719-xjbsv0ic`;

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
  { key: 'mail', label: '邮件', icon: Mail },
  { key: 'calendar', label: '日历', icon: Calendar },
  { key: 'balance', label: '资源包', icon: Wallet },
  { key: 'routing', label: '路由校准', icon: Route },
  { key: 'skills', label: '技能库', icon: Layers },
  { key: 'memory', label: '记忆管理', icon: Database },
  { key: 'usage', label: 'Token 用量', icon: Zap },
];

const SETTINGS_FORMS: Record<SettingsKey, { title: string; desc: string }> = {
  providers: { title: '服务商管理', desc: '管理 API Key、模型列表、默认模型与连接状态。' },
  security: { title: '安全中心', desc: '配置三分支安全策略与 Shell/文件/外部调用权限。' },
  mail: { title: '邮件配置', desc: '配置 SMTP 服务器与账号授权码，用于发送邮件。' },
  calendar: { title: '日历', desc: '导入/导出 .ics 日历文件，与 Outlook / 苹果 / 谷歌日历互通。' },
  balance: { title: '资源包', desc: '查看 Bocha 余额与剩余次数；余额不足时提前购买体验包（§D.3 健康检查）。' },
  routing: { title: '路由校准', desc: '持续采集误判样本，标记后导出供路由规则优化。' },
  skills: { title: '技能库', desc: '管理子 Agent / Skill 的启用状态、参数与输出契约。' },
  memory: { title: '记忆管理', desc: '查看 L1 情景记忆与 L2 语义记忆，支持搜索、置顶、遗忘。' },
  usage: { title: 'Token 用量', desc: '今日/本月消耗、费用与预算，超预算自动降级。' },
};

function ReplyDraft(mode: UiMode, input: string): Message {
  const modeLabel = MODES.find((m) => m.key === mode)?.label ?? '工程开发';
  return {
    id: `reply-${Date.now()}`,
    role: 'agent',
    // E332：本地兜底明确标注“未执行 + 本地预览”，并去掉演示用的假证据（避免被误当真实回答）
    text: `⚠️ 网关未连接，刚才的请求没有真正执行（本地预览，非真实回答）。\n请先启动 gateway（npm run gateway），再点下方「重试」重发。`,
    meta: `${modeLabel} · ⚠️ 本地预览`,
    retryQuery: input,
  };
}

const AGENT_CATEGORY_ORDER = ['eda', 'structure', 'code', 'simulation', 'build', 'system'];
const AGENT_CATEGORY_LABELS: Record<string, string> = {
  eda: '电路设计 EDA',
  structure: '结构设计',
  code: '编码',
  simulation: '仿真',
  build: '编译/烧录',
  system: '系统控制',
};
const MODE_ROLES: Record<UiMode, Array<{ name: string; desc: string }>> = {
  engineering: [
    { name: '老板', desc: '拍板 · 审批 · 验收' },
    { name: '产品经理', desc: '需求规划 · PRD · 评审' },
    { name: '项目经理', desc: '任务拆解 · 调度子 Agent · Xmind' },
    { name: '系统架构师', desc: '技术方案 · 架构 · 代码审查' },
  ],
  knowledge: [{ name: '30 年经验老专家', desc: '芯片/器件分析 · 技术问答 · 资料解读' }],
  life: [{ name: '贴身女秘书', desc: '日程提醒 · 天气生活 · 日常打理' }],
};
const SUBMODE_ROLE: Record<string, string> = {
  product_planning: '产品经理',
  review_critique: '系统架构师',
};

interface AgentDirectoryAgent {
  id: string;
  name: string;
  category: string;
  available: boolean;
}
interface AgentDirectory {
  total: number;
  available: number;
  agents: AgentDirectoryAgent[];
}
interface SkillDirectory {
  total: number;
  enabled: number;
  skills: Array<{ name: string; enabled: boolean }>;
}

function RolePanel({
  mode,
  submode,
  onClose,
  onOpenSkills,
}: {
  mode: UiMode;
  submode: string | null;
  onClose: () => void;
  onOpenSkills: () => void;
}) {
  const [agents, setAgents] = useState<AgentDirectory | null>(null);
  const [skills, setSkills] = useState<SkillDirectory | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`${GATEWAY_URL}/api/agents`)
        .then((resp) => resp.json().catch(() => null))
        .catch(() => null),
      fetch(`${GATEWAY_URL}/api/skills`)
        .then((resp) => resp.json().catch(() => null))
        .catch(() => null),
    ]).then(([agentData, skillData]) => {
      if (!alive) return;
      if (!agentData || !Array.isArray(agentData.agents) || !skillData || !Array.isArray(skillData.skills)) {
        setError('未连接 gateway：角色/子 Agent 数据不可用');
        return;
      }
      setAgents(agentData as AgentDirectory);
      setSkills(skillData as SkillDirectory);
    });
    return () => {
      alive = false;
    };
  }, []);

  const modeLabel = MODES.find((item) => item.key === mode)?.label ?? '';
  const roleList = MODE_ROLES[mode] ?? [];
  const highlightRole = submode ? (SUBMODE_ROLE[submode] ?? null) : null;
  const groups = AGENT_CATEGORY_ORDER.map((category) => ({
    category,
    label: AGENT_CATEGORY_LABELS[category] ?? category,
    list: (agents?.agents ?? []).filter((agent) => agent.category === category),
  })).filter((group) => group.list.length > 0);
  const enabledSkills = (skills?.skills ?? []).filter((skill) => skill.enabled);

  return (
    <aside className="role-v2">
      <div className="role-head">
        <div className="role-head-title">
          <strong>角色面板</strong>
          <span>{modeLabel}{submode ? ` · ${SUBMODE_LABELS[submode] ?? submode}` : ''}</span>
        </div>
        <button onClick={onClose} aria-label="收起角色面板" title="收起">
          <X size={15} />
        </button>
      </div>
      <div className="role-body">
        <section className="role-block">
          <h4>当前角色</h4>
          <div className="role-list">
            {roleList.map((role) => (
              <div
                key={role.name}
                className={role.name === highlightRole ? 'role-row active' : 'role-row'}
              >
                <span className="role-dot" />
                <strong>{role.name}</strong>
                <small>{role.desc}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="role-block">
          <h4>
            子 Agent
            <span>{agents ? `${agents.available} 可用 / ${agents.total}` : '…'}</span>
          </h4>
          {error ? (
            <p className="role-note">⚠️ {error}</p>
          ) : !agents ? (
            <p className="role-note">子 Agent 目录加载中…</p>
          ) : (
            groups.map((group) => (
              <div className="role-group" key={group.category}>
                <div className="role-group-head">{group.label} · {group.list.length}</div>
                {group.list.map((agent) => (
                  <div className="role-row" key={agent.id}>
                    <span className={`role-dot ${agent.available ? 'on' : ''}`} />
                    <strong>{agent.name}</strong>
                    <span className={agent.available ? 'role-status on' : 'role-status'}>
                      {agent.available ? '可用' : '未接入'}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </section>
        <section className="role-block">
          <h4>
            Skill
            <span>{skills ? `${skills.enabled} 启用 / ${skills.total}` : '…'}</span>
          </h4>
          {error ? (
            <p className="role-note">⚠️ {error}</p>
          ) : !skills ? (
            <p className="role-note">Skill 目录加载中…</p>
          ) : (
            <>
              {enabledSkills.slice(0, 10).map((skill) => (
                <div className="role-row" key={skill.name}>
                  <span className="role-dot on" />
                  <strong className="role-skill-name">{skill.name}</strong>
                </div>
              ))}
              {enabledSkills.length > 10 && (
                <p className="role-note">+{enabledSkills.length - 10} 个已启用 Skill</p>
              )}
              <button className="role-more" onClick={onOpenSkills} type="button">
                管理 Skill →
              </button>
            </>
          )}
        </section>
      </div>
    </aside>
  );
}
function App() {
  const [mode, setMode] = useState<UiMode>('engineering');
  const [submode, setSubmode] = useState<string | null>('product_planning');
  const [manualLocked, setManualLocked] = useState(false);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [model, setModel] = useState<string>(() => defaultModelId(FALLBACK_MODELS));
  const modelTouchedRef = useRef(false);
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, FeedbackValue>>({});
  // E324 第三刀：对话内确认卡提交中的消息 id（防止连点双提交）
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // E332：本地兜底「重试」提交中的消息 id（防连点）
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${GATEWAY_URL}/api/feedback`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: {
        latest?: Array<{ userId: string; conversationId: string; messageId: string; feedback: FeedbackValue }>;
      } | null) => {
        const restored: Record<string, FeedbackValue> = {};
        for (const entry of data?.latest ?? []) {
          if (entry.userId === 'ui-user' && entry.conversationId === CHAT_CONVERSATION_ID) {
            restored[entry.messageId] = entry.feedback;
          }
        }
        setFeedbackByMessage(restored);
      })
      .catch(() => {
        // gateway 不可用时维持本地空状态。
      });
  }, []);

  const [l1Section, setL1Section] = useState<'sessions' | 'projects'>('projects');
  const [l1Open, setL1Open] = useState(false);
  const [roleOpen, setRoleOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('files');
  const [browserUrl, setBrowserUrl] = useState('https://item.szlcsc.com/9243.html');
  const [highlightFile, setHighlightFile] = useState<string | null>(null);
  // E337：文件面板只读预览（双击文件行加载）；E346：.xmind 额外携带树供可视化
  const [filePreview, setFilePreview] = useState<{
    path: string;
    size: number;
    text: string;
    truncated: boolean;
    tree?: MindTreeNode;
    // E354：HTML 产物走整文件 iframe 渲染（raw 端点 URL）
    htmlUrl?: string;
  } | null>(null);
  const [filePreviewError, setFilePreviewError] = useState('');
  // E339：文件面板「最近变更」记录（watcher 差量，进程内内存环，重启清空属预期）
  const [recentChanges, setRecentChanges] = useState<ChangeRecord[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsKey, setSettingsKey] = useState<SettingsKey>('providers');
  // P3：工具配额/API 告警进底部状态栏，不污染对话气泡
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [shellEnabled, setShellEnabled] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>(TERMINAL_LINES);
  const [terminalInput, setTerminalInput] = useState('');
  const [files, setFiles] = useState<Array<{ path: string; size: number; kind: string }>>([]);
  const [filesRefreshing, setFilesRefreshing] = useState(false);
  const [progressStage, setProgressStage] = useState('');
  const [generatingSkills, setGeneratingSkills] = useState<Record<string, string>>({});
  // E320：右栏「通知」列表（source=decision/skill/usage，含 AI 运营日报与预算阈值事件）
  const [notifications, setNotifications] = useState<
    Array<{
      id: string;
      role: string;
      kind: string;
      title: string;
      detail?: string;
      source: string;
      priority: 'urgent' | 'normal' | 'low';
      createdAt: number;
    }>
  >([]);
  const [dailyFeedback, setDailyFeedback] = useState<{
    accept: number;
    reject: number;
    correct: number;
    total: number;
    text: string;
  } | null>(null);
  const [notifyHint, setNotifyHint] = useState('');
  // E331：通知分页 + 未读角标（会话内水位=最近一次查看通知页时页顶最新 id，越过水位的计为未读）
  const [notifyPage, setNotifyPage] = useState(1);
  const [notifyTotal, setNotifyTotal] = useState(0);
  const [unreadNotify, setUnreadNotify] = useState(0);
  const seenTopNotifyRef = useRef<string | null>(null);

  // §9.2 证据链交互：证据引用可点击验证
  const handleEvidenceClick = (ev: Evidence) => {
    if (ev.type === 'search') {
      const url = /^https?:\/\//i.test(ev.detail) ? ev.detail : ev.label;
      setRightOpen(true);
      setRightTab('browser');
      setBrowserUrl(url);
    } else if (ev.type === 'file') {
      const path = ev.label.split(':')[0];
      setRightOpen(true);
      setRightTab('files');
      setHighlightFile(path);
      void previewFile(path);
    } else if (ev.type === 'terminal') {
      setRightOpen(true);
      setRightTab('terminal');
    }
  };

  useEffect(() => {
    // E267：先拉网关动态模型目录（读实际配置），失败再回退打包内静态目录
    fetch(`${GATEWAY_URL}/api/model-providers`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .catch(() => null)
      .then((catalog: { models?: ModelOption[]; defaultTier?: string } | null) => {
        const loaded = catalog?.models ?? [];
        if (loaded.length) {
          return { models: loaded, defaultTier: catalog?.defaultTier };
        }
        return fetch(`${import.meta.env.BASE_URL}model-providers.json`)
          .then((r) => (r.ok ? r.json() : null))
          .then((staticCatalog: { models?: ModelOption[]; defaultTier?: string } | null) => ({
            models: staticCatalog?.models ?? [],
            defaultTier: staticCatalog?.defaultTier,
          }))
          .catch(() => ({ models: [], defaultTier: undefined }));
      })
      .then(({ models: loaded, defaultTier }: { models: ModelOption[]; defaultTier?: string }) => {
        if (!loaded.length) return;
        setModels(loaded);
        if (modelTouchedRef.current) {
          // 用户已手动选档：保留原选择，仅兜底保证落在目录内
          setModel((prev) => (loaded.some((item) => item.id === prev) ? prev : defaultModelId(loaded)));
        } else {
          // P-105 缺省中档：未手动选过模型时跟随目录 defaultTier（便宜优先）
          const tier = defaultTier ?? DEFAULT_MODEL_TIER;
          setModel(loaded.find((item) => item.id.endsWith(`:${tier}`))?.id ?? loaded[0].id);
        }
      })
      .catch(() => {
        // 网关与静态目录都失败时保留静态列表
      });
  }, []);

  const loadFiles = (autoPreview = false, markBusy = false) => {
    if (markBusy) setFilesRefreshing(true);
    fetch(`${GATEWAY_URL}/api/files`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: { files?: typeof files } | null) => {
        const list = data?.files ?? [];
        setFiles(list);
        if (markBusy) setFilesRefreshing(false);
        if (autoPreview && list.some((file) => file.kind === 'HTML 预览')) {
          setRightOpen(true);
          setRightTab('browser');
        }
      })
      .catch(() => {
        setFiles([]);
        if (markBusy) setFilesRefreshing(false);
      });
  };

  /** E339：最近变更记录（新→旧，来自 gateway watcher 内存环） */
  const loadRecentChanges = () => {
    fetch(`${GATEWAY_URL}/api/files/changes`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: { changes?: ChangeRecord[] } | null) => {
        setRecentChanges((data?.changes ?? []).slice(0, 30));
      })
      .catch(() => {
        setRecentChanges([]);
      });
  };

  /** E339：变更时间展示——当天 HH:mm:ss，跨天 MM-DD HH:mm */
  const formatChangeTime = (at: number) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date(at);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
      ? `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  useEffect(() => {
    loadFiles();
    loadRecentChanges();
  }, []);

  /** E337：双击文件行 → 只读预览（服务端防穿越，仅沙箱根内文本） */
  const previewFile = async (path: string) => {
    setFilePreviewError('');
    const lowerPath = path.toLowerCase();
    // E354：HTML 产物整文件 iframe 渲染（raw 只读、防穿越同 preview），不经过文本截断预览
    if (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm')) {
      const known = files.find((f) => f.path === path);
      setFilePreview({
        path,
        size: known?.size ?? 0,
        text: '',
        truncated: false,
        htmlUrl: `${GATEWAY_URL}/api/files/raw?path=${encodeURIComponent(path)}`,
      });
      return;
    }
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/files/preview?path=${encodeURIComponent(path)}`);
      const data = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        path?: string;
        size?: number;
        preview?: string;
        truncated?: boolean;
        tree?: MindTreeNode;
      } | null;
      if (!resp.ok || !data?.ok) {
        setFilePreview(null);
        setFilePreviewError(data?.error ?? '预览失败');
        return;
      }
      setFilePreview({
        path: data.path ?? path,
        size: data.size ?? 0,
        text: data.preview ?? '',
        truncated: data.truncated ?? false,
        tree: data.tree,
      });
    } catch {
      setFilePreview(null);
      setFilePreviewError('无法连接 gateway，预览失败');
    }
  };

  // E331：分页拉取通知（最新在前）；markSeen=查看通知页时把水位更新为页顶最新 id 并清零角标；
  // 其它 tab 拉第一页时统计“越过水位的新条目”作未读数。
  const loadNotifications = (page: number, { markSeen }: { markSeen: boolean }) => {
    fetch(`${GATEWAY_URL}/api/notifications?page=${page}&pageSize=20&userId=ui-user`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then(
        (data: {
          entries?: typeof notifications;
          total?: number;
          feedbackSummary?: NonNullable<typeof dailyFeedback>;
        } | null) => {
          const list = data?.entries ?? [];
          setNotifications(list);
          setNotifyTotal(data?.total ?? 0);
          setDailyFeedback(data?.feedbackSummary ?? null);
          setNotifyHint('');
          const seen = seenTopNotifyRef.current;
          if (markSeen || seen === null) {
            // 首次建立水位或用户正在看通知页：以页顶最新 id 为已读水位，角标清零
            seenTopNotifyRef.current = list[0]?.id ?? null;
            setUnreadNotify(0);
          } else {
            const idx = list.findIndex((entry) => entry.id === seen);
            setUnreadNotify(idx >= 0 ? idx : list.length);
          }
        },
        () => {
          setNotifyHint('无法连接 gateway，通知暂不可用');
          setDailyFeedback(null);
          setUnreadNotify(0);
        },
      );
  };

  const goNotifyPage = (next: number) => {
    if (next < 1) return;
    setNotifyPage(next);
    loadNotifications(next, { markSeen: false });
  };

  // E331：切到通知页 → 回到第 1 页并记为已读；切到其它 tab → 30s 后台拉第一页供角标计数
  useEffect(() => {
    if (!rightOpen) return;
    if (rightTab === 'notifications') {
      setNotifyPage(1);
      loadNotifications(1, { markSeen: true });
    } else {
      loadNotifications(1, { markSeen: false });
      const timer = setInterval(() => loadNotifications(1, { markSeen: false }), 30000);
      return () => clearInterval(timer);
    }
    return undefined;
  }, [rightOpen, rightTab]);

  useEffect(() => {
    const source = new EventSource(`${GATEWAY_URL}/api/events`);
    source.addEventListener('progress', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { stage?: string };
        if (data.stage) setProgressStage(data.stage);
      } catch {
        // 忽略非法进度事件
      }
    });
    source.addEventListener('artifact', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as {
          skill?: string;
          state?: string;
        };
        const skill = data.skill;
        const state = data.state;
        if (!skill) return;
        setGeneratingSkills((prev) => {
          const next = { ...prev };
          if (state === 'generating') {
            next[skill] = '生成中';
          } else {
            delete next[skill];
          }
          return next;
        });
      } catch {
        // 忽略非法 artifact 事件
      }
    });
    source.addEventListener('files_changed', () => {
      setProgressStage('');
      setGeneratingSkills({});
      loadFiles(true);
      loadRecentChanges();
    });
    return () => source.close();
  }, []);

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

  const askQuery = async (text: string, attachments: Attachment[] = [], dropMsgId?: string) => {
    if (!text && attachments.length === 0) return;
    // E332：重试时先摘掉原兜底回复，且不再重复追加用户气泡（原气泡仍在）
    if (dropMsgId) setMessages((prev) => prev.filter((m) => m.id !== dropMsgId));
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: text || '已发送附件',
      images: attachments
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.dataUrl),
    };
    if (!dropMsgId) {
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
    }
    const appendReply = (reply: Message) => setMessages((prev) => [...prev, reply]);
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: text,
          modelId: model,
          mode,
          conversationId: CHAT_CONVERSATION_ID,
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
        videos?: Array<{ title: string; url: string; platform: string }>;
        mode?: UiMode;
        submode?: string;
        notice?: string;
        toolNotice?: string;
        skillName?: string;
        postprocessSkillNames?: string[];
        artifacts?: SkillArtifact[];
      };
      // P3：工具告警显示到底部状态栏
      setStatusNotice(data.toolNotice ?? null);
      if (!manualLocked && data.mode) {
        applyMode(data.mode, data.submode);
      }
      const evidence: Evidence[] = (data.evidence ?? []).map((item) => ({
        type: 'search',
        label: item.title,
        detail: item.url,
        hard: item.type === '[hard]',
      }));
      // 回复标签跟随后端实际路由结果（工程开发/知识咨询/生活助手），不再用发送时的旧 mode
      const replyMode = data.mode ?? mode;
      const replySubmode = data.mode ? data.submode : submode;
      const replyMeta = [
        MODES.find((m) => m.key === replyMode)?.label,
        replySubmode && SUBMODE_LABELS[replySubmode] ? SUBMODE_LABELS[replySubmode] : null,
      ]
        .filter((item): item is string => Boolean(item))
        .join(' · ');
      const reply: Message = {
        id: `reply-${Date.now()}`,
        role: 'agent',
        text: data.answer ?? '（后端没有返回内容）',
        evidence,
        videos: (data.videos ?? []).map((v) => ({
          title: v.title,
          url: v.url,
          platform: v.platform,
        })),
        meta: replyMeta,
        notice: data.notice,
        skillName: data.skillName,
        postprocessSkillNames: data.postprocessSkillNames,
        artifacts: data.artifacts,
      };
      appendReply(reply);
      attachConfirmReply(reply);
      loadFiles();
    } catch {
      appendReply(ReplyDraft(mode, text));
      loadFiles();
    }
  };

  const send = async (attachments: Attachment[] = []) => {
    await askQuery(input.trim(), attachments);
  };

  const retryFallback = (msgId: string, query: string) => {
    setRetryingId(msgId);
    void askQuery(query, [], msgId).finally(() => setRetryingId(null));
  };

  const submitFeedback = async (
    msg: Message,
    feedback: FeedbackValue,
    details?: { reason?: FeedbackReason; note?: string; correctedAnswer?: string },
  ): Promise<boolean> => {
    if (msg.retryQuery) return false;
    const index = messages.findIndex((item) => item.id === msg.id);
    const query = [...messages.slice(0, index)]
      .reverse()
      .find((item) => item.role === 'user')?.text ?? '';
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'ui-user',
          conversationId: CHAT_CONVERSATION_ID,
          messageId: msg.id,
          mode,
          query,
          answer: msg.text,
          ...(msg.skillName ? { skillName: msg.skillName } : {}),
          ...(msg.postprocessSkillNames?.length
            ? { postprocessSkillNames: msg.postprocessSkillNames }
            : {}),
          feedback,
          ...details,
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          skillCandidate?: { status?: string; title?: string } | null;
        };
        setFeedbackByMessage((prev) => ({ ...prev, [msg.id]: feedback }));
        if (data.skillCandidate?.status === 'proposed' && data.skillCandidate.title) {
          setStatusNotice(`已生成 Skill 候选「${data.skillCandidate.title}」，请到设置 → Skill 确认。`);
        }
        return true;
      }
    } catch {
      // 反馈写入失败时保持未选择状态，避免把未落盘误显示为成功。
    }
    return false;
  };

  /** E324 第三刀：向主聊天追加 agent 消息（执行回执 / 确认结果共用） */
  const appendChatReceipt = (text: string, meta = '人类裁决 · 执行回执') => {
    setMessages((prev) => [
      ...prev,
      {
        id: `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'agent',
        text,
        meta,
      },
    ]);
  };

  /** E324 第二刀：裁决面板批准并恢复执行后，把执行回执续到主聊天（仅当挂起动作属于本会话） */
  const pushExecutedReceipt = (entry: DecisionPanelEntry, executed: ExecutedReceipt) => {
    if (entry.conversationId !== CHAT_CONVERSATION_ID) return;
    // 面板批准后清掉该 pending 在本会话气泡上的确认卡，避免残留按钮
    setMessages((prev) =>
      prev.map((m) => (m.confirm?.pendingId === entry.id ? { ...m, confirm: undefined } : m)),
    );
    const text = executed.error
      ? `⚠️ 已在裁决页批准，但自动恢复执行未成功：${executed.error}`
      : `✅ 老板，已在裁决页批准并执行。\n${executed.answer ?? ''}`;
    appendChatReceipt(text);
  };

  /** E324 第三刀：hold 文案返回后，把同会话对应的 resume pending 挂到该气泡以渲染确认卡 */
  const attachConfirmReply = async (reply: Message) => {
    if (!reply.text.includes('⏸')) return;
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/decisions`);
      if (!resp.ok) return;
      const data = (await resp.json()) as { open?: DecisionPanelEntry[] };
      const target = (data.open ?? []).find(
        (e) =>
          e.resume &&
          e.conversationId === CHAT_CONVERSATION_ID &&
          (e.question ?? '').trim() === reply.text.trim(),
      );
      if (!target) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === reply.id ? { ...m, confirm: { pendingId: target.id } } : m)),
      );
    } catch {
      // 确认卡挂载失败不影响已展示的挂起文案
    }
  };

  /** E324 第三刀：对话内确认卡点「执行/取消」→ 直接调裁决端点（批准自动恢复执行复用第二刀回执） */
  const confirmFromChat = async (msg: Message, decision: 'approve' | 'reject') => {
    const pendingId = msg.confirm?.pendingId;
    if (!pendingId || confirmingId) return;
    setConfirmingId(msg.id);
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/decisions/${pendingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: 'chat_card', mode }),
      });
      const data = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        executed?: ExecutedReceipt;
      } | null;
      if (!resp.ok || !data?.ok) {
        appendChatReceipt(
          `ℹ️ 该操作未能${decision === 'approve' ? '批准' : '取消'}（${data?.error ?? '请求失败'}），可能已在别处处理。`,
          '人类裁决',
        );
        return;
      }
      if (decision === 'reject') {
        appendChatReceipt('❌ 已取消该操作，不会执行。');
      } else if (data.executed?.error) {
        appendChatReceipt(`⚠️ 已批准并记录，但自动恢复执行失败：${data.executed.error}`);
      } else if (data.executed?.answer) {
        appendChatReceipt(`✅ 老板，已按你的批准执行。\n${data.executed.answer}`);
      } else {
        appendChatReceipt('✅ 已批准并记录。');
      }
    } catch {
      appendChatReceipt('⚠️ 无法连接 gateway，确认提交失败。', '人类裁决');
    } finally {
      // 无论成功/失败都收掉按钮，避免对已裁决 pending 重复提交
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, confirm: undefined } : m)),
      );
      setConfirmingId(null);
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
    <div className={roleOpen ? 'shell-v2 role-open' : 'shell-v2'}>
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
          className={roleOpen ? 'active' : ''}
          onClick={() => setRoleOpen((prev) => !prev)}
          aria-label="角色面板"
          title="角色面板"
        >
          <Users size={19} />
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

      {roleOpen && (
        <RolePanel
          mode={mode}
          submode={submode}
          onClose={() => setRoleOpen(false)}
          onOpenSkills={() => {
            setSettingsKey('skills');
            setSettingsOpen(true);
          }}
        />
      )}

      <main className="center-v2">
        {settingsOpen ? (
          <SettingsPanel
            settingsKey={settingsKey}
            onSelect={setSettingsKey}
            mode={mode}
            shellEnabled={shellEnabled}
            onShellChange={setShellEnabled}
            onBack={() => setSettingsOpen(false)}
          />
        ) : (
          <section className="chat-v2">
            <header className="chat-head">
              <div>
                <h1>一人公司 AI-Agent</h1>
                <span>
                  {progressStage
                    ? `进度：${progressStage}`
                    : '意图自动识别 · 无缝切换 · 本地 gateway'}
                </span>
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
                  feedback={feedbackByMessage[msg.id]}
                  onFeedback={(value, details) => submitFeedback(msg, value, details)}
                  onEvidence={handleEvidenceClick}
                  onConfirm={confirmFromChat}
                  confirming={confirmingId === msg.id}
                  onRetry={retryFallback}
                  retrying={retryingId === msg.id}
                />
              ))}
            </div>
            <Composer
              value={input}
              onChange={setInput}
              onSend={send}
              model={model}
              onModelChange={(id) => {
                modelTouchedRef.current = true;
                setModel(id);
              }}
              models={models}
              contextUsage={contextUsage}
              mode={mode}
              submode={submode}
              manualLocked={manualLocked}
              onModeManual={(next) => {
                applyMode(next);
                setManualLocked(true);
              }}
              onModeAuto={() => setManualLocked(false)}
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
                ['notifications', '通知', Bell],
                ['decisions', '裁决', Gavel],
              ] as Array<[RightTab, string, LucideIcon]>
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                className={rightTab === key ? 'active' : ''}
                onClick={() => setRightTab(key)}
              >
                <Icon size={14} />
                {label}
                {key === 'notifications' && unreadNotify > 0 && (
                  <span className="tab-badge">{unreadNotify > 99 ? '99+' : unreadNotify}</span>
                )}
              </button>
            ))}
            <button className="right-close" onClick={() => setRightOpen(false)} aria-label="收起右侧栏">
              <X size={15} />
            </button>
          </div>
          <div className="right-body">
            {rightTab === 'files' && (
              <div className="file-list">
                <div className="notify-toolbar">
                  <span className="settings-note">
                    {files.length > 0
                      ? `共 ${files.length} 个文件 · 按修改时间新→旧，往下滚动看全部`
                      : '暂无文件'}
                  </span>
                  <button disabled={filesRefreshing} onClick={() => { loadFiles(false, true); loadRecentChanges(); }}>
                    {filesRefreshing ? '刷新中…' : '刷新'}
                  </button>
                </div>
                {recentChanges.length > 0 && (
                  <div className="change-log">
                    <div className="change-log-head">
                      最近变更（{recentChanges.length}）· 外部工具/手动改动约 2s 内记录
                    </div>
                    {recentChanges.map((item, idx) => (
                      <div className="change-row" key={`${item.path}-${item.at}-${idx}`}>
                        <span className={`change-kind ${item.kind}`}>
                          {item.kind === 'added' ? '新增' : item.kind === 'removed' ? '删除' : '修改'}
                        </span>
                        <span className="change-path" title={item.path}>
                          {item.path}
                        </span>
                        <span className="change-time">{formatChangeTime(item.at)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {filePreview && (
                  <div className="file-preview">
                    <div className="file-preview-bar">
                      <strong>{filePreview.path}</strong>
                      <span>
                        {filePreview.path.toLowerCase().endsWith('.xmind')
                          ? '思维导图 · '
                          : ''}
                        {(filePreview.size / 1024).toFixed(1)} KB
                        {filePreview.truncated ? ' · 内容过长已截断' : ''}
                      </span>
                      {filePreview.htmlUrl && (
                        <a
                          className="file-preview-open"
                          href={filePreview.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="在浏览器新标签打开（可全屏/缩放）"
                        >
                          ↗
                        </a>
                      )}
                      <button
                        className="file-preview-close"
                        onClick={() => setFilePreview(null)}
                        title="关闭预览"
                      >
                        ✕
                      </button>
                    </div>
                    {filePreview.htmlUrl ? (
                      <iframe
                        className="file-preview-frame"
                        src={filePreview.htmlUrl}
                        sandbox="allow-scripts"
                        title={`HTML 产物预览：${filePreview.path}`}
                      />
                    ) : filePreview.tree ? (
                      <MindMapViewer tree={filePreview.tree} outline={filePreview.text} />
                    ) : (
                      <pre className="file-preview-body">{filePreview.text}</pre>
                    )}
                  </div>
                )}
                {filePreviewError && <p className="settings-note">{filePreviewError}</p>}
                {Object.entries(generatingSkills).map(([skill, label]) => (
                  <div className="file-row generating" key={skill}>
                    <FileText size={15} />
                    <div>
                      <strong>{skill}</strong>
                      <span>{label}</span>
                    </div>
                  </div>
                ))}
                {files.length === 0 && <p className="settings-note">暂无产物文件</p>}
                {files.map((file) => (
                  <div
                    className={`file-row ${highlightFile === file.path ? 'highlight' : ''}`}
                    key={file.path}
                    onClick={() => setHighlightFile(file.path)}
                    onDoubleClick={() => previewFile(file.path)}
                    title="单击高亮定位 · 双击只读预览"
                  >
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
                  <span>{browserUrl}</span>
                  <ArrowUpRight size={14} />
                </div>
                <div className="browser-body">
                  <strong>{browserHost(browserUrl)}</strong>
                  <span>点击证据来源跳转到此页；内置浏览器使用独立会话，登录态场景走主浏览器或后端代理。</span>
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
            {rightTab === 'notifications' && (
              <div className="file-list">
                <div className="notify-toolbar">
                  <span className="settings-note">
                    共 {notifyTotal} 条
                    {notifyTotal > 0 ? ` · 第 ${notifyPage}/${Math.max(1, Math.ceil(notifyTotal / 20))} 页` : ''}
                    · 30s 自动刷新
                  </span>
                  <span className="notify-pager">
                    <button
                      disabled={notifyPage <= 1 || notifyTotal === 0}
                      onClick={() => goNotifyPage(notifyPage - 1)}
                    >
                      上一页
                    </button>
                    <button
                      disabled={notifyPage >= Math.max(1, Math.ceil(notifyTotal / 20)) || notifyTotal === 0}
                      onClick={() => goNotifyPage(notifyPage + 1)}
                    >
                      下一页
                    </button>
                    <button onClick={() => loadNotifications(notifyPage, { markSeen: true })}>刷新</button>
                  </span>
                </div>
                {notifyHint && <p className="settings-note">{notifyHint}</p>}
                {dailyFeedback && !notifyHint && (
                  <div className="daily-feedback-summary">
                    <strong>今日反馈</strong>
                    <span>{dailyFeedback.text}</span>
                  </div>
                )}
                {notifications.length === 0 && !notifyHint && (
                  <p className="settings-note">暂无通知（裁决 / Skill 输出 / AI 运营事件会自动出现）</p>
                )}
                {notifications.map((entry) => (
                  <div className="file-row notify-row" key={entry.id}>
                    <span className="notify-dot">
                      {entry.priority === 'urgent' ? '🔴' : entry.priority === 'normal' ? '🟡' : '🟢'}
                    </span>
                    <div>
                      <strong>{entry.title}</strong>
                      <span>
                        {entry.role} · {entry.kind} · {entry.source}
                        {entry.detail ? ` · ${entry.detail}` : ''}
                      </span>
                    </div>
                    <span className="notify-time">{fmtNotifyTime(entry.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
            {rightTab === 'decisions' && (
              <DecisionPanel mode={mode} onExecuted={pushExecutedReceipt} />
            )}
          </div>
        </aside>
      )}

      <footer className="statusbar-v2">
        <span className="status-mode">
          <ShieldCheck size={13} />
          {statusNotice ? '资源告警' : '系统正常'}
        </span>
        {statusNotice && (
          <span className="status-notice" title={statusNotice}>
            ⚠️ {statusNotice}
          </span>
        )}
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

function browserHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** E348：从回复文本里提取 .xmind 产物路径（绝对/相对，去尾部标点，去重，最多 3 个） */
function extractXmindPaths(text: string): string[] {
  const paths: string[] = [];
  const re = /[\w:./\\-]+\.xmind/gi;
  for (const m of text.matchAll(re)) {
    const raw = m[0].replace(/[，。；、:：]+$/u, '');
    if (!paths.includes(raw)) paths.push(raw);
  }
  return paths.slice(0, 3);
}

function MessageItem({
  msg,
  feedback,
  onFeedback,
  onEvidence,
  onConfirm,
  confirming,
  onRetry,
  retrying,
}: {
  msg: Message;
  feedback: FeedbackValue | undefined;
  onFeedback: (
    value: FeedbackValue,
    details?: { reason?: FeedbackReason; note?: string; correctedAnswer?: string },
  ) => Promise<boolean>;
  onEvidence: (ev: Evidence) => void;
  onConfirm?: (msg: Message, decision: 'approve' | 'reject') => void;
  confirming: boolean;
  onRetry?: (msgId: string, query: string) => void;
  retrying?: boolean;
}) {
  const isUser = msg.role === 'user';
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [dislikeOpen, setDislikeOpen] = useState(false);
  const [feedbackReason, setFeedbackReason] = useState<FeedbackReason | undefined>();
  const [feedbackNote, setFeedbackNote] = useState('');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctedAnswer, setCorrectedAnswer] = useState(msg.text);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const xmindPaths = useMemo(() => extractXmindPaths(msg.text), [msg.text]);
  return (
    <article className={`message ${isUser ? 'user' : 'agent'}`}>
      <div className="message-avatar">
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className="message-body">
        {msg.meta && <div className="message-meta">{msg.meta}</div>}
        {msg.notice && <div className="message-notice">⚠️ {msg.notice}</div>}
        {msg.images && msg.images.length > 0 && (
          <div className="message-images">
            {msg.images.map((src) => (
              <img key={src} src={src} alt="粘贴图片" />
            ))}
          </div>
        )}
        <div className="message-text">{msg.text}</div>
        {msg.artifacts?.map((artifact, index) => (
          <KeilArtifactCard
            key={`${artifact.kind}-${index}`}
            artifact={artifact}
            onOpenFile={onEvidence}
          />
        ))}
        {xmindPaths.map((p) => (
          <XmindBubble key={p} path={p} />
        ))}
        {msg.retryQuery && (
          <div className="message-retry">
            <button
              disabled={retrying}
              title={`重发原句：${msg.retryQuery}`}
              onClick={() => onRetry?.(msg.id, msg.retryQuery ?? '')}
            >
              {retrying
                ? '重试中…'
                : `↻ 重试「${msg.retryQuery.length > 16 ? `${msg.retryQuery.slice(0, 16)}…` : msg.retryQuery}」`}
            </button>
          </div>
        )}
        {msg.confirm && (
          <div className="confirm-actions">
            <span className="confirm-caption">这是一步会落盘/外发的写操作，请确认：</span>
            <button
              className="confirm-btn approve"
              disabled={confirming}
              onClick={() => onConfirm?.(msg, 'approve')}
            >
              {confirming ? '执行中…' : '执行'}
            </button>
            <button
              className="confirm-btn reject"
              disabled={confirming}
              onClick={() => onConfirm?.(msg, 'reject')}
            >
              取消
            </button>
          </div>
        )}
        {msg.videos && msg.videos.length > 0 && (
          <div className="video-cards">
            {msg.videos.map((v, i) => (
              <a
                className="video-card"
                key={`${v.url}-${i}`}
                href={v.url}
                target="_blank"
                rel="noreferrer"
              >
                <span className="video-thumb">▶</span>
                <strong>{v.title}</strong>
                <small>{PLATFORM_LABELS[v.platform] ?? v.platform}</small>
              </a>
            ))}
          </div>
        )}
        {msg.evidence && msg.evidence.length > 0 && (
          <div className="evidence-list">
            {msg.evidence.map((ev, i) => (
              <div className="evidence-item" key={`${ev.label}-${i}`}>
                <button
                  className={`evidence-chip ${ev.type === 'test' && expandedTest === ev.label ? 'expanded' : ''}`}
                  onClick={() => {
                    if (ev.type === 'test') {
                      setExpandedTest((prev) => (prev === ev.label ? null : ev.label));
                    } else {
                      onEvidence(ev);
                    }
                  }}
                  title={
                    ev.type === 'search'
                      ? '在内置浏览器打开来源'
                      : ev.type === 'file'
                        ? '在文件面板打开并高亮'
                        : ev.type === 'terminal'
                          ? '切换到终端面板定位'
                          : '展开/收起测试详情'
                  }
                >
                  <span>{ev.type === 'search' ? (ev.hard ? 'H' : 'S') : ev.type === 'file' ? 'F' : ev.type === 'terminal' ? 'T' : 'C'}</span>
                  <div>
                    <strong>{ev.label}</strong>
                    <small>{ev.detail}</small>
                  </div>
                  <ArrowUpRight size={13} />
                </button>
                {ev.type === 'test' && expandedTest === ev.label && (
                  <div className="evidence-detail">
                    <strong>测试详情</strong>
                    <code>{ev.label}</code>
                    <p>{ev.detail}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {!isUser && (
          <div className="feedback-row">
            <button
              className={feedback === 'accept' ? 'liked' : ''}
              aria-label="赞"
              disabled={feedbackSubmitting}
              onClick={() => {
                setDislikeOpen(false);
                setCorrectionOpen(false);
                void onFeedback('accept');
              }}
            >
              <ThumbsUp size={14} />
            </button>
            <button
              className={feedback === 'reject' ? 'disliked' : ''}
              aria-label="踩"
              disabled={feedbackSubmitting}
              onClick={() => {
                setCorrectionOpen(false);
                setDislikeOpen((open) => !open);
              }}
            >
              <ThumbsDown size={14} />
            </button>
            <button
              className={feedback === 'correct' ? 'corrected' : ''}
              aria-label="修改建议"
              disabled={feedbackSubmitting}
              onClick={() => {
                setDislikeOpen(false);
                setCorrectionOpen((open) => !open);
              }}
            >
              <PenLine size={14} />
            </button>
          </div>
        )}
        {!isUser && dislikeOpen && (
          <div className="feedback-details">
            <span>哪里需要改进？（可选）</span>
            <div className="feedback-reasons">
              {(Object.entries(FEEDBACK_REASON_LABELS) as Array<[FeedbackReason, string]>).map(
                ([reason, label]) => (
                  <button
                    className={feedbackReason === reason ? 'active' : ''}
                    key={reason}
                    onClick={() => setFeedbackReason((current) => current === reason ? undefined : reason)}
                    type="button"
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
            <textarea
              value={feedbackNote}
              onChange={(event) => setFeedbackNote(event.target.value)}
              placeholder="补充说明（可选）"
            />
            <button
              className="feedback-submit"
              disabled={feedbackSubmitting}
              onClick={async () => {
                setFeedbackSubmitting(true);
                const saved = await onFeedback('reject', {
                  reason: feedbackReason,
                  note: feedbackNote.trim() || undefined,
                });
                setFeedbackSubmitting(false);
                if (saved) setDislikeOpen(false);
              }}
              type="button"
            >
              {feedbackSubmitting ? '提交中…' : '提交反馈'}
            </button>
          </div>
        )}
        {!isUser && correctionOpen && (
          <div className="feedback-details">
            <span>直接修改这条回复</span>
            <textarea
              value={correctedAnswer}
              onChange={(event) => setCorrectedAnswer(event.target.value)}
              placeholder="输入你认为更合适的完整回复"
            />
            <button
              className="feedback-submit"
              disabled={
                feedbackSubmitting ||
                !correctedAnswer.trim() ||
                correctedAnswer.trim() === msg.text.trim()
              }
              onClick={async () => {
                setFeedbackSubmitting(true);
                const saved = await onFeedback('correct', {
                  correctedAnswer: correctedAnswer.trim(),
                });
                setFeedbackSubmitting(false);
                if (saved) setCorrectionOpen(false);
              }}
              type="button"
            >
              {feedbackSubmitting ? '提交中…' : '保存修改'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function KeilArtifactCard({
  artifact,
  onOpenFile,
}: {
  artifact: SkillArtifact;
  onOpenFile: (ev: Evidence) => void;
}) {
  if (artifact.kind === 'project-change-confirmation') {
    const changes = Array.isArray(artifact.data.changes)
      ? artifact.data.changes.filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
        )
      : [];
    return (
      <section className="keil-artifact">
        <div className="keil-artifact-head">
          <strong>{artifact.title}</strong>
          <span>{Number(artifact.data.totalBytes ?? 0)} bytes</span>
        </div>
        <small>事务：{String(artifact.data.transactionId ?? '')}</small>
        <div className="keil-diagnostics">
          {changes.map((change, index) => (
            <div className="keil-diagnostic warning" key={`${String(change.path)}-${index}`}>
              <span>{change.action === 'create' ? '新建' : '修改'}</span>
              <div>
                <strong>{String(change.path ?? '')}</strong>
                <small>{Number(change.bytes ?? 0)} 字节 · SHA-256 {String(change.proposedSha256 ?? '').slice(0, 12)}…</small>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (artifact.kind === 'keil-targets') {
    const targets = Array.isArray(artifact.data.targets)
      ? artifact.data.targets.filter((item): item is string => typeof item === 'string')
      : [];
    return (
      <section className="keil-artifact">
        <strong>{artifact.title}</strong>
        <small>{String(artifact.data.projectPath ?? '')}</small>
        <div className="keil-targets">
          {targets.length ? targets.map((target) => <span key={target}>{target}</span>) : <em>未声明 target</em>}
        </div>
      </section>
    );
  }
  if (artifact.kind !== 'keil-diagnostics') return null;
  const diagnostics = Array.isArray(artifact.data.diagnostics)
    ? artifact.data.diagnostics.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
  return (
    <section className="keil-artifact">
      <div className="keil-artifact-head">
        <strong>{artifact.title}</strong>
        <span>{Number(artifact.data.errorCount ?? 0)} error · {Number(artifact.data.warningCount ?? 0)} warning</span>
      </div>
      {typeof artifact.data.target === 'string' && <small>target：{artifact.data.target}</small>}
      <div className="keil-diagnostics">
        {diagnostics.length === 0 && <em>没有结构化诊断</em>}
        {diagnostics.map((item, index) => {
          const severity = item.severity === 'error' ? 'error' : 'warning';
          const sourcePath = typeof item.sourcePath === 'string' ? item.sourcePath : '';
          const line = typeof item.line === 'number' ? item.line : undefined;
          const location = sourcePath || (typeof item.file === 'string' ? item.file : '');
          return (
            <button
              type="button"
              className={`keil-diagnostic ${severity}`}
              key={`${location}-${line ?? 0}-${index}`}
              disabled={!sourcePath}
              onClick={() => sourcePath && onOpenFile({
                type: 'file',
                label: sourcePath,
                detail: line ? `第 ${line} 行` : '源码文件',
              })}
              title={sourcePath ? '在文件面板只读预览' : '诊断路径不在工作区或文件不存在'}
            >
              <span>{severity}</span>
              <div>
                <strong>{location}{line ? `:${line}` : ''}</strong>
                <small>{[item.code, item.message].filter(Boolean).map(String).join(' ')}</small>
              </div>
            </button>
          );
        })}
      </div>
    </section>
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
  onModeAuto,
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
  onModeAuto: () => void;
}) {
  const [attachOpen, setAttachOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentModel = models.find((item) => item.id === model) ?? models[0];
  // 输入框随内容自动增高，最多 ~7 行（与 CSS max-height:148px 对齐），超出出现纵向滚动条
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`;
  }, [value]);
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
            {manualLocked && (
              <span className="lock-tag" title="已手动锁定：点击恢复自动识别" onClick={onModeAuto} role="button">锁定</span>
            )}
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
              <button
                className={!manualLocked ? 'active' : ''}
                onClick={() => {
                  onModeAuto();
                  setModeOpen(false);
                }}
              >
                <Sparkles size={15} />
                <span>自动识别</span>
                <small>按问题自动切换模式</small>
              </button>
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
          ref={textareaRef}
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
  mode,
  shellEnabled,
  onShellChange,
  onBack,
}: {
  settingsKey: SettingsKey;
  onSelect: (key: SettingsKey) => void;
  mode: UiMode;
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
        {settingsKey === 'mail' && <MailSettings />}
        {settingsKey === 'balance' && <BalanceSettings />}
        {settingsKey === 'calendar' && <CalendarSettings />}
        {settingsKey === 'routing' && <RoutingSettings />}
        {settingsKey === 'skills' && <SkillsSettings />}
        {settingsKey === 'memory' && <MemorySettings mode={mode} />}
        {settingsKey === 'usage' && <UsageSettings />}
      </div>
    </section>
  );
}

function BalanceSettings() {
  const [balance, setBalance] = useState<{
    ok: boolean;
    remainingYuan: number | null;
    remainingCalls: number | null;
    fetchedAt: string | null;
    notice: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/bocha/balance`);
      const data = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        remainingYuan?: number | null;
        remainingCalls?: number | null;
        fetchedAt?: string | null;
        notice?: string | null;
      } | null;
      setBalance({
        ok: data?.ok ?? false,
        remainingYuan: data?.remainingYuan ?? null,
        remainingCalls: data?.remainingCalls ?? null,
        fetchedAt: data?.fetchedAt ?? null,
        notice: data?.notice ?? (resp.ok ? null : '无法连接 Gateway，请确认服务已启动'),
      });
    } catch {
      setBalance({ ok: false, remainingYuan: null, remainingCalls: null, fetchedAt: null, notice: '无法连接 Gateway，请确认服务已启动' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const exhausted = balance != null && balance.ok && (balance.remainingCalls ?? 0) <= 0;
  const low = balance != null && balance.ok && !exhausted && (balance.remainingCalls ?? 0) <= 10;

  return (
    <div className="settings-form">
      <div className="balance-card">
        {loading ? (
          <p className="settings-note">加载中…</p>
        ) : !balance || !balance.ok ? (
          <p className="settings-note">{balance?.notice ?? '余额查询失败（未配置 BOCHA_API_KEY 或网络异常）。'}</p>
        ) : (
          <>
            <div className="balance-row">
              <span>账户余额</span>
              <strong>¥{balance.remainingYuan?.toFixed(2) ?? '--'}</strong>
            </div>
            <div className="balance-row">
              <span>预计可用</span>
              <strong>{balance.remainingCalls ?? '--'} 次</strong>
            </div>
            <div className="balance-row">
              <span>查询时间</span>
              <span className="settings-note">
                {balance.fetchedAt ? new Date(balance.fetchedAt).toLocaleString() : '--'}
              </span>
            </div>
            {exhausted && (
              <p className="balance-alert">
                ⚠️ Bocha 余额已耗尽，搜索将由 AnySearch/浏览器独立兜底；请购买体验包（防按量 10 倍成本）。
              </p>
            )}
            {low && (
              <p className="balance-alert">
                ⚠️ 余额告警：仅剩约 {balance.remainingCalls} 次，请及时购买体验包。
              </p>
            )}
            {balance.ok && !exhausted && !low && (
              <p className="settings-note">✅ 余额健康，无需充值。剩余次数按 [P-75] 0.0036 元/次折算。</p>
            )}
            <div className="balance-foot">
              <button className="add-provider" onClick={() => void load()}>
                刷新
              </button>
            </div>
          </>
        )}
      </div>
    </div>
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

function MailSettings() {
  const [form, setForm] = useState({
    host: '',
    port: '465',
    secure: true,
    user: '',
    pass: '',
    from: '',
  });
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState('');
  const [mail, setMail] = useState({ to: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState('');

  const load = () => {
    fetch(`${GATEWAY_URL}/api/mail/credentials`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then(
        (
          data: {
            configured?: boolean;
            host?: string;
            port?: number;
            secure?: boolean;
            user?: string;
            from?: string;
          } | null,
        ) => {
          if (!data?.configured) return;
          setConfigured(true);
          setForm((prev) => ({
            ...prev,
            host: data.host ?? '',
            port: String(data.port ?? 465),
            secure: data.secure ?? true,
            user: data.user ?? '',
            from: data.from ?? '',
          }));
        },
      )
      .catch(() => setStatus('读取凭据失败'));
  };
  useEffect(load, []);

  const set =
    (key: keyof typeof form) =>
    (value: string) =>
      setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setStatus('');
    const resp = await fetch(`${GATEWAY_URL}/api/mail/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: form.host.trim(),
        port: Number(form.port),
        secure: form.secure,
        user: form.user.trim(),
        pass: form.pass,
        from: form.from.trim(),
      }),
    });
    const data = (await resp.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
    if (resp.ok && data?.ok) {
      setConfigured(true);
      setStatus('已保存 SMTP 凭据');
    } else {
      setStatus(data?.error ?? '保存失败');
    }
  };

  const setMailField =
    (key: keyof typeof mail) =>
    (value: string) =>
      setMail((prev) => ({ ...prev, [key]: value }));

  const sendMail = async () => {
    if (!mail.to.trim() || !mail.subject.trim() || !mail.body.trim()) {
      setSendStatus('请填写收件人、主题和正文。');
      return;
    }
    setSending(true);
    setSendStatus('');
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `发送邮件给 ${mail.to.trim()}，主题：${mail.subject.trim()}，正文：${mail.body.trim()}`,
        }),
      });
      const data = (await resp.json().catch(() => null)) as
        | { answer?: string; error?: string }
        | null;
      if (resp.ok && data?.answer) {
        setSendStatus(data.answer);
      } else {
        setSendStatus(data?.error ?? '发送失败，请稍后重试。');
      }
    } catch {
      setSendStatus('无法连接 Gateway，请确认服务已启动。');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="settings-form">
      {configured && (
        <p className="settings-note">
          已配置：{form.user}（{form.host}:{form.port}）。授权码保存后不回显，修改时需重新填写。
        </p>
      )}
      <div className="allowlist-row">
        <span>SMTP 服务器</span>
        <input value={form.host} onChange={(e) => set('host')(e.target.value)} placeholder="smtp.qq.com" />
      </div>
      <div className="allowlist-row">
        <span>端口</span>
        <input value={form.port} onChange={(e) => set('port')(e.target.value)} placeholder="465" />
      </div>
      <div className="allowlist-row">
        <span>账号</span>
        <input value={form.user} onChange={(e) => set('user')(e.target.value)} placeholder="you@qq.com" />
      </div>
      <div className="allowlist-row">
        <span>授权码</span>
        <input type="password" value={form.pass} onChange={(e) => set('pass')(e.target.value)} placeholder="保存后不回显" />
      </div>
      <div className="allowlist-row">
        <span>发件人</span>
        <input value={form.from} onChange={(e) => set('from')(e.target.value)} placeholder="you@qq.com" />
      </div>
      <div className="toggle-row">
        <span>SSL/TLS 直连（465 端口通常开启）</span>
        <button
          className={`toggle ${form.secure ? 'on' : ''}`}
          onClick={() => setForm((prev) => ({ ...prev, secure: !prev.secure }))}
          aria-pressed={form.secure}
        >
          <i />
        </button>
      </div>
      <button className="add-provider" onClick={save}>
        保存凭据
      </button>
      {status && <p className="settings-note">{status}</p>}
      <hr className="settings-sep" />
      <p className="settings-note">
        发送邮件（收件人/主题/正文必填；走 Agent 同一问答管道，未配置凭据时会被诚实拦截）。
      </p>
      <div className="allowlist-row">
        <span>收件人</span>
        <input value={mail.to} onChange={(e) => setMailField('to')(e.target.value)} placeholder="rcpt@example.com" />
      </div>
      <div className="allowlist-row">
        <span>主题</span>
        <input value={mail.subject} onChange={(e) => setMailField('subject')(e.target.value)} placeholder="邮件主题" />
      </div>
      <div className="allowlist-row">
        <span>正文</span>
        <textarea
          value={mail.body}
          onChange={(e) => setMailField('body')(e.target.value)}
          placeholder="邮件正文…"
          rows={4}
        />
      </div>
      <button className="add-provider" onClick={sendMail} disabled={sending}>
        {sending ? '发送中…' : '发送邮件'}
      </button>
      {sendStatus && <p className="settings-note">{sendStatus}</p>}
    </div>
  );
}

function CalendarSettings() {
  const [status, setStatus] = useState('');

  const exportIcs = async () => {
    setStatus('');
    const resp = await fetch(`${GATEWAY_URL}/api/calendar/export`);
    if (!resp.ok) {
      setStatus('暂无日程可导出，先安排日程后再试。');
      return;
    }
    const text = await resp.text();
    const blob = new Blob([text], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-butler-calendar.ics';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('已导出 ai-butler-calendar.ics');
  };

  const importIcs = async (file: File | undefined) => {
    if (!file) return;
    setStatus('');
    const text = await file.text();
    const resp = await fetch(`${GATEWAY_URL}/api/calendar/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ics: text }),
    });
    const data = (await resp.json().catch(() => null)) as
      | { ok?: boolean; imported?: number; skipped?: number; error?: string }
      | null;
    if (resp.ok && data?.ok) {
      setStatus(
        `已导入 ${data.imported ?? 0} 条日程${data.skipped ? `，跳过 ${data.skipped} 条` : ''}`,
      );
    } else {
      setStatus(data?.error ?? '导入失败');
    }
  };

  return (
    <div className="settings-form">
      <div className="allowlist-row">
        <span>导出 .ics</span>
        <button className="add-provider" onClick={exportIcs}>
          导出日历
        </button>
      </div>
      <div className="allowlist-row">
        <span>导入 .ics</span>
        <label className="add-provider">
          选择文件
          <input
            type="file"
            accept=".ics,text/calendar"
            style={{ display: 'none' }}
            onChange={(e) => importIcs(e.target.files?.[0])}
          />
        </label>
      </div>
      <p className="settings-note">
        导出文件可导入 Outlook / 苹果日历 / 谷歌日历；导入会去重，并跳过无有效时间或每月/每年等复杂重复的日程。
      </p>
      {status && <p className="settings-note">{status}</p>}
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
    Array<{
      name: string;
      version: string;
      triggers: string[];
      enabled: boolean;
      state: 'active' | 'cold' | 'review';
      thumbsDownCount: number;
      consecutiveDown: number;
    }>
  >([]);
  const [candidates, setCandidates] = useState<
    Array<{
      id: string;
      title: string;
      description: string;
      sampleCount: number;
      latestSample: string;
      status: 'proposed' | 'accepted' | 'rejected';
      ruleEnabled: boolean;
      ruleLifecycle: {
        usageCount: number;
        thumbsDownCount: number;
        consecutiveDown: number;
        needsReview: boolean;
      } | null;
      latestNegativeFeedback: {
        reason?: 'irrelevant' | 'too_verbose' | 'technical_error' | 'missing_key_point';
        note?: string;
        query: string;
        answer: string;
        createdAt: number;
      } | null;
    }>
  >([]);
  const [category, setCategory] = useState('all');
  const [restoring, setRestoring] = useState<string | null>(null);
  const [decidingCandidate, setDecidingCandidate] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, {
    name: string;
    version: string;
    description: string;
    triggers: string[];
    permissions: string[];
    scope: string;
    instructions: string[];
    skillMarkdown: string;
    installable: boolean;
    installBlocker: string | null;
  }>>({});
  const [updatingRule, setUpdatingRule] = useState<string | null>(null);

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
    Promise.all([
      fetch(`${GATEWAY_URL}/api/skills`).then((resp) => (resp.ok ? resp.json() : null)),
      fetch(`${GATEWAY_URL}/api/skill-candidates?userId=ui-user`).then((resp) =>
        resp.ok ? resp.json() : null,
      ),
    ])
      .then(([skillData, candidateData]: [
        { skills?: typeof skills } | null,
        { candidates?: typeof candidates } | null,
      ]) => {
        setSkills(skillData?.skills ?? []);
        setCandidates(candidateData?.candidates ?? []);
      })
      .catch(() => {
        setSkills([]);
        setCandidates([]);
      });
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

  const restoreReview = async (name: string) => {
    if (!window.confirm(`确认恢复 Skill「${name}」？累计 👎 会保留。`)) return;
    setRestoring(name);
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/skills/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, action: 'restore' }),
      });
      if (resp.ok) load();
    } finally {
      setRestoring(null);
    }
  };

  const decideCandidate = async (id: string, decision: 'accept' | 'reject') => {
    const prompt = decision === 'accept'
      ? '确认保留这个 Skill 候选？这一步不会安装或启用 Skill。'
      : '确认忽略这个 Skill 候选？';
    if (!window.confirm(prompt)) return;
    setDecidingCandidate(id);
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/skill-candidates/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'ui-user', decision }),
      });
      if (resp.ok) load();
    } finally {
      setDecidingCandidate(null);
    }
  };

  const loadCandidateDraft = async (id: string) => {
    setLoadingDraft(id);
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/skill-candidates/${id}/draft?userId=ui-user`);
      if (!resp.ok) return;
      const data = (await resp.json()) as { draft?: (typeof drafts)[string] };
      if (data.draft) setDrafts((prev) => ({ ...prev, [id]: data.draft! }));
    } finally {
      setLoadingDraft(null);
    }
  };

  const updateCandidateRule = async (
    id: string,
    action: 'enable' | 'disable' | 'restore_review',
  ) => {
    const prompt = action === 'enable'
      ? '确认启用这条回答规则？后续回答会按该规则处理。'
      : action === 'disable'
        ? '确认停用这条回答规则？历史审计记录会保留。'
        : '确认该规则已复审完成？累计反馈、使用次数和审计历史会保留。';
    if (!window.confirm(prompt)) return;
    setUpdatingRule(id);
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/skill-candidates/${id}/rule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'ui-user', action }),
      });
      if (resp.ok) load();
    } finally {
      setUpdatingRule(null);
    }
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
      {candidates.filter((candidate) => candidate.status !== 'rejected').map((candidate) => (
        <div className="skill-candidate-card" key={candidate.id}>
          <strong>
            {candidate.ruleEnabled
              ? '已启用规则'
              : candidate.status === 'accepted'
                ? '已保留候选'
                : '待确认候选'} · {candidate.title}
          </strong>
          <span>{candidate.description}（同类修订 {candidate.sampleCount} 条）</span>
          <small title={candidate.latestSample}>最近样例：{candidate.latestSample}</small>
          {candidate.ruleLifecycle && (
            <small>
              状态：{candidate.ruleLifecycle.needsReview ? '需复审' : '正常'}
              {' · '}使用 {candidate.ruleLifecycle.usageCount}
              {' · '}累计 👎 {candidate.ruleLifecycle.thumbsDownCount}
              {' · '}连续 👎 {candidate.ruleLifecycle.consecutiveDown}
            </small>
          )}
          {candidate.ruleLifecycle?.needsReview && candidate.latestNegativeFeedback && (
            <div className="skill-review-evidence">
              <strong>最近负反馈证据</strong>
              <small>
                原因：{candidate.latestNegativeFeedback.reason
                  ? ({
                      irrelevant: '答非所问',
                      too_verbose: '太啰嗦',
                      technical_error: '技术错误',
                      missing_key_point: '漏了重点',
                    } as const)[candidate.latestNegativeFeedback.reason]
                  : '未选择'}
                {' · '}{new Date(candidate.latestNegativeFeedback.createdAt).toLocaleString()}
              </small>
              {candidate.latestNegativeFeedback.note && (
                <small>补充说明：{candidate.latestNegativeFeedback.note}</small>
              )}
              <small>原问题：{candidate.latestNegativeFeedback.query}</small>
              <small>原回答：{candidate.latestNegativeFeedback.answer}</small>
            </div>
          )}
          {candidate.ruleLifecycle?.needsReview && (
            <button
              className="skill-review-restore"
              disabled={updatingRule === candidate.id}
              onClick={() => void updateCandidateRule(candidate.id, 'restore_review')}
              type="button"
            >
              {updatingRule === candidate.id ? '恢复中…' : '复审完成'}
            </button>
          )}
          <div className="skill-candidate-actions">
            {candidate.status === 'proposed' ? (
              <>
                <button
                  disabled={decidingCandidate === candidate.id}
                  onClick={() => void decideCandidate(candidate.id, 'accept')}
                  type="button"
                >
                  保留候选
                </button>
                <button
                  disabled={decidingCandidate === candidate.id}
                  onClick={() => void decideCandidate(candidate.id, 'reject')}
                  type="button"
                >
                  忽略
                </button>
              </>
            ) : (
              <>
                <button
                  disabled={loadingDraft === candidate.id}
                  onClick={() => void loadCandidateDraft(candidate.id)}
                  type="button"
                >
                  {loadingDraft === candidate.id ? '生成中…' : '预览草案'}
                </button>
                {candidate.ruleEnabled && (
                  <button
                    disabled={updatingRule === candidate.id}
                    onClick={() => void updateCandidateRule(candidate.id, 'disable')}
                    type="button"
                  >
                    停用规则
                  </button>
                )}
              </>
            )}
          </div>
          {drafts[candidate.id] && (
            <div className="skill-draft-preview">
              {drafts[candidate.id].installBlocker && (
                <span>{drafts[candidate.id].installBlocker}</span>
              )}
              <pre>{JSON.stringify({
                name: drafts[candidate.id].name,
                version: drafts[candidate.id].version,
                description: drafts[candidate.id].description,
                triggers: drafts[candidate.id].triggers,
                permissions: drafts[candidate.id].permissions,
                scope: drafts[candidate.id].scope,
                instructions: drafts[candidate.id].instructions,
                installable: drafts[candidate.id].installable,
              }, null, 2)}{`\n\n${drafts[candidate.id].skillMarkdown}`}</pre>
              {drafts[candidate.id].installable && !candidate.ruleEnabled && (
                <button
                  className="skill-rule-enable"
                  disabled={updatingRule === candidate.id}
                  onClick={() => void updateCandidateRule(candidate.id, 'enable')}
                  type="button"
                >
                  {updatingRule === candidate.id ? '启用中…' : '确认启用规则'}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
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
            <span>
              状态：{skill.state === 'review' ? '需复审' : skill.state === 'cold' ? '冷存' : '正常'}
              {' · '}累计 👎 {skill.thumbsDownCount} · 连续 👎 {skill.consecutiveDown}
            </span>
            {skill.state === 'review' && (
              <button
                className="skill-review-restore"
                disabled={restoring === skill.name}
                onClick={() => void restoreReview(skill.name)}
                type="button"
              >
                {restoring === skill.name ? '恢复中…' : '恢复使用'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function MemorySettings({ mode }: { mode: UiMode }) {
  const [items, setItems] = useState<
    Array<{
      id: string;
      type: 'fact' | 'session' | 'experience';
      layer: 'L1' | 'L2';
      content: string;
      createdAt: number;
      lastAccessedAt: number;
      meta: string;
      stale?: boolean;
      expiresAt?: number | null;
    }>
  >([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = () => {
    fetch(`${GATEWAY_URL}/api/memory?mode=${encodeURIComponent(mode)}`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: { items?: typeof items } | null) => setItems(data?.items ?? []))
      .catch(() => setItems([]));
  };

  useEffect(load, [mode]);

  const forget = async (id: string, type: string) => {
    await fetch(`${GATEWAY_URL}/api/memory/forget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type, mode }),
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

  const equippedAssets: Record<UiMode, string> = {
    engineering: 'Skill / Wiki / CodeGraph',
    knowledge: 'Chat Memory / Skill / Wiki',
    life: 'Chat Memory',
  };

  return (
    <div className="settings-form">
      <p className="settings-note">当前栏位已装备：{equippedAssets[mode]}</p>
      <div className="memory-filter">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部</button>
        <button className={filter === 'L1' ? 'active' : ''} onClick={() => setFilter('L1')}>L1 事实/情景</button>
        <button className={filter === 'L2' ? 'active' : ''} onClick={() => setFilter('L2')}>L2 场景知识</button>
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
            <span>
              {labelOf(item)}
              {item.stale ? ' · 可能已过时，请重新确认' : ''}
              {' · '}{new Date(item.lastAccessedAt).toLocaleString()}
            </span>
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

// E323：右栏「裁决」页——pending 待裁决队列 + 批准/否决回填（GET/POST /api/decisions）
// E324 第二刀：批准带 resume 的挂起写动作 → gateway 自动恢复执行，面板回执 + 续到本会话聊天
function DecisionPanel({
  mode,
  onExecuted,
}: {
  mode: UiMode;
  onExecuted?: (entry: DecisionPanelEntry, executed: ExecutedReceipt) => void;
}) {
  const [decisions, setDecisions] = useState<DecisionPanelEntry[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [hint, setHint] = useState('');
  const [receipts, setReceipts] = useState<DecisionReceipt[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    fetch(`${GATEWAY_URL}/api/decisions`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then(
        (data: { open?: DecisionPanelEntry[] } | null) => {
          setDecisions(data?.open ?? []);
          setHint('');
        },
        () => setHint('无法连接 gateway，裁决队列暂不可用'),
      );
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brief = (text?: string, max = 90): string => {
    const trimmed = (text ?? '').trim();
    return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
  };

  const pushReceipt = (text: string, tone: DecisionReceipt['tone']) => {
    setReceipts((prev) => [{ id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, tone }, ...prev].slice(0, 6));
  };

  const adjudicate = async (
    entry: DecisionPanelEntry,
    input: { decision?: 'approve' | 'reject'; choice?: string },
  ) => {
    const id = entry.id;
    setBusyId(id);
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/decisions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, note: (notes[id] ?? '').trim(), mode }),
      });
      const data = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        executed?: ExecutedReceipt;
        projectTransaction?: {
          ok?: boolean;
          status?: string;
          error?: string;
          conflictDecisionId?: string;
          commit?: { committedPaths?: string[] };
        };
      } | null;
      if (!resp.ok || !data?.ok) {
        setHint(data?.error ?? '裁决提交失败，请重试');
        return;
      }
      setNotes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      const target = brief(entry.resume?.query || entry.question || '该操作');
      if (data.projectTransaction) {
        const transaction = data.projectTransaction;
        if (transaction.status === 'completed') {
          pushReceipt(
            `✅ 多文件事务已提交，共写入 ${transaction.commit?.committedPaths?.length ?? 0} 个文件。`,
            'ok',
          );
        } else if (transaction.status === 'cancelled') {
          pushReceipt('❌ 已取消整批变更并清理未执行快照，目标文件未写入。', 'reject');
        } else if (transaction.status === 'conflict_pending') {
          pushReceipt('⚠️ 提交前发现文件变化，目标零写入；已生成新的冲突裁决。', 'error');
        } else {
          pushReceipt(`⚠️ 多文件事务未执行：${transaction.error ?? transaction.status ?? '未知状态'}`, 'error');
        }
      } else if (input.choice) {
        const selected = entry.choices?.find((choice) => choice.id === input.choice);
        pushReceipt(
          `${selected?.outcome === 'reject' ? '❌' : '✅'} 已记录「${selected?.label ?? input.choice}」，本轮未执行文件写入。`,
          selected?.outcome === 'reject' ? 'reject' : 'ok',
        );
      } else if (input.decision === 'reject') {
        pushReceipt(`❌ 已否决「${target}」，未执行。`, 'reject');
      } else if (data.executed?.error) {
        pushReceipt(`⚠️ 已批准「${target}」并记录，但自动恢复执行失败：${data.executed.error}`, 'error');
      } else if (data.executed?.answer) {
        onExecuted?.(entry, data.executed);
        pushReceipt(`✅ 已批准「${target}」并恢复执行。结果：${brief(data.executed.answer, 180)}`, 'ok');
      } else {
        pushReceipt(`✅ 已批准「${target}」并记录。`, 'ok');
      }
      load();
    } catch {
      setHint('无法连接 gateway，提交失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="file-list">
      <div className="notify-toolbar">
        <span className="settings-note">待裁决 {decisions.length} 条 · 30s 自动刷新</span>
        <button onClick={load}>刷新</button>
      </div>
      {receipts.length > 0 && (
        <div className="decision-receipts">
          {receipts.map((receipt) => (
            <p className={`decision-receipt ${receipt.tone}`} key={receipt.id}>
              {receipt.text}
            </p>
          ))}
        </div>
      )}
      {hint && <p className="settings-note">{hint}</p>}
      {decisions.length === 0 && !hint && (
        <p className="settings-note">暂无待裁决（澄清 / 风险裁决会自动出现于此）</p>
      )}
      {decisions.map((entry) => (
        <div className="decision-card" key={entry.id}>
          <div className="decision-head">
            <strong>{entry.question || '(无问题描述)'}</strong>
            <span className="notify-time">{fmtNotifyTime(entry.createdAt)}</span>
          </div>
          {entry.options && entry.options.length > 0 && (
            <ul className="decision-options">
              {entry.options.map((opt, idx) => (
                <li key={`${idx}-${opt}`}>{opt}</li>
              ))}
            </ul>
          )}
          <p className="decision-meta">
            {DECISION_TRIGGER_LABELS[entry.trigger] ?? entry.trigger}
            {entry.conversationId ? ` · 会话 ${entry.conversationId}` : ''}
            {typeof entry.confidence === 'number' ? ` · 置信 ${entry.confidence.toFixed(2)}` : ''}
            {entry.resume ? ' · ⏸ 批准后自动执行' : ''}
          </p>
          <div className="decision-bar">
            <input
              className="decision-note"
              value={notes[entry.id] ?? ''}
              onChange={(event) =>
                setNotes((prev) => ({ ...prev, [entry.id]: event.target.value }))
              }
              placeholder="备注（可选）"
              disabled={busyId === entry.id}
            />
            {entry.choices?.length ? (
              entry.choices.map((choice) => (
                <button
                  className={`decision-btn ${choice.outcome === 'reject' ? 'reject' : 'approve'}`}
                  key={choice.id}
                  onClick={() => adjudicate(entry, { choice: choice.id })}
                  disabled={busyId === entry.id}
                  title={choice.description}
                >
                  {busyId === entry.id
                    ? '记录中…'
                    : `${choice.label}${entry.defaultChoice === choice.id ? '（默认）' : ''}`}
                </button>
              ))
            ) : (
              <>
                <button
                  className="decision-btn approve"
                  onClick={() => adjudicate(entry, { decision: 'approve' })}
                  disabled={busyId === entry.id}
                >
                  {busyId === entry.id ? '执行中…' : '批准'}
                </button>
                <button
                  className="decision-btn reject"
                  onClick={() => adjudicate(entry, { decision: 'reject' })}
                  disabled={busyId === entry.id}
                >
                  否决
                </button>
              </>
            )}
          </div>
        </div>
      ))}
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
