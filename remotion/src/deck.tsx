import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {FxText, useClipFx} from './motionFx';

type Series = {label?: string; values?: number[]; labels?: string[]};
type EventItem = {label?: string; at?: number; y?: number | null};

type DeckTheme = {
  accent: string;
  text: string;
  ctaText: string;
  captionBg: string;
  line?: string;
  captionStyle?: 'card' | 'bar' | 'chalk';
};

const FONT_STACKS: Record<string, string> = {
  sans: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif',
  serif: 'SimSun, "Songti SC", "Noto Serif SC", serif',
  xiaowei: 'FangSong, "STFangsong", "ZCOOL XiaoWei", serif',
  huangyou: 'YouYuan, "STYuanti", "ZCOOL QingKe HuangYou", sans-serif',
  kuaile: 'YouYuan, "Comic Sans MS", "ZCOOL KuaiLe", sans-serif',
  mashan: 'KaiTi, "STKaiti", "Ma Shan Zheng", serif',
};

function tickNumber(item: string, progress: number) {
  const match = item.match(/^([^\d-]*)(-?\d+(?:\.\d+)?)(.*)$/);
  if (!match) return item;
  const value = Number(match[2]);
  if (!Number.isFinite(value)) return item;
  const shown = value % 1 === 0 ? Math.round(value * progress) : Math.round(value * progress * 10) / 10;
  return `${match[1]}${shown}${match[3]}`;
}

