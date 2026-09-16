import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Loop,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {Slide, TalkingVideoProps, ThemeId} from './types';
import {ClipTrack} from './clips';
import {resolveThemeMotion, ThemeMotionLayer, useTextMotion} from './effects';

const FONT_STACKS: Record<string, string> = {
  sans: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif',
  serif: 'SimSun, "Songti SC", "Noto Serif SC", serif',
  xiaowei: 'FangSong, "STFangsong", "ZCOOL XiaoWei", serif',
  huangyou: 'YouYuan, "STYuanti", "ZCOOL QingKe HuangYou", sans-serif',
  kuaile: 'YouYuan, "Comic Sans MS", "ZCOOL KuaiLe", sans-serif',
  mashan: 'KaiTi, "STKaiti", "Ma Shan Zheng", serif',
};

const fontFamily = FONT_STACKS.sans;

type CaptionStyle = 'card' | 'bar' | 'chalk';
type CaptionBox = 'card' | 'bar' | 'chalk' | 'outline' | 'plain';

function captionFontFamily(id?: string) {
  return FONT_STACKS[id || ''] || FONT_STACKS.sans;
}

function captionScale(id?: string) {
  if (id === 'sm') return 0.78;
  if (id === 'lg') return 1.38;
  return 1;
}

function resolveCaptionBox(box: string | undefined, themeBox: CaptionStyle): CaptionBox {
  if (box === 'card' || box === 'bar' || box === 'chalk' || box === 'outline' || box === 'plain') {
    return box;
  }
  return themeBox;
}

type Theme = {
  bg: string;
  text: string;
  accent: string;
  ctaText: string;
  glow: string;
  captionBg: string;
  muted: string;
  line: string;
  captionStyle: CaptionStyle;
  markBg: string;
  markText: string;
};

