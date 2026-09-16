export const DEFAULT_MASK_X = 0.5;
export const DEFAULT_MASK_Y = 0.47;
export const DEFAULT_MASK_W = 0.64;
export const DEFAULT_MASK_H = 0.72;
export const DEFAULT_MASK_ZOOM = 1;
export const MIN_MASK_ZOOM = 0.4;
export const MAX_MASK_ZOOM = 3;

const MIN = 0.12;

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function num(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeMask(x: unknown, y: unknown, w: unknown, h: unknown) {
  const maskW = clamp(num(w, DEFAULT_MASK_W), MIN, 1);
  const maskH = clamp(num(h, DEFAULT_MASK_H), MIN, 1);
  return {
    maskX: round(clamp(num(x, DEFAULT_MASK_X), maskW / 2, 1 - maskW / 2)),
    maskY: round(clamp(num(y, DEFAULT_MASK_Y), maskH / 2, 1 - maskH / 2)),
    maskW: round(maskW),
    maskH: round(maskH),
  };
}

export function normalizeZoom(value: unknown) {
  return round(clamp(num(value, DEFAULT_MASK_ZOOM), MIN_MASK_ZOOM, MAX_MASK_ZOOM));
}

export function isPersonHole(mask?: string | null) {
  return mask === 'cutout' || mask === 'square' || mask === 'chroma';
}

/** 预览里可拖框、放缩人像（不含「不用人像」） */
export function usesPersonFrame(mask?: string | null) {
  return isPersonHole(mask);
}

/** 矩形选框：方形挖空、纯色抠像；旧版 off 视同方形 */
export function isRectPersonFrame(mask?: string | null) {
  return mask === 'square' || mask === 'chroma' || mask === 'off';
}

export function normalizePersonMask(mask?: string | null): 'theme' | 'cutout' | 'square' | 'chroma' {
  if (mask === 'theme' || mask === 'cutout' || mask === 'chroma') return mask;
  return 'square';
}

export function hidesTalkingHead(mask?: string | null) {
  return mask === 'theme';
}
