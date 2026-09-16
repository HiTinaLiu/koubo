export const DEFAULT_CHROMA_COLOR = '#2ecc40';
export const DEFAULT_CHROMA_TOLERANCE = 0.18;

export const CHROMA_PRESETS = [
  {id: '#2ecc40', name: '绿幕'},
  {id: '#1e90ff', name: '蓝幕'},
  {id: '#ffffff', name: '白墙'},
  {id: '#111111', name: '黑幕'},
  {id: '#e74c3c', name: '红幕'},
  {id: '#f1c40f', name: '黄幕'},
] as const;

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}

export function normalizeChromaColor(value: unknown) {
  const raw = String(value || '').trim();
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toLowerCase()}`;
  return DEFAULT_CHROMA_COLOR;
}

export function normalizeChromaTolerance(value: unknown) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_CHROMA_TOLERANCE;
  return Math.round(clamp(number, 0.06, 0.42) * 1000) / 1000;
}

function dist(a: readonly number[], b: readonly number[]) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function sampleChromaFromFrame(video: HTMLVideoElement) {
  const width = 48;
  const height = 48;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) return DEFAULT_CHROMA_COLOR;
  ctx.drawImage(video, 0, 0, width, height);
  const points = [
    [2, 2],
    [width - 3, 2],
    [2, height - 3],
    [width - 3, height - 3],
    [Math.floor(width / 2), 2],
    [Math.floor(width / 2), height - 3],
    [2, Math.floor(height / 2)],
    [width - 3, Math.floor(height / 2)],
  ];
  const colors = points.map(([x, y]) => {
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    return [pixel[0], pixel[1], pixel[2]] as const;
  });
  let best = colors[0];
  let bestScore = -1;
  for (const color of colors) {
    const score = colors.filter((other) => dist(color, other) < 42).length;
    if (score > bestScore) {
      best = color;
      bestScore = score;
    }
  }
  const cluster = colors.filter((color) => dist(color, best) < 42);
  const rgb = [0, 0, 0];
  for (const color of cluster) {
    rgb[0] += color[0];
    rgb[1] += color[1];
    rgb[2] += color[2];
  }
  const n = Math.max(1, cluster.length);
  const hex = rgb
    .map((channel) => Math.round(channel / n)
      .toString(16)
      .padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

export function sampleChromaFromUrl(url: string) {
  return new Promise<string>((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    const fail = () => reject(new Error('无法读取录像取色'));
    video.onerror = fail;
    video.onloadeddata = () => {
      const seek = Math.min(0.35, Math.max(0, (video.duration || 1) * 0.08));
      const finish = () => resolve(sampleChromaFromFrame(video));
      if (Math.abs(video.currentTime - seek) < 0.02) {
        finish();
        return;
      }
      video.onseeked = finish;
      try {
        video.currentTime = seek;
      } catch {
        finish();
      }
    };
  });
}
