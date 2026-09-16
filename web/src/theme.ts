import type {ThemeId, ThemeItem} from './types';

export type CaptionStyle = 'card' | 'bar' | 'chalk';

export type ThemeTokens = {
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
};

export const THEME_OPTIONS: ThemeItem[] = [
  {id: 'slate', name: '场记', accent: '#ffcc33', hint: '黑底黄标', bg: '#0a0a0a'},
  {id: 'education', name: '教育', accent: '#f0c75e', hint: '黑板粉笔', bg: '#163526'},
  {id: 'tech', name: '科技', accent: '#00e8ff', hint: '深空青光', bg: '#050814'},
  {id: 'life', name: '生活', accent: '#e85d4c', hint: '暖光日间', bg: '#fff4e8'},
  {id: 'business', name: '商务', accent: '#d4a017', hint: '海军金', bg: '#0b1628'},
  {id: 'news', name: '资讯', accent: '#d61f26', hint: '新闻红', bg: '#f3f4f6'},
];

export const THEME_TOKENS: Record<ThemeId, ThemeTokens> = {
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
  },
};

const LEGACY: Record<string, ThemeId> = {
  paper: 'life',
  neon: 'tech',
  ink: 'news',
};

export function resolveThemeId(value: string | undefined): ThemeId {
  const mapped = LEGACY[value || ''] || value;
  return mapped && mapped in THEME_TOKENS ? (mapped as ThemeId) : 'slate';
}

export function tokensFor(id: string | undefined): ThemeTokens {
  return THEME_TOKENS[resolveThemeId(id)];
}

export function parseHex(value: unknown): string | null {
  const text = String(value || '').trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(text);
  if (short) {
    const [r, g, b] = short[1];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return /^#([0-9a-fA-F]{6})$/.test(text) ? text.toLowerCase() : null;
}

export function asCssHex(value: unknown, fallback: string): string {
  return parseHex(value) || fallback;
}

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function luma(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function sameHex(left: string, right: string) {
  return (parseHex(left) || '').toLowerCase() === (parseHex(right) || '').toLowerCase();
}

export function scaleGlow(glow: string) {
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

export function applyThemePatch(
  base: ThemeTokens,
  patch?: {bg?: string; text?: string; accent?: string; captionBg?: string} | null,
): ThemeTokens {
  const bg = parseHex(patch?.bg) || base.bg;
  const text = parseHex(patch?.text) || base.text;
  const accent = parseHex(patch?.accent) || base.accent;
  const captionHex = parseHex(patch?.captionBg);
  const dark = luma(bg) < 0.55;
  const readable = Math.abs(luma(bg) - luma(text)) < 0.38 ? (dark ? '#fff7f2' : '#14110a') : text;
  if (sameHex(bg, base.bg) && sameHex(text, base.text) && sameHex(accent, base.accent)) {
    return {
      ...base,
      bg,
      text: readable,
      accent,
      captionBg: captionHex || base.captionBg,
    };
  }
  const [ar, ag, ab] = rgb(accent);
  const [br, bgR, bb] = rgb(bg);
  const [tr, tg, tb] = rgb(readable);
  return {
    ...base,
    bg,
    text: readable,
    accent,
    ctaText: luma(accent) > 0.55 ? '#14110a' : '#fff7f2',
    glow: `radial-gradient(120% 85% at 50% 12%, rgba(${ar},${ag},${ab},0.28), transparent 58%)`,
    captionBg: captionHex || (dark ? `rgba(${br},${bgR},${bb},0.82)` : '#ffffff'),
    muted: `rgba(${tr},${tg},${tb},0.62)`,
    line: `rgba(${ar},${ag},${ab},0.4)`,
    markBg: `rgba(${ar},${ag},${ab},0.16)`,
  };
}

export function tokensForProduce(options: {
  theme?: string;
  themeTokens?: {bg?: string; text?: string; accent?: string; captionBg?: string};
}): ThemeTokens {
  const theme = applyThemePatch(tokensFor(options.theme), options.themeTokens);
  return {...theme, glow: scaleGlow(theme.glow)};
}

export function tokensPayload(options: {
  theme?: string;
  themeTokens?: {bg?: string; text?: string; accent?: string; captionBg?: string};
}): Record<string, string> {
  const theme = tokensForProduce(options);
  return {
    bg: theme.bg,
    text: theme.text,
    accent: theme.accent,
    ctaText: theme.ctaText,
    captionBg: theme.captionBg,
    glow: theme.glow,
    muted: theme.muted,
    line: theme.line,
    markBg: theme.markBg,
    markText: theme.captionStyle === 'bar' ? '#ffffff' : theme.accent,
  };
}