const THEMES: Record<ThemeId, Theme> = {
  slate: {
    bg: '#0a0a0a',
    text: '#fff7d6',
    accent: '#ffcc33',
    ctaText: '#14110a',
    glow: 'radial-gradient(120% 85% at 50% 12%, rgba(255,204,51,0.28), transparent 58%)',
    captionBg: 'rgba(12,12,12,0.82)',
    muted: 'rgba(255,247,214,0.62)',
    line: 'rgba(255,204,51,0.28)',
    captionStyle: 'card',
    markBg: 'rgba(255,204,51,0.16)',
    markText: '#ffcc33',
  },
  education: {
    bg: '#163526',
    text: '#f6efd8',
    accent: '#f0c75e',
    ctaText: '#1a2a1c',
    glow: 'radial-gradient(107% 73% at 50% 0%, rgba(240,199,94,0.2), transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)',
    captionBg: 'transparent',
    muted: 'rgba(246,239,216,0.7)',
    line: 'rgba(240,199,94,0.45)',
    captionStyle: 'chalk',
    markBg: 'rgba(240,199,94,0.16)',
    markText: '#f0c75e',
  },
  tech: {
    bg: '#050814',
    text: '#e7fbff',
    accent: '#00e8ff',
    ctaText: '#03141a',
    glow: 'radial-gradient(120% 79% at 18% 8%, rgba(0,232,255,0.22), transparent 50%), radial-gradient(93% 79% at 90% 88%, rgba(88,86,255,0.2), transparent 48%)',
    captionBg: 'rgba(4,16,28,0.84)',
    muted: 'rgba(231,251,255,0.62)',
    line: 'rgba(0,232,255,0.45)',
    captionStyle: 'card',
    markBg: 'rgba(0,232,255,0.14)',
    markText: '#00e8ff',
  },
  life: {
    bg: '#fff4e8',
    text: '#3a241c',
    accent: '#e85d4c',
    ctaText: '#fff7f2',
    glow: 'radial-gradient(120% 76% at 70% 0%, rgba(255,186,120,0.45), transparent 55%)',
    captionBg: 'rgba(255,255,255,0.88)',
    muted: 'rgba(58,36,28,0.55)',
    line: 'rgba(232,93,76,0.28)',
    captionStyle: 'card',
    markBg: 'rgba(232,93,76,0.12)',
    markText: '#e85d4c',
  },
  business: {
    bg: '#0b1628',
    text: '#f6f1e4',
    accent: '#d4a017',
    ctaText: '#16120a',
    glow: 'radial-gradient(115% 73% at 50% 0%, rgba(212,160,23,0.18), transparent 58%)',
    captionBg: 'rgba(8,16,30,0.82)',
    muted: 'rgba(246,241,228,0.62)',
    line: 'rgba(212,160,23,0.4)',
    captionStyle: 'card',
    markBg: 'rgba(212,160,23,0.16)',
    markText: '#d4a017',
  },
  news: {
    bg: '#f3f4f6',
    text: '#111111',
    accent: '#d61f26',
    ctaText: '#ffffff',
    glow: 'linear-gradient(180deg, rgba(214,31,38,0.08), transparent 28%)',
    captionBg: '#111111',
    muted: 'rgba(17,17,17,0.55)',
    line: 'rgba(214,31,38,0.7)',
    captionStyle: 'bar',
    markBg: '#d61f26',
    markText: '#ffffff',
  },
  paper: {
    bg: '#fff4e8',
    text: '#3a241c',
    accent: '#e85d4c',
    ctaText: '#fff7f2',
    glow: 'radial-gradient(120% 76% at 70% 0%, rgba(255,186,120,0.45), transparent 55%)',
    captionBg: 'rgba(255,255,255,0.88)',
    muted: 'rgba(58,36,28,0.55)',
    line: 'rgba(232,93,76,0.28)',
    captionStyle: 'card',
    markBg: 'rgba(232,93,76,0.12)',
    markText: '#e85d4c',
  },
  neon: {
    bg: '#050814',
    text: '#e7fbff',
    accent: '#00e8ff',
    ctaText: '#03141a',
    glow: 'radial-gradient(120% 79% at 18% 8%, rgba(0,232,255,0.22), transparent 50%), radial-gradient(93% 79% at 90% 88%, rgba(88,86,255,0.2), transparent 48%)',
    captionBg: 'rgba(4,16,28,0.84)',
    muted: 'rgba(231,251,255,0.62)',
    line: 'rgba(0,232,255,0.45)',
    captionStyle: 'card',
    markBg: 'rgba(0,232,255,0.14)',
    markText: '#00e8ff',
  },
  ink: {
    bg: '#f3f4f6',
    text: '#111111',
    accent: '#d61f26',
    ctaText: '#ffffff',
    glow: 'linear-gradient(180deg, rgba(214,31,38,0.08), transparent 28%)',
    captionBg: '#111111',
    muted: 'rgba(17,17,17,0.55)',
    line: 'rgba(214,31,38,0.7)',
    captionStyle: 'bar',
    markBg: '#d61f26',
    markText: '#ffffff',
  },
};

function captionFill(box: CaptionBox, theme: Theme) {
  if (box === 'chalk' || box === 'outline' || box === 'plain') {
    return 'transparent';
  }
  const bg = theme.captionBg;
  if (!bg || bg === 'transparent') {
    return box === 'bar' ? 'rgba(17,17,17,0.82)' : 'rgba(0,0,0,0.72)';
  }
  return bg;
}

function captionInk(box: CaptionBox, theme: Theme) {
  if (box !== 'bar' && box !== 'card') return theme.text;
  const fill = captionFill(box, theme);
  const light = isLightFill(fill);
  const textLight = isLightFill(theme.text);
  if (light) return textLight ? '#14110a' : theme.text;
  return textLight ? theme.text : '#fff7f2';
}

function isLightFill(value: string) {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(value);
  if (hex) {
    const n = hex[1];
    const r = parseInt(n.slice(0, 2), 16);
    const g = parseInt(n.slice(2, 4), 16);
    const b = parseInt(n.slice(4, 6), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
  }
  const rgb = /^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!rgb) return false;
  return (0.2126 * Number(rgb[1]) + 0.7152 * Number(rgb[2]) + 0.0722 * Number(rgb[3])) / 255 > 0.55;
}

