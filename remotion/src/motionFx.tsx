import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

export const ENTER_FX = [
  'fade_in',
  'slide_up',
  'slide_down',
  'slide_left',
  'slide_right',
  'scale_in',
  'spring_pop',
  'bounce',
  'typewriter',
  'word_reveal',
  'char_reveal',
  'blur_reveal',
  'glitch_text',
  'shake',
  'underline_reveal',
  'marker_highlight',
] as const;

export const EXIT_FX = ['fade_out', 'scale_out', 'slide_up', 'slide_down', 'slide_left', 'slide_right'] as const;

export type EnterFx = (typeof ENTER_FX)[number] | 'keyword_pop' | 'keyword_pulse' | 'karaoke' | 'word_highlight' | string;
export type ExitFx = (typeof EXIT_FX)[number] | string;

function splitWords(text: string) {
  return text.split(/(\s+)/).filter(Boolean);
}

export function useClipFx(enter: EnterFx | undefined, exit: ExitFx | undefined, text: string) {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const dur = Math.max(0.24, durationInFrames / fps);
  const t = frame / fps;
  const enterDur = Math.min(0.48, Math.max(0.16, dur * 0.28));
  const exitDur = Math.min(0.36, Math.max(0.12, dur * 0.2));
  const inT = Math.min(1, t / enterDur);
  const outT = t > dur - exitDur ? Math.min(1, (t - (dur - exitDur)) / exitDur) : 0;
  const fx = enter || 'fade_in';
  const ex = exit || 'fade_out';

  let opacity = interpolate(inT, [0, 1], [0, 1], {extrapolateRight: 'clamp'});
  let tx = 0;
  let ty = 0;
  let scale = 1;
  let blur = 0;
  let skew = 0;
  let shown = text;

  if (fx === 'fade_in') {
    opacity = interpolate(inT, [0, 1], [0, 1], {extrapolateRight: 'clamp'});
  } else if (fx === 'slide_up') {
    ty = interpolate(inT, [0, 1], [56, 0], {extrapolateRight: 'clamp'});
  } else if (fx === 'slide_down') {
    ty = interpolate(inT, [0, 1], [-56, 0], {extrapolateRight: 'clamp'});
  } else if (fx === 'slide_left') {
    tx = interpolate(inT, [0, 1], [72, 0], {extrapolateRight: 'clamp'});
  } else if (fx === 'slide_right') {
    tx = interpolate(inT, [0, 1], [-72, 0], {extrapolateRight: 'clamp'});
  } else if (fx === 'scale_in' || fx === 'keyword_pop') {
    scale = interpolate(inT, [0, 0.7, 1], [0.62, 1.12, 1], {extrapolateRight: 'clamp'});
  } else if (fx === 'spring_pop') {
    scale = interpolate(inT, [0, 0.45, 0.72, 1], [0.7, 1.16, 0.94, 1], {extrapolateRight: 'clamp'});
  } else if (fx === 'bounce') {
    ty = interpolate(inT, [0, 0.45, 0.7, 1], [48, -10, 6, 0], {extrapolateRight: 'clamp'});
    scale = interpolate(inT, [0, 0.45, 1], [0.9, 1.06, 1], {extrapolateRight: 'clamp'});
  } else if (fx === 'typewriter' || fx === 'char_reveal') {
    const count = Math.max(1, Math.floor(interpolate(inT, [0, 1], [0, text.length], {extrapolateRight: 'clamp'})));
    shown = text.slice(0, count);
    opacity = 1;
  } else if (fx === 'word_reveal') {
    const words = text.split(/(\s+)/);
    const n = Math.max(1, Math.floor(interpolate(inT, [0, 1], [0, words.length], {extrapolateRight: 'clamp'})));
    shown = words.slice(0, n).join('');
    opacity = 1;
  } else if (fx === 'blur_reveal') {
    blur = interpolate(inT, [0, 1], [14, 0], {extrapolateRight: 'clamp'});
  } else if (fx === 'glitch_text') {
    skew = interpolate(Math.sin(frame * 1.7), [-1, 1], [-8, 8]);
    tx = interpolate(Math.cos(frame * 2.1), [-1, 1], [-4, 4]);
    opacity = interpolate(inT, [0, 0.2, 1], [0, 1, 1], {extrapolateRight: 'clamp'});
  } else if (fx === 'shake') {
    tx = interpolate(Math.sin(frame * 2.4), [-1, 1], [-5, 5]) * (1 - inT * 0.4);
    ty = interpolate(Math.cos(frame * 1.9), [-1, 1], [-3, 3]) * (1 - inT * 0.4);
  } else if (fx === 'keyword_pulse') {
    scale = interpolate(Math.sin(frame / 7), [-1, 1], [0.94, 1.08]);
    opacity = interpolate(inT, [0, 1], [0, 1], {extrapolateRight: 'clamp'});
  } else if (fx === 'karaoke' || fx === 'word_highlight') {
    opacity = 1;
  }

  if (outT > 0) {
    if (ex === 'fade_out') opacity *= interpolate(outT, [0, 1], [1, 0], {extrapolateRight: 'clamp'});
    if (ex === 'scale_out') scale *= interpolate(outT, [0, 1], [1, 0.72], {extrapolateRight: 'clamp'});
    if (ex === 'slide_up') ty += interpolate(outT, [0, 1], [0, -48], {extrapolateRight: 'clamp'});
    if (ex === 'slide_down') ty += interpolate(outT, [0, 1], [0, 48], {extrapolateRight: 'clamp'});
    if (ex === 'slide_left') tx += interpolate(outT, [0, 1], [0, -64], {extrapolateRight: 'clamp'});
    if (ex === 'slide_right') tx += interpolate(outT, [0, 1], [0, 64], {extrapolateRight: 'clamp'});
    opacity *= interpolate(outT, [0, 1], [1, 0.15], {extrapolateRight: 'clamp'});
  }

  const underline = fx === 'underline_reveal' ? interpolate(inT, [0, 1], [0, 100], {extrapolateRight: 'clamp'}) : 0;
  const marker = fx === 'marker_highlight' ? interpolate(inT, [0, 1], [0, 100], {extrapolateRight: 'clamp'}) : 0;
  const karaokeAt =
    fx === 'karaoke' || fx === 'word_highlight'
      ? interpolate(t, [0, dur], [0, 1], {extrapolateRight: 'clamp'})
      : 0;

  return {
    opacity,
    transform: `translate(${tx}px, ${ty}px) scale(${scale}) skewX(${skew}deg)`,
    filter: blur > 0.2 ? `blur(${blur}px)` : undefined,
    text: shown,
    underline,
    marker,
    karaokeAt,
    words: splitWords(text),
  };
}

