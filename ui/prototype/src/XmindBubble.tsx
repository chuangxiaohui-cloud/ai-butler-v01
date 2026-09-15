/**
 * E348：聊天消息内嵌 .xmind 卡片——消息文本出现 .xmind 产物路径时，
 * 读回树并直接在 AI 回复里显示可交互思维导图（MindMapViewer）。
 */
import { useEffect, useState } from 'react';

import MindMapViewer from './MindMapViewer';
import type { MindTreeNode } from './mindMapLayout';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://127.0.0.1:8787';

interface XmindBubbleProps {
  path: string;
}

interface PreviewData {
  ok?: boolean;
  error?: string;
  preview?: string;
  tree?: MindTreeNode;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; tree: MindTreeNode; outline: string }
  | { status: 'err'; error: string };

export default function XmindBubble({ path }: XmindBubbleProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    fetch(`${GATEWAY_URL}/api/files/preview?path=${encodeURIComponent(path)}`)
      .then((resp) => resp.json().catch(() => null))
      .then((data: PreviewData | null) => {
        if (!alive) return;
        if (!data?.ok || !data.tree) {
          setState({ status: 'err', error: data?.error ?? '无法读取思维导图' });
          return;
        }
        setState({ status: 'ok', tree: data.tree, outline: data.preview ?? '' });
      })
      .catch(() => {
        if (alive) setState({ status: 'err', error: '无法连接 gateway，读取思维导图失败' });
      });
    return () => {
      alive = false;
    };
  }, [path]);

  return (
    <div className="xmind-bubble">
      <div className="xmind-bubble-head">
        <code title={path}>{path}</code>
      </div>
      {state.status === 'loading' && <p className="xmind-bubble-note">思维导图加载中…</p>}
      {state.status === 'err' && <p className="xmind-bubble-note">⚠️ {state.error}</p>}
      {state.status === 'ok' && <MindMapViewer tree={state.tree} outline={state.outline} />}
    </div>
  );
}