const msToFrames = (ms: number, fps: number) => Math.round((ms / 1000) * fps);

function loopDuration(durationMs: number | undefined | null, fps: number, compositionFrames: number) {
  if (!durationMs || durationMs <= 0) {
    return Math.max(1, Math.min(compositionFrames, fps));
  }
  return Math.max(1, Math.min(compositionFrames, Math.floor((durationMs / 1000) * fps) - 1));
}

function useLayout() {
  const {width, height} = useVideoConfig();
  const portrait = height > width;
  const u = Math.min(width, height) / 1080;
  return {
    portrait,
    hookTop: portrait ? Math.round(430 * u) : Math.round(height * 0.12),
    hookSize: Math.round(86 * u),
    captionBottom: portrait ? Math.round(430 * u) : Math.round(height * 0.14),
    captionCenter: Math.round(height * 0.44),
    captionSize: Math.round(58 * u),
    watermarkSize: Math.round(34 * u),
    ctaBottom: portrait ? Math.round(220 * u) : Math.round(height * 0.055),
    ctaSize: Math.round(56 * u),
    inset: Math.round((portrait ? 48 : 36) * u),
    side: Math.round((portrait ? 80 : 72) * u),
    indexSize: Math.round(28 * u),
    stepTitle: Math.round(36 * u),
    stepTitleTalk: Math.round(32 * u),
    markTop: portrait ? Math.round(78 * u) : Math.round(height * 0.045),
  };
}

const TitleCard: React.FC<{
  text: string;
  theme: Theme;
  box: CaptionBox;
  fontFamily: string;
  scale: number;
  x?: number;
  y?: number;
}> = ({text, theme, box, fontFamily: titleFace, scale, x = 50, y = 24}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const layout = useLayout();
  const opacity = interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp'});
  const open = box === 'chalk' || box === 'outline' || box === 'plain';
  return (
    <div
      style={{
        opacity,
        position: 'absolute',
        top: (height * y) / 100,
        left: (width * x) / 100,
        width: width - layout.side * 2,
        transform: 'translate(-50%, 0)',
        display: 'flex',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          background: captionFill(box, theme),
          border:
            box === 'chalk'
              ? 'none'
              : box === 'bar'
                ? `0 solid ${theme.accent}`
                : box === 'card'
                  ? `2px solid ${theme.line}`
                  : 'none',
          borderLeft: box === 'bar' ? `10px solid ${theme.accent}` : undefined,
          borderBottom: box === 'chalk' ? `4px solid ${theme.accent}` : undefined,
          color: captionInk(box, theme),
          padding: open ? (layout.portrait ? '18px 16px' : '16px 20px') : layout.portrait ? '28px 40px' : '24px 36px',
          fontFamily: titleFace,
          fontSize: Math.round(layout.hookSize * scale),
          lineHeight: 1.2,
          fontWeight: 800,
          letterSpacing: '-0.04em',
          maxWidth: '100%',
          textShadow:
            box === 'outline'
              ? '-2px 0 #000, 2px 0 #000, 0 -2px #000, 0 2px #000, 0 8px 24px rgba(0,0,0,0.45)'
              : box === 'plain'
                ? '0 8px 28px rgba(0,0,0,0.55)'
                : layout.portrait
                  ? '0 8px 40px rgba(0,0,0,0.45)'
                  : undefined,
        }}
      >
        <div
          style={{
            width: 88,
            height: 8,
            background: theme.accent,
            margin: '0 auto 22px',
          }}
        />
        {text}
      </div>
    </div>
  );
};

function padIndex(value: number) {
  return (value < 10 ? '0' : '') + String(value);
}

