import type {CSSProperties} from 'react';
import type {CaptionBox, CaptionFont, CaptionSize} from './types';
import type {ThemeTokens} from './theme';

export const CAPTION_FONTS: Array<{id: CaptionFont; name: string; family: string}> = [
  {id: 'sans', name: '黑体', family: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif'},
  {id: 'serif', name: '宋体', family: 'SimSun, "Songti SC", "Noto Serif SC", serif'},
  {id: 'xiaowei', name: '小薇', family: 'FangSong, "STFangsong", "ZCOOL XiaoWei", serif'},
  {id: 'huangyou', name: '黄油', family: 'YouYuan, "STYuanti", "ZCOOL QingKe HuangYou", sans-serif'},
  {id: 'kuaile', name: '快乐', family: 'YouYuan, "Comic Sans MS", "ZCOOL KuaiLe", sans-serif'},
  {id: 'mashan', name: '行楷', family: 'KaiTi, "STKaiti", "Ma Shan Zheng", serif'},
];

export const CAPTION_BOXES: Array<{id: CaptionBox; name: string}> = [
  {id: 'theme', name: '跟主题'},
  {id: 'card', name: '卡片'},
  {id: 'bar', name: '色条'},
  {id: 'chalk', name: '粉笔'},
  {id: 'outline', name: '描边'},
  {id: 'plain', name: '素字'},
];

export const CAPTION_SIZES: Array<{id: CaptionSize; name: string; scale: number}> = [
  {id: 'sm', name: '小', scale: 0.78},
  {id: 'md', name: '中', scale: 1},
  {id: 'lg', name: '大', scale: 1.38},
];

export function captionFontFamily(id?: CaptionFont | string | null) {
  return CAPTION_FONTS.find((item) => item.id === id)?.family || CAPTION_FONTS[0].family;
}

export function captionScale(id?: CaptionSize | string | null) {
  return CAPTION_SIZES.find((item) => item.id === id)?.scale ?? 1;
}

/** 相对标题小几号：一号约 0.78 倍。要点 / 左右栏用小 1 号。 */
export function captionBodyScale(id?: CaptionSize | string | null, steps = 1) {
  return captionScale(id) * 0.78 ** steps;
}

export function resolveCaptionBox(
  box: CaptionBox | string | null | undefined,
  themeBox: 'card' | 'bar' | 'chalk',
): Exclude<CaptionBox, 'theme'> {
  if (box === 'card' || box === 'bar' || box === 'chalk' || box === 'outline' || box === 'plain') {
    return box;
  }
  return themeBox;
}

export function captionBoxLabel(box: Exclude<CaptionBox, 'theme'> | string) {
  return CAPTION_BOXES.find((item) => item.id === box)?.name || CAPTION_BOXES[1].name;
}

export function captionFontName(id?: CaptionFont | string | null) {
  return CAPTION_FONTS.find((item) => item.id === id)?.name || CAPTION_FONTS[0].name;
}

export function captionSizeName(id?: CaptionSize | string | null) {
  return CAPTION_SIZES.find((item) => item.id === id)?.name || '中';
}

export function captionFill(box: Exclude<CaptionBox, 'theme'>, theme: ThemeTokens) {
  if (box === 'chalk' || box === 'outline' || box === 'plain') {
    return 'transparent';
  }
  const bg = theme.captionBg;
  if (!bg || bg === 'transparent') {
    return box === 'bar' ? 'rgba(17,17,17,0.82)' : 'rgba(0,0,0,0.72)';
  }
  return bg;
}

export function captionInk(box: Exclude<CaptionBox, 'theme'>, theme: ThemeTokens) {
  if (box !== 'bar' && box !== 'card') return theme.text;
  const fill = captionFill(box, theme);
  if (isLightFill(fill)) return lumaOf(theme.text) < 0.55 ? theme.text : '#14110a';
  return lumaOf(theme.text) > 0.55 ? theme.text : '#fff7f2';
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
  return 1;
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

export function captionVisualStyle(
  box: Exclude<CaptionBox, 'theme'>,
  theme: ThemeTokens,
  family: string,
  fontSize: number,
): CSSProperties {
  const shared: CSSProperties = {
    fontFamily: family,
    fontSize,
    fontWeight: 700,
    color: box === 'bar' || box === 'card' ? captionInk(box, theme) : theme.text,
    lineHeight: 1.35,
  };
  if (box === 'bar') {
    return {
      ...shared,
      background: captionFill(box, theme),
      border: 0,
      borderLeft: `7px solid ${theme.accent}`,
      padding: '8px 10px 8px 12px',
    };
  }
  if (box === 'chalk') {
    return {
      ...shared,
      background: 'transparent',
      border: 0,
      borderBottom: `3px solid ${theme.accent}`,
      borderRadius: 0,
      padding: '6px 4px',
    };
  }
  if (box === 'outline') {
    return {
      ...shared,
      background: 'transparent',
      border: 0,
      padding: '6px 4px',
      textShadow: '-1px 0 #000, 1px 0 #000, 0 -1px #000, 0 1px #000, 0 3px 8px rgba(0,0,0,0.55)',
    };
  }
  if (box === 'plain') {
    return {
      ...shared,
      background: 'transparent',
      border: 0,
      padding: '6px 4px',
      textShadow: '0 3px 10px rgba(0,0,0,0.75)',
    };
  }
  return {
    ...shared,
    background: captionFill(box, theme),
    border: `2px solid ${theme.line || theme.accent}`,
    padding: '8px 10px',
  };
}
