import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import type {ThemeId} from './types';

export type ThemeMotion = 'auto' | 'none' | 'pulse' | 'drift' | 'scan';
export type TextMotion = 'fade' | 'pop' | 'type' | 'slide';

const AUTO_MOTION: Record<ThemeId, Exclude<ThemeMotion, 'auto'>> = {
  slate: 'pulse',
  education: 'drift',
  tech: 'scan',
  life: 'drift',
  business: 'pulse',
  news: 'scan',
  paper: 'drift',
  neon: 'scan',
  ink: 'scan',
};

export function resolveThemeMotion(id: ThemeId | undefined, motion?: ThemeMotion | null) {
  if (motion && motion !== 'auto') return motion;
  return AUTO_MOTION[id || 'slate'] || 'pulse';
}

export function useTextMotion(kind: TextMotion | undefined, text: string) {
  const frame = useCurrentFrame();
  const motion = kind || 'pop';
  const fade = interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp'});
  if (motion === 'type') {
    const count = Math.max(1, Math.floor(interpolate(frame, [0, 14], [0, text.length], {extrapolateRight: 'clamp'})));
    return {opacity: 1, transform: 'none', text: text.slice(0, count)};
  }
  if (motion === 'slide') {
    const x = interpolate(frame, [0, 10], [48, 0], {extrapolateRight: 'clamp'});
    return {opacity: fade, transform: `translateX(${x}px)`, text};
  }
  if (motion === 'pop') {
    const scale = interpolate(frame, [0, 9], [0.86, 1], {extrapolateRight: 'clamp'});
    return {opacity: fade, transform: `scale(${scale})`, text};
  }
  return {opacity: fade, transform: 'none', text};
}

export const ThemeMotionLayer: React.FC<{
  kind: Exclude<ThemeMotion, 'auto'>;
  accent: string;
  glow: string;
}> = ({kind}) => {
  const frame = useCurrentFrame();
  if (kind === 'none') return null;
  const opacity = interpolate(Math.sin(frame / 18), [-1, 1], [0, 0.1]);
  return (
    <AbsoluteFill
      style={{
        background: '#ffffff',
        opacity,
        mixBlendMode: 'overlay',
        pointerEvents: 'none',
      }}
    />
  );
}

export const ChromaKeyFilter: React.FC<{color?: string; tolerance?: number}> = ({
  color = '#2ecc40',
  tolerance = 0.18,
}) => {
  const key = /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#2ecc40';
  const t = Math.min(0.42, Math.max(0.06, tolerance || 0.18));
  const soft = 0.07;
  const slope = 1 / soft;
  const intercept = -t / soft;
  return (
    <svg width="0" height="0" style={{position: 'absolute'}}>
      <filter id="koubo-chroma" colorInterpolationFilters="sRGB" x="-2%" y="-2%" width="104%" height="104%">
        <feFlood floodColor={key} result="key" />
        <feBlend in="SourceGraphic" in2="key" mode="difference" result="diff" />
        <feColorMatrix
          in="diff"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.299 0.587 0.114 0 0"
          result="lum"
        />
        <feComponentTransfer in="lum" result="hard">
          <feFuncA type="linear" slope={slope} intercept={intercept} />
        </feComponentTransfer>
        <feMorphology in="hard" operator="erode" radius="0.7" result="eroded" />
        <feGaussianBlur in="eroded" stdDeviation="0.55" result="softmask" />
        <feComposite in="SourceGraphic" in2="softmask" operator="in" result="cut" />
        <feColorMatrix in="cut" type="saturate" values="0.94" />
      </filter>
    </svg>
  );
};