const StepCard: React.FC<{
  title: string;
  index: number;
  total: number;
  highlights?: string[];
  theme: Theme;
  box: CaptionBox;
  fontFamily: string;
  scale: number;
  talking: boolean;
  motion?: 'fade' | 'pop' | 'type' | 'slide';
  x?: number;
  y?: number;
}> = ({title, index, total, highlights, theme, box, fontFamily: face, scale, talking, motion, x = 50, y = 72}) => {
  const layout = useLayout();
  const {width, height} = useVideoConfig();
  const animated = useTextMotion(motion, title);
  const open = box === 'chalk' || box === 'outline' || box === 'plain';
  const titleSize = Math.round((talking ? layout.stepTitleTalk : layout.stepTitle) * scale) + 4;
  const chipSize = Math.max(18, titleSize - 8);
  return (
    <>
      {talking ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: layout.portrait ? '38%' : '32%',
            background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.28))',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <div
        style={{
          opacity: animated.opacity,
          position: 'absolute',
          top: layout.markTop,
          left: layout.side,
          fontFamily: face,
          fontSize: layout.indexSize,
          fontWeight: 800,
          letterSpacing: '0.08em',
          color: theme.ctaText || '#101010',
          background: theme.accent,
          padding: layout.portrait ? '8px 16px' : '6px 12px',
          borderRadius: 8,
        }}
      >
        {padIndex(index)} / {padIndex(total)}
      </div>
      <div
        style={{
          opacity: animated.opacity,
          position: 'absolute',
          top: (height * y) / 100,
          left: (width * x) / 100,
          width: width - layout.side * 2,
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            background: talking
              ? box === 'outline' || box === 'plain' || box === 'chalk'
                ? 'rgba(0,0,0,0.55)'
                : captionFill(box, theme)
              : captionFill(box, theme),
            border:
              box === 'chalk'
                ? 'none'
                : box === 'bar'
                  ? `0 solid ${theme.accent}`
                  : box === 'card'
                    ? `2px solid ${theme.line}`
                    : talking
                      ? `1px solid ${theme.line}`
                      : 'none',
            borderLeft: box === 'bar' ? `10px solid ${theme.accent}` : undefined,
            borderBottom: box === 'chalk' ? `4px solid ${theme.accent}` : undefined,
            color: captionInk(box, theme),
            padding: open ? (layout.portrait ? '16px 14px' : '14px 18px') : layout.portrait ? '28px 36px' : '22px 32px',
            fontFamily: face,
            textAlign: 'center',
            maxWidth: talking ? '100%' : layout.portrait ? '100%' : '92%',
            width: '100%',
          }}
        >
          <div style={{fontSize: titleSize, fontWeight: 800, lineHeight: 1.25, transform: animated.transform}}>
            {animated.text}
          </div>
          {highlights && highlights.length ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 10,
                marginTop: layout.portrait ? 18 : 16,
              }}
            >
              {highlights.map((item) => (
                <span
                  key={item}
                  style={{
                    fontSize: chipSize,
                    fontWeight: 800,
                    color: theme.ctaText || '#101010',
                    background: theme.accent,
                    borderRadius: 8,
                    padding: layout.portrait ? '8px 16px' : '7px 14px',
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
};

const CtaCard: React.FC<{text: string; theme: Theme}> = ({text, theme}) => {
  const frame = useCurrentFrame();
  const layout = useLayout();
  const y = interpolate(frame, [0, 10], [40, 0], {extrapolateRight: 'clamp'});
  const opacity = interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        position: 'absolute',
        left: layout.side,
        right: layout.side,
        bottom: layout.ctaBottom,
        background: theme.accent,
        color: theme.ctaText,
        padding: layout.portrait ? '42px 48px' : '32px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* <div style={{fontSize: layout.portrait ? 28 : 20, fontWeight: 700, letterSpacing: '0.28em'}}>
        行动号召
      </div> */}
      <div style={{fontSize: layout.ctaSize, fontWeight: 800, lineHeight: 1.25}}>{text}</div>
    </div>
  );
};

const TopicChip: React.FC<{text: string; theme: Theme}> = ({text, theme}) => {
  const layout = useLayout();
  return (
    <div
      style={{
        position: 'absolute',
        top: layout.portrait ? 86 : 36,
        left: layout.side,
        fontSize: layout.portrait ? 28 : 22,
        letterSpacing: '0.12em',
        color: theme.muted,
        border: `1px solid ${theme.accent}`,
        padding: '10px 22px',
      }}
    >
      {text}
    </div>
  );
};

function scaleGlow(glow: string) {
  return glow
    .replace(/radial-gradient\(\s*([\d.]+)px\s+([\d.]+)px/gi, (_all, w, h) => {
      const wp = Math.max(70, Math.min(160, Math.round(Number(w) / 7.5)));
      const hp = Math.max(70, Math.min(140, Math.round(Number(h) / 6.6)));
      return `radial-gradient(${wp}% ${hp}%`;
    })
    .replace(/radial-gradient\(\s*([\d.]+)px\s+at/gi, (_all, size) => {
      const p = Math.max(70, Math.min(160, Math.round(Number(size) / 7.5)));
      return `radial-gradient(${p}% ${p}% at`;
    });
}

function mergeTheme(base: Theme, tokens?: Record<string, string> | null): Theme {
  if (!tokens) return {...base, glow: scaleGlow(base.glow)};
  return {
    ...base,
    bg: tokens.bg || base.bg,
    text: tokens.text || base.text,
    accent: tokens.accent || base.accent,
    ctaText: tokens.ctaText || base.ctaText,
    captionBg: tokens.captionBg || base.captionBg,
    line: tokens.line || base.line,
    glow: scaleGlow(tokens.glow || base.glow),
    markBg: tokens.markBg || base.markBg,
    markText: tokens.markText || base.markText,
    muted: tokens.muted || base.muted,
  };
}

export const TalkingVideo: React.FC<TalkingVideoProps> = ({audioFile, timeline, jobId}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const theme = mergeTheme(THEMES[timeline.theme ?? 'slate'] ?? THEMES.slate, timeline.theme_tokens);
  const titleEnd = Math.max(0, msToFrames(timeline.title_end_ms || 0, fps));
  const showTitle = Boolean((timeline.topic || '').trim()) && frame < titleEnd;
  const ctaStart = Math.max(0, durationInFrames - msToFrames(3200, fps));
  const showCta = frame >= ctaStart;
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const layout = useLayout();
  const backgroundName = timeline.background || '';
  const talkingName = timeline.talking_head || '';
  const rawMask = timeline.person_mask || 'square';
  const personMask = rawMask === 'off' ? 'square' : rawMask;
  const hideTalking = personMask === 'theme';
  const framed =
    Boolean(talkingName) &&
    !hideTalking &&
    (personMask === 'cutout' || personMask === 'square' || personMask === 'chroma');
  const rectFrame = personMask === 'square' || personMask === 'chroma';
  const backgroundSrc =
    backgroundName && (!talkingName || hideTalking || framed)
      ? staticFile(`jobs/${jobId}/${backgroundName}`)
      : '';
  const talkingSrc = talkingName && !hideTalking ? staticFile(`jobs/${jobId}/${talkingName}`) : '';
  const musicSrc = timeline.music ? staticFile(`jobs/${jobId}/${timeline.music}`) : '';
  const backgroundIsVideo =
    timeline.background_kind === 'video' || /\.(mp4|webm|mov)$/i.test(backgroundName);
  const themeMotion = resolveThemeMotion(timeline.theme, timeline.theme_motion);
  const maskW = Math.min(1, Math.max(0.12, timeline.mask_w ?? 0.64));
  const maskH = Math.min(1, Math.max(0.12, timeline.mask_h ?? 0.72));
  const maskX = Math.min(1 - maskW / 2, Math.max(maskW / 2, timeline.mask_x ?? 0.5));
  const maskY = Math.min(1 - maskH / 2, Math.max(maskH / 2, timeline.mask_y ?? 0.47));
  const maskZoom = Math.min(3, Math.max(0.4, timeline.mask_zoom ?? 1));
  const talkingStyle: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover'};
  const clips = timeline.clips || [];
  const useClips = clips.length > 0;

  return (
    <AbsoluteFill style={{background: `${theme.glow}, ${theme.bg}`, fontFamily, color: theme.text}}>
      {backgroundSrc && backgroundIsVideo ? (
        <AbsoluteFill>
          <Loop durationInFrames={loopDuration(timeline.background_duration_ms, fps, durationInFrames)} layout="none">
            <OffthreadVideo
              src={backgroundSrc}
              muted
              volume={0}
              style={{width: '100%', height: '100%', objectFit: 'cover'}}
            />
          </Loop>
        </AbsoluteFill>
      ) : null}
      {backgroundSrc && !backgroundIsVideo ? (
        <AbsoluteFill>
          <Img src={backgroundSrc} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </AbsoluteFill>
      ) : null}
      {backgroundSrc ? <AbsoluteFill style={{background: 'rgba(0,0,0,0.16)'}} /> : null}
      {(!talkingSrc || framed)
        ? clips.map((clip, index) => {
            const file = typeof clip.params?.pageBg === 'string' ? clip.params.pageBg : '';
            if (!file) return null;
            const from = Math.max(0, Math.round((clip.start || 0) * fps));
            const duration = Math.max(1, Math.round((clip.duration || 0.8) * fps));
            if (from >= durationInFrames) return null;
            const src = file === '__theme__' ? '' : staticFile(`jobs/${jobId}/${file}`);
            const isVideo =
              clip.params?.pageBgKind === 'video' || /\.(mp4|webm|mov)$/i.test(file);
            return (
              <Sequence
                key={`pagebg-${clip.id}-${index}`}
                from={from}
                durationInFrames={Math.min(duration, durationInFrames - from)}
              >
                {file === '__theme__' ? (
                  <AbsoluteFill style={{background: `${theme.glow}, ${theme.bg}`}} />
                ) : isVideo ? (
                  <AbsoluteFill>
                    <Loop
                      durationInFrames={loopDuration(Number(clip.params?.pageBgDurationMs) || undefined, fps, durationInFrames)}
                      layout="none"
                    >
                      <OffthreadVideo
                        src={src}
                        muted
                        volume={0}
                        style={{width: '100%', height: '100%', objectFit: 'cover'}}
                      />
                    </Loop>
                  </AbsoluteFill>
                ) : (
                  <AbsoluteFill>
                    <Img src={src} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                  </AbsoluteFill>
                )}
                {file !== '__theme__' ? <AbsoluteFill style={{background: 'rgba(0,0,0,0.16)'}} /> : null}
              </Sequence>
            );
          })
        : null}
      {useClips ? null : <ThemeMotionLayer kind={themeMotion} accent={theme.accent} glow={theme.glow} />}
      {talkingSrc && framed ? (
        <div
          style={{
            position: 'absolute',
            left: `${(maskX - maskW / 2) * 100}%`,
            top: `${(maskY - maskH / 2) * 100}%`,
            width: `${maskW * 100}%`,
            height: `${maskH * 100}%`,
            borderRadius: rectFrame ? 0 : '50%',
            overflow: 'hidden',
            background: personMask === 'chroma' ? 'transparent' : '#111',
          }}
        >
          <OffthreadVideo
            src={talkingSrc}
            muted
            volume={0}
            transparent={personMask === 'chroma'}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              transform: `scale(${maskZoom})`,
            }}
          />
        </div>
      ) : talkingSrc ? (
        <AbsoluteFill>
          <OffthreadVideo src={talkingSrc} muted volume={0} style={talkingStyle} />
        </AbsoluteFill>
      ) : null}
      {talkingSrc && !framed ? <AbsoluteFill style={{background: 'rgba(0,0,0,0.18)'}} /> : null}
      <div
        style={{
          position: 'absolute',
          inset: layout.inset,
          border: `1px solid ${theme.line}`,
        }}
      />
      {timeline.show_watermark !== false ? (
        <div
          style={{
            position: 'absolute',
            top: layout.markTop,
            right: layout.side,
            fontSize: layout.watermarkSize,
            letterSpacing: '0.12em',
            color: theme.markText,
            background: theme.markBg,
            border: `1px solid ${theme.accent}`,
            padding: layout.portrait ? '10px 18px' : '8px 14px',
            fontWeight: 700,
          }}
        >
          {timeline.watermark || '口播场记'}
        </div>
      ) : null}
      {useClips ? (
        <ClipTrack clips={clips} theme={theme} talking={Boolean(talkingSrc)} />
      ) : (
        <>
      {showTitle ? (
        <TitleCard
          text={timeline.topic}
          theme={theme}
          box={resolveCaptionBox(timeline.title_box, theme.captionStyle)}
          fontFamily={captionFontFamily(timeline.title_font)}
          scale={captionScale(timeline.title_size)}
          x={Number(timeline.title_x ?? 50)}
          y={Number(timeline.title_y ?? 24)}
        />
      ) : null}
      {(timeline.slides || []).map((slide: Slide, index: number) => {
        const rawFrom = msToFrames(slide.start_ms, fps);
        const rawEnd = msToFrames(slide.end_ms, fps);
        const from = Math.max(rawFrom, titleEnd);
        const hideAt = timeline.hide_captions_on_cta !== false ? ctaStart : durationInFrames;
        const end = Math.min(rawEnd, hideAt);
        const duration = Math.max(1, end - from);
        if (end <= from) {
          return null;
        }
        return (
          <Sequence key={`slide-${slide.index}-${index}`} from={from} durationInFrames={duration}>
            <StepCard
              title={slide.title}
              index={slide.index}
              total={slide.total}
              highlights={slide.highlights}
              theme={theme}
              box={resolveCaptionBox(timeline.caption_box, theme.captionStyle)}
              fontFamily={captionFontFamily(timeline.caption_font)}
              scale={captionScale(timeline.caption_size)}
              talking={Boolean(talkingSrc)}
              motion={timeline.text_motion}
              x={Number(timeline.card_x ?? 50)}
              y={Number(timeline.card_y ?? 72)}
            />
          </Sequence>
        );
      })}
      {showCta ? (
        <Sequence from={ctaStart} durationInFrames={durationInFrames - ctaStart}>
          <CtaCard text={timeline.cta} theme={theme} />
        </Sequence>
      ) : null}
      {timeline.show_subtitles
        ? (timeline.subtitles || []).map((cue, index) => {
            const from = msToFrames(cue.start_ms, fps);
            const end = msToFrames(cue.end_ms, fps);
            const duration = Math.max(1, end - from);
            if (end <= from) return null;
            return (
              <Sequence key={`sub-${index}-${cue.start_ms}`} from={from} durationInFrames={duration}>
                <div
                  style={{
                    position: 'absolute',
                    left: layout.side,
                    right: layout.side,
                    bottom: talkingSrc ? Math.round(layout.captionBottom * 0.42) : Math.round(layout.ctaBottom * 0.55),
                    textAlign: 'center',
                    fontSize: Math.round(layout.stepTitle * 0.92),
                    fontWeight: 700,
                    lineHeight: 1.35,
                    color: '#fff',
                    textShadow: '0 2px 8px rgba(0,0,0,0.8), -1px 0 #000, 1px 0 #000',
                    pointerEvents: 'none',
                  }}
                >
                  {cue.text}
                </div>
              </Sequence>
            );
          })
        : null}
        </>
      )}
      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}
      {musicSrc ? <Audio src={musicSrc} volume={timeline.music_volume ?? 0.16} loop /> : null}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 10,
          background: theme.line,
        }}
      >
        <div style={{width: `${progress * 100}%`, height: '100%', background: theme.accent}} />
      </div>
    </AbsoluteFill>
  );
};
