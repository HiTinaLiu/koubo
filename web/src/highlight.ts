import type {Script} from './types';

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

export const STEP_MARKERS = [
  ...CN_NUM.map((n) => `第十${n}步`),
  '第十步',
  ...CN_NUM.map((n) => `第${n}步`),
  ...CN_NUM.map((n) => `第十${n}`),
  '第十',
  ...CN_NUM.map((n) => `第${n}`),
  '首先',
  '其次',
  '再次',
  '最后',
];

export function stepMarkersIn(text: string) {
  return STEP_MARKERS.filter((item) => (text || '').includes(item));
}

export function highlightParts(text: string, highlights: string[]) {
  const keys = [...highlights, ...stepMarkersIn(text)].filter(Boolean).sort((a, b) => b.length - a.length);
  const unique: string[] = [];
  for (const key of keys) {
    if (!unique.includes(key)) unique.push(key);
  }
  if (!unique.length || !text) return [{text, hit: false, step: false}];
  const steps = new Set(stepMarkersIn(text));
  const parts: {text: string; hit: boolean; step: boolean}[] = [];
  let rest = text;
  while (rest) {
    let best = -1;
    let key = '';
    for (const item of unique) {
      const at = rest.indexOf(item);
      if (at < 0) continue;
      if (best < 0 || at < best || (at === best && item.length > key.length)) {
        best = at;
        key = item;
      }
    }
    if (best < 0) {
      parts.push({text: rest, hit: false, step: false});
      break;
    }
    if (best > 0) parts.push({text: rest.slice(0, best), hit: false, step: false});
    parts.push({text: key, hit: true, step: steps.has(key)});
    rest = rest.slice(best + key.length);
  }
  return parts;
}

export function captionHighlights(script: Script | null) {
  return script?.keywords?.length ? script.keywords : [];
}
