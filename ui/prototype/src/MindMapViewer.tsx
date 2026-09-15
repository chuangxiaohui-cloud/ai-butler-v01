/**
 * E349：可交互思维导图查看器（聊天回复 / 右栏预览共用）。
 * 能力：上下左右滚动、−/+ / 100% / 适应缩放（Ctrl/⌘+滚轮缩放）、原生全屏。
 * 布局复用 mindMapLayout.ts；零新增依赖，纯 React + SVG。
 */
import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';

import {
  MAX_MAP_NODES,
  NODE_H,
  countNodes,
  layoutTree,
  type MindTreeNode,
} from './mindMapLayout';

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 5;

function clampZoom(v: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(v * 100) / 100));
}

interface MindMapViewerProps {
  tree: MindTreeNode;
  outline: string;
}

export default function MindMapViewer({ tree, outline }: MindMapViewerProps) {
  const [view, setView] = useState<'map' | 'outline'>('map');
  // null = 适应窗口（随容器尺寸自动算）
  const [zoom, setZoom] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const total = useMemo(() => countNodes(tree), [tree]);
  const layout = useMemo(() => layoutTree(tree), [tree]);
  const tooLarge = total > MAX_MAP_NODES;
  const showMap = view === 'map' && !tooLarge;

  // 量取滚动视口尺寸（固定 320px 高，避免自适应回环）
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitZoom =
    box.w > 0 && box.h > 0 && layout.width > 0 && layout.height > 0
      ? clampZoom(Math.min((box.w - 12) / layout.width, (box.h - 12) / layout.height))
      : 1;
  const effectiveZoom = zoom ?? Math.min(fitZoom, 1);
  const viewW = Math.max(1, Math.round(layout.width * effectiveZoom));
  const viewH = Math.max(1, Math.round(layout.height * effectiveZoom));

  // 原生全屏：进入/退出都跟随
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!rootRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      const p = rootRef.current.requestFullscreen();
      if (p) void p.catch(() => undefined);
    }
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    // Ctrl/⌘+滚轮缩放；普通滚轮保持滚动浏览
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    setZoom(clampZoom((zoom ?? Math.min(fitZoom, 1)) * factor));
  };

  return (
    <div className="mmv-root" ref={rootRef}>
      <div className="mmv-toolbar">
        <button
          className={view === 'map' ? 'active' : ''}
          onClick={() => setView('map')}
          type="button"
        >
          导图
        </button>
        <button
          className={view === 'outline' ? 'active' : ''}
          onClick={() => setView('outline')}
          type="button"
        >
          大纲
        </button>
        {showMap && (
          <span className="mmv-zoom-label">{Math.round(effectiveZoom * 100)}%</span>
        )}
        {showMap && (
          <>
            <button type="button" onClick={() => setZoom(null)} title="整图适应窗口">
              适应
            </button>
            <button type="button" onClick={() => setZoom(1)} title="100%">
              100%
            </button>
            <button
              type="button"
              onClick={() => setZoom(clampZoom(effectiveZoom / 1.25))}
              title="缩小"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoom(clampZoom(effectiveZoom * 1.25))}
              title="放大"
            >
              +
            </button>
          </>
        )}
        <span className="mmv-count">
          共 {total} 个节点{tooLarge ? ' · 节点过多，暂以大纲展示' : ''}
        </span>
        <button className="mmv-fullscreen" type="button" onClick={toggleFullscreen}>
          {isFullscreen ? '退出全屏' : '全屏'}
        </button>
      </div>
      {showMap ? (
        <div className="mmv-viewport" ref={viewportRef} onWheel={onWheel}>
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            width={viewW}
            height={viewH}
            className="mmv-svg"
            role="img"
            aria-label="思维导图（可滚动/缩放/全屏）"
          >
            {layout.edges.map((e, i) => {
              const dx = 28;
              return (
                <path
                  key={`e${i}`}
                  d={`M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2} ${e.y2}`}
                  fill="none"
                  stroke={e.color}
                  strokeWidth={1.4}
                  opacity={0.85}
                />
              );
            })}
            {layout.laid.map((n) => {
              const boxY = n.y - NODE_H / 2;
              const isRoot = n.depth === 0;
              return (
                <g key={n.id}>
                  {n.fullTitle !== n.title && <title>{n.fullTitle}</title>}
                  <rect
                    x={n.x}
                    y={boxY}
                    width={n.w}
                    height={NODE_H}
                    rx={7}
                    fill={isRoot ? '#5b8def' : '#232428'}
                    stroke={n.color ?? 'transparent'}
                    strokeWidth={isRoot ? 0 : 1.3}
                  />
                  <text
                    x={n.x + 9}
                    y={n.y}
                    dominantBaseline="middle"
                    fontSize={12}
                    fill={isRoot ? '#ffffff' : '#e8eaed'}
                  >
                    {n.title}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <pre className="file-preview-body mmv-outline">{outline}</pre>
      )}
    </div>
  );
}
