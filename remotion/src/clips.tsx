import React from 'react';
import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {DeckClip} from './deck';
import {ThemeMotionLayer} from './effects';
import {FxText, useClipFx} from './motionFx';
import type {MotionClip} from './types';

type ClipTheme = {
  accent: string;
  text: string;
  ctaText: string;
  captionBg: string;
  line: string;
  glow: string;
  captionStyle?: 'card' | 'bar' | 'chalk';
};

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

function captionFill(theme: ClipTheme) {
  const bg = theme.captionBg;
  if (!bg || bg === 'transparent') {
    return theme.captionStyle === 'bar' ? 'rgba(17,17,17,0.82)' : 'rgba(0,0,0,0.72)';
  }
  return bg;
}

function captionInk(theme: ClipTheme) {
  const fill = captionFill(theme);
  const light = isLightFill(fill);
  const textLight = isLightFill(theme.text);
  if (light) return textLight ? '#14110a' : theme.text;
  return textLight ? theme.text : '#fff7f2';
}

function useLayout() {
  const {width, height} = useVideoConfig();
  const portrait = height > width;
  const u = Math.min(width, height) / 1080;
  return {
    portrait,
    side: Math.round((portrait ? 80 : 72) * u),
    hookTop: portrait ? Math.round(430 * u) : Math.round(height * 0.12),
    hookSize: Math.round(86 * u),
    captionBottom: portrait ? Math.round(430 * u) : Math.round(height * 0.14),
    ctaBottom: portrait ? Math.round(220 * u) : Math.round(height * 0.055),
    ctaSize: Math.round(56 * u),
    indexSize: Math.round(28 * u),
    stepTitle: Math.round(36 * u),
    markTop: portrait ? Math.round(78 * u) : Math.round(height * 0.045),
  };
}

function num(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback: string) {
  return typeof value === 'string' && value ? value : fallback;
}