export const FxText: React.FC<{
  enter?: string;
  exit?: string;
  text: string;
  color?: string;
  accent?: string;
  fontSize?: number;
  fontWeight?: number;
  style?: React.CSSProperties;
}> = ({enter, exit, text, color, accent, fontSize, fontWeight, style}) => {
  const fx = useClipFx(enter, exit, text);
  if (enter === 'karaoke' || enter === 'word_highlight') {
    const cutoff = Math.floor(fx.karaokeAt * fx.words.length);
    return (
      <div style={{opacity: fx.opacity, transform: fx.transform, ...style}}>
        {fx.words.map((word, index) => (
          <span
            key={`${word}-${index}`}
            style={{
              color: index < cutoff ? accent || '#ffcc33' : color,
              fontSize,
              fontWeight,
            }}
          >
            {word}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div
      style={{
        opacity: fx.opacity,
        transform: fx.transform,
        filter: fx.filter,
        color,
        fontSize,
        fontWeight,
        position: 'relative',
        display: 'inline-block',
        ...style,
      }}
    >
      {fx.marker ? (
        <span
          style={{
            position: 'absolute',
            left: 0,
            right: `${100 - fx.marker}%`,
            bottom: 2,
            top: 4,
            background: `${accent || '#ffcc33'}66`,
            zIndex: 0,
          }}
        />
      ) : null}
      <span style={{position: 'relative', zIndex: 1}}>{fx.text}</span>
      {fx.underline ? (
        <span
          style={{
            position: 'absolute',
            left: 0,
            width: `${fx.underline}%`,
            bottom: 0,
            height: 4,
            background: accent || '#ffcc33',
          }}
        />
      ) : null}
    </div>
  );
};