function num(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = '') {
  return typeof value === 'string' && value ? value : fallback;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function sizeScale(id?: string) {
  if (id === 'sm') return 0.78;
  if (id === 'lg') return 1.38;
  return 1;
}

function bodyScale(id?: string) {
  return sizeScale(id) * 0.78;
}

function lumaOf(value: string) {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(value);
  if (hex) {
    const n = hex[1];
    const r = parseInt(n.slice(0, 2), 16);
    const g = parseInt(n.slice(2, 4), 16);
    const b = parseInt(n.slice(4, 6), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  const rgb = /^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (rgb) {
    return (0.2126 * Number(rgb[1]) + 0.7152 * Number(rgb[2]) + 0.0722 * Number(rgb[3])) / 255;
  }
  return 1;
}

function isLightFill(value: string) {
  return lumaOf(value) > 0.55;
}

function resolveBox(box: string, theme: DeckTheme) {
  if (box === 'card' || box === 'bar' || box === 'chalk' || box === 'outline' || box === 'plain') return box;
  return theme.captionStyle || 'card';
}

function captionFill(box: string, theme: DeckTheme) {
  if (box === 'chalk' || box === 'outline' || box === 'plain') return 'transparent';
  const bg = theme.captionBg;
  if (!bg || bg === 'transparent') {
    return box === 'bar' ? 'rgba(17,17,17,0.82)' : 'rgba(0,0,0,0.72)';
  }
  return bg;
}

function captionInk(box: string, theme: DeckTheme) {
  if (box !== 'bar' && box !== 'card') return theme.text;
  const fill = captionFill(box, theme);
  if (isLightFill(fill)) return lumaOf(theme.text) < 0.55 ? theme.text : '#14110a';
  return lumaOf(theme.text) > 0.55 ? theme.text : '#fff7f2';
}

function boxLook(boxRaw: string, theme: DeckTheme): React.CSSProperties {
  const box = resolveBox(boxRaw, theme);
  const ink = captionInk(box, theme);
  if (box === 'plain') {
    return {background: 'transparent', border: 'none', color: ink, textShadow: '0 3px 10px rgba(0,0,0,0.75)'};
  }
  if (box === 'outline') {
    return {
      background: 'transparent',
      border: 'none',
      color: ink,
      textShadow: '-1px 0 #000, 1px 0 #000, 0 -1px #000, 0 1px #000, 0 3px 8px rgba(0,0,0,0.55)',
    };
  }
  if (box === 'chalk') {
    return {background: 'transparent', border: `2px dashed ${theme.accent}`, color: ink};
  }
  if (box === 'bar') {
    return {
      background: captionFill(box, theme),
      border: 'none',
      borderLeft: `7px solid ${theme.accent}`,
      color: ink,
    };
  }
  return {
    background: captionFill(box, theme),
    border: `2px solid ${theme.line || theme.accent}`,
    color: ink,
  };
}

export const DeckClip: React.FC<{
  clip: {
    type: string;
    content?: string;
    params?: Record<string, unknown>;
  };
  theme: DeckTheme;
  talking?: boolean;
}> = ({clip, theme, talking}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const params = clip.params || {};
  const enter = str(params.enter, 'slide_up');
  const exit = str(params.exit, 'fade_out');
  const reveal = str(params.reveal, clip.type === 'deck_line' || clip.type === 'deck_timeline' ? 'draw' : 'stagger');
  const fx = useClipFx(enter, exit, str(params.title, clip.content || ''));
  const title = str(params.title, clip.content || '要点');
  const points = list(params.points);
  const stats = list(params.stats);
  const left = str(params.left);
  const right = str(params.right);
  const beatKind = str(params.kind, 'points');
  const scale = sizeScale(str(params.size, 'md'));
  const nested = bodyScale(str(params.size, 'md'));
  const face = FONT_STACKS[str(params.font, 'sans')] || FONT_STACKS.sans;
  const look = boxLook(str(params.box, 'card'), theme);
  const portrait = height > width;
  const u = Math.min(width, height) / 1080;
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {extrapolateRight: 'clamp'});
  const draw = reveal === 'draw' ? interpolate(frame, [0, Math.max(8, fps * 0.7)], [0, 1], {extrapolateRight: 'clamp'}) : 1;
  const cardX = num(params.cardX, 50);
  const cardY = num(params.cardY, 72);
  const side = portrait ? 72 * u : 64 * u;
  const ink = look.color || theme.text;
  const card: React.CSSProperties = {
    opacity: fx.opacity,
    transform: `translate(-50%, -50%) ${fx.transform}`,
    position: 'absolute',
    left: (width * cardX) / 100,
    top: (height * cardY) / 100,
    width: width - side * 2,
    maxHeight: talking ? height * 0.42 : height * 0.48,
    background: look.background,
    color: ink,
    border: look.border,
    borderLeft: look.borderLeft,
    textShadow: look.textShadow as string | undefined,
    borderRadius: 22 * u,
    padding: `${28 * u}px ${32 * u}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: 14 * u,
    fontFamily: face,
  };
  const shown = reveal === 'stagger' ? Math.max(1, Math.ceil(progress * Math.max(points.length, 1))) : points.length;
  const titleSize = Math.round((clip.type === 'deck_quote' ? 48 : 40) * u * scale);
  const itemSize = Math.round((clip.type === 'deck_quote' ? 48 : 40) * u * nested);
  const statItems = stats.length ? stats : points;
  const shownStats = reveal === 'stagger' ? Math.max(1, Math.ceil(progress * Math.max(statItems.length, 1))) : statItems.length;

  return (
    <div style={card}>
      {clip.type === 'deck_quote' ? (
        <FxText enter={enter} exit={exit} text={`「${title}」`} color={ink} accent={theme.accent} fontSize={titleSize} fontWeight={800} />
      ) : (
        <FxText enter={enter} exit={exit} text={title} color={ink} accent={theme.accent} fontSize={titleSize} fontWeight={800} />
      )}
      {clip.type === 'deck_ppt' ? (
        <ol style={{margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 * u}}>
          {points.slice(0, shown).map((item, index) => (
            <li key={`${item}-${index}`} style={{fontSize: itemSize, fontWeight: 700, lineHeight: 1.35}}>
              <em style={{color: theme.accent, fontStyle: 'normal', marginRight: 10}}>
                {beatKind === 'steps' ? String(index + 1).padStart(2, '0') : '•'}
              </em>
              {item}
            </li>
          ))}
        </ol>
      ) : null}
      {clip.type === 'deck_stats' ? (
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 12 * u}}>
          {statItems.slice(0, shownStats).map((item) => (
            <span
              key={item}
              style={{
                fontSize: Math.round(40 * u * nested),
                fontWeight: 800,
                color: theme.ctaText,
                background: theme.accent,
                padding: `${10 * u}px ${16 * u}px`,
                borderRadius: 12 * u,
              }}
            >
              {reveal === 'count' ? tickNumber(item, progress) : item}
            </span>
          ))}
        </div>
      ) : null}
      {clip.type === 'deck_compare' ? (
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 * u, flex: 1}}>
          <div style={{borderRight: `2px solid ${theme.accent}`, paddingRight: 12 * u}}>
            <div style={{fontSize: itemSize, fontWeight: 800, lineHeight: 1.4}}>{left || points[0] || ''}</div>
          </div>
          <div>
            <div style={{fontSize: itemSize, fontWeight: 800, lineHeight: 1.4}}>{right || points[1] || ''}</div>
          </div>
        </div>
      ) : null}
      {clip.type === 'deck_line' ? <LineChart theme={theme} ink={ink} series={(params.series as Series[]) || []} progress={draw} unit={u} /> : null}
      {clip.type === 'deck_timeline' ? <TimeChart theme={theme} ink={ink} events={(params.events as EventItem[]) || []} progress={draw} unit={u} /> : null}
    </div>
  );
};

function LineChart({theme, ink, series, progress, unit}: {theme: DeckTheme; ink: string; series: Series[]; progress: number; unit: number}) {
  const first = series[0] || {values: [], labels: []};
  const values = (first.values || []).map((item) => Number(item)).filter((item) => Number.isFinite(item));
  if (values.length < 2) return null;
  const labels = first.labels || values.map((_, index) => String(index + 1));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 640;
  const h = 280;
  const pad = 28;
  const visible = Math.max(2, Math.ceil(1 + (values.length - 1) * progress));
  const pts = values.slice(0, visible).map((value, index) => {
    const x = pad + (index / Math.max(values.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - ((value - min) / span) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={Math.round(220 * unit)} style={{overflow: 'visible'}}>
      <polyline fill="none" stroke={theme.accent} strokeWidth="6" points={pts.join(' ')} />
      {values.slice(0, visible).map((value, index) => {
        const x = pad + (index / Math.max(values.length - 1, 1)) * (w - pad * 2);
        const y = h - pad - ((value - min) / span) * (h - pad * 2);
        return <circle key={index} cx={x} cy={y} r="8" fill={theme.accent} />;
      })}
      {labels.slice(0, visible).map((label, index) => {
        const x = pad + (index / Math.max(values.length - 1, 1)) * (w - pad * 2);
        return (
          <text key={`l-${index}`} x={x} y={h - 4} textAnchor="middle" fill={ink} fontSize="18" fontWeight="700">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function TimeChart({theme, ink, events, progress, unit}: {theme: DeckTheme; ink: string; events: EventItem[]; progress: number; unit: number}) {
  const items = events
    .map((item) => ({label: str(item.label, ''), at: num(item.at, 0)}))
    .filter((item) => item.label)
    .sort((a, b) => a.at - b.at);
  if (!items.length) return null;
  const w = 640;
  const h = 180;
  const shown = items.filter((item) => item.at <= progress + 0.02);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={Math.round(160 * unit)}>
      <line x1="40" y1="90" x2="600" y2="90" stroke={theme.accent} strokeWidth="5" />
      {shown.map((item) => {
        const x = 40 + item.at * 560;
        return (
          <g key={`${item.label}-${item.at}`}>
            <circle cx={x} cy="90" r="10" fill={theme.accent} />
            <text x={x} y="48" textAnchor="middle" fill={ink} fontSize="18" fontWeight="800">
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