const KeywordClip: React.FC<{clip: MotionClip; theme: ClipTheme}> = ({clip, theme}) => {
  const enter = str(clip.params?.enter, clip.type) || 'keyword_pop';
  const fx = useClipFx(enter, str(clip.params?.exit, 'fade_out'), clip.content || '');
  const color = str(clip.params?.color, theme.accent);
  const x = num(clip.params?.x, 42);
  const y = num(clip.params?.y, 36);
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%)`,
        opacity: fx.opacity,
        background: color,
        color: theme.ctaText || '#101010',
        fontWeight: 800,
        fontSize: 42,
        padding: '10px 22px',
        borderRadius: 12,
        boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{display: 'inline-block', transform: fx.transform}}>{fx.text}</span>
    </div>
  );
};

const TitleIn: React.FC<{clip: MotionClip; theme: ClipTheme}> = ({clip, theme}) => {
  const layout = useLayout();
  const params = clip.params || {};
  return (
    <div
      style={{
        position: 'absolute',
        top: layout.hookTop,
        left: layout.side,
        right: layout.side,
        textAlign: 'center',
      }}
    >
      <FxText
        enter={str(params.enter, 'scale_in')}
        exit={str(params.exit, 'fade_out')}
        text={clip.content || ''}
        color={theme.text}
        accent={theme.accent}
        fontSize={layout.hookSize}
        fontWeight={800}
        style={{textShadow: '0 8px 28px rgba(0,0,0,0.45)', lineHeight: 1.2}}
      />
    </div>
  );
};

const StepCardClip: React.FC<{clip: MotionClip; theme: ClipTheme; talking?: boolean}> = ({
  clip,
  theme,
  talking,
}) => {
  const layout = useLayout();
  const params = clip.params || {};
  const enter = str(params.enter || params.motion, 'spring_pop');
  const exit = str(params.exit, 'fade_out');
  const fx = useClipFx(enter, exit, clip.content || '');
  const highlights = Array.isArray(params.highlights) ? params.highlights.map(String) : [];
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
          opacity: fx.opacity,
          position: 'absolute',
          top: layout.markTop,
          left: layout.side,
          fontSize: layout.indexSize,
          fontWeight: 800,
          color: theme.ctaText,
          background: theme.accent,
          padding: '8px 16px',
        }}
      >
        {String(params.index || 1).padStart(2, '0')} / {String(params.total || 1).padStart(2, '0')}
      </div>
      <div
        style={{
          opacity: fx.opacity,
          transform: fx.transform,
          position: 'absolute',
          left: layout.side,
          right: layout.side,
          bottom: layout.captionBottom,
          background: captionFill(theme),
          color: captionInk(theme),
          padding: '28px 36px',
          textAlign: 'center',
        }}
      >
        <FxText
          enter={enter}
          exit={exit}
          text={clip.content || ''}
          color={captionInk(theme)}
          accent={theme.accent}
          fontSize={layout.stepTitle + 4}
          fontWeight={800}
        />
        {highlights.length ? (
          <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 16}}>
            {highlights.map((item) => (
              <span
                key={item}
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: theme.ctaText,
                  background: theme.accent,
                  borderRadius: 8,
                  padding: '7px 14px',
                }}
              >
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
};

const CtaIn: React.FC<{clip: MotionClip; theme: ClipTheme}> = ({clip, theme}) => {
  const layout = useLayout();
  const params = clip.params || {};
  const fx = useClipFx(str(params.enter, 'slide_up'), str(params.exit, 'fade_out'), clip.content || '');
  return (
    <div
      style={{
        opacity: fx.opacity,
        transform: fx.transform,
        position: 'absolute',
        left: layout.side,
        right: layout.side,
        bottom: layout.ctaBottom,
        background: theme.accent,
        color: theme.ctaText,
        padding: layout.portrait ? '42px 48px' : '32px 40px',
        fontSize: layout.ctaSize,
        fontWeight: 800,
        lineHeight: 1.25,
      }}
    >
      {fx.text}
    </div>
  );
};

const SubtitleClip: React.FC<{clip: MotionClip; theme: ClipTheme}> = ({clip, theme}) => {
  const layout = useLayout();
  const params = clip.params || {};
  return (
    <div
      style={{
        position: 'absolute',
        left: layout.side,
        right: layout.side,
        bottom: Math.round(layout.ctaBottom * 0.55),
        textAlign: 'center',
      }}
    >
      <FxText
        enter={str(params.enter, 'fade_in')}
        exit={str(params.exit, 'fade_out')}
        text={clip.content || ''}
        color="#fff"
        accent={theme.accent}
        fontSize={Math.round(layout.stepTitle * 0.92)}
        fontWeight={700}
        style={{textShadow: '0 2px 8px rgba(0,0,0,0.8)'}}
      />
    </div>
  );
};

const OverlayClip: React.FC<{clip: MotionClip; theme: ClipTheme}> = ({clip, theme}) => {
  const fx = useClipFx(str(clip.params?.enter, 'scale_in'), str(clip.params?.exit, 'fade_out'), clip.content || '');
  const x = num(clip.params?.x, 50);
  const y = num(clip.params?.y, 42);
  const color = str(clip.params?.color, theme.accent);
  if (clip.type === 'arrow_point') {
    return (
      <div
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          opacity: fx.opacity,
          color: theme.text,
          fontWeight: 800,
          fontSize: 28,
        }}
      >
        → {clip.content}
      </div>
    );
  }
  if (clip.type === 'circle_emphasis') {
    return (
      <div
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          transform: 'translate(-50%, -50%)',
          opacity: fx.opacity,
          border: `4px solid ${color}`,
          borderRadius: '50%',
          minWidth: 120,
          minHeight: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.text,
          fontWeight: 800,
          padding: 16,
        }}
      >
        {clip.content}
      </div>
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)',
        opacity: fx.opacity,
        background: theme.captionBg,
        color: theme.text,
        border: `2px solid ${color}`,
        borderRadius: 16,
        padding: '14px 18px',
        fontWeight: 700,
        maxWidth: 360,
      }}
    >
      {clip.content}
    </div>
  );
};

function ClipVisual({clip, theme, talking}: {clip: MotionClip; theme: ClipTheme; talking?: boolean}) {
  if (clip.type === 'keyword_pop' || clip.type === 'keyword_pulse' || clip.type === 'keyword') {
    return <KeywordClip clip={clip} theme={theme} />;
  }
  if (clip.type === 'title_in' || clip.type === 'title') return <TitleIn clip={clip} theme={theme} />;
  if (clip.type === 'step_card') return <StepCardClip clip={clip} theme={theme} talking={talking} />;
  if (
    clip.type === 'deck_ppt' ||
    clip.type === 'deck_stats' ||
    clip.type === 'deck_line' ||
    clip.type === 'deck_timeline' ||
    clip.type === 'deck_compare' ||
    clip.type === 'deck_quote'
  ) {
    return <DeckClip clip={clip} theme={theme} talking={talking} />;
  }
  if (clip.type === 'cta_in' || clip.type === 'cta') return <CtaIn clip={clip} theme={theme} />;
  if (clip.type === 'subtitle') return <SubtitleClip clip={clip} theme={theme} />;
  if (
    clip.type === 'callout' ||
    clip.type === 'arrow_point' ||
    clip.type === 'circle_emphasis' ||
    clip.type === 'underline_reveal' ||
    clip.type === 'marker_highlight'
  ) {
    return <OverlayClip clip={clip} theme={theme} />;
  }
  if (clip.type === 'theme_pulse' || clip.type === 'theme_drift' || clip.type === 'theme_scan' || clip.type === 'theme') {
    const kind = clip.type === 'theme' ? str(clip.params?.kind, 'pulse') : clip.type.replace('theme_', '');
    if (kind === 'none') return null;
    return <ThemeMotionLayer kind={kind as 'pulse' | 'drift' | 'scan'} accent={theme.accent} glow={theme.glow} />;
  }
  return null;
}

export const ClipTrack: React.FC<{clips: MotionClip[]; theme: ClipTheme; talking?: boolean}> = ({
  clips,
  theme,
  talking,
}) => {
  const {fps, durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {clips.map((clip, index) => {
        const from = Math.max(0, Math.round((clip.start || 0) * fps));
        const duration = Math.max(1, Math.round((clip.duration || 0.8) * fps));
        if (from >= durationInFrames) return null;
        return (
          <Sequence key={`${clip.id}-${index}`} from={from} durationInFrames={Math.min(duration, durationInFrames - from)}>
            <ClipVisual clip={clip} theme={theme} talking={talking} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
