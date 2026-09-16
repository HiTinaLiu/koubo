const MAX_WORK = 480;

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function yuv(r: number, g: number, b: number) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return {y, u: r - y, v: b - y};
}

function dist2(a: {y: number; u: number; v: number}, r: number, g: number, b: number) {
  const p = yuv(r, g, b);
  const dy = p.y - a.y;
  const du = p.u - a.u;
  const dv = p.v - a.v;
  return 0.28 * dy * dy + du * du + dv * dv;
}

function floodWalkable(walk: Uint8Array, width: number, height: number) {
  const count = width * height;
  const seen = new Uint8Array(count);
  const queue = new Uint32Array(count);
  let head = 0;
  let tail = 0;
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (seen[i] || !walk[i]) return;
    seen[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i / width) | 0;
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }
  return seen;
}

function morph(src: Uint8Array, width: number, height: number, dilate: boolean) {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = dilate ? 0 : 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const bit = src[ny * width + nx];
          if (dilate) value = value || bit;
          else value = value && bit;
        }
      }
      out[y * width + x] = value ? 1 : 0;
    }
  }
  return out;
}

function closeMask(src: Uint8Array, width: number, height: number, radius: number) {
  let mask = src;
  for (let i = 0; i < radius; i++) mask = morph(mask, width, height, true);
  for (let i = 0; i < radius; i++) mask = morph(mask, width, height, false);
  return mask;
}

function fillInterior(fg: Uint8Array, width: number, height: number) {
  const walk = new Uint8Array(fg.length);
  for (let i = 0; i < fg.length; i++) walk[i] = fg[i] ? 0 : 1;
  const outer = floodWalkable(walk, width, height);
  const filled = new Uint8Array(fg.length);
  for (let i = 0; i < fg.length; i++) filled[i] = !outer[i] ? 1 : 0;
  return filled;
}

export function keySolidContour(image: ImageData, tightness = 0.18) {
  const {width, height, data} = image;
  const samplesY: number[] = [];
  const samplesU: number[] = [];
  const samplesV: number[] = [];
  const take = (x: number, y: number) => {
    const o = (y * width + x) * 4;
    const p = yuv(data[o], data[o + 1], data[o + 2]);
    samplesY.push(p.y);
    samplesU.push(p.u);
    samplesV.push(p.v);
  };
  for (let x = 0; x < width; x += 2) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 2) {
    take(0, y);
    take(width - 1, y);
  }
  const key = {y: median(samplesY), u: median(samplesU), v: median(samplesV)};
  const spread = Math.sqrt(
    median(samplesY.map((value) => Math.abs(value - key.y))) ** 2 +
      median(samplesU.map((value) => Math.abs(value - key.u))) ** 2 +
      median(samplesV.map((value) => Math.abs(value - key.v))) ** 2,
  );
  const limit = Math.max(16, Math.min(78, 14 + tightness * 110 + spread * 1.15));
  const limit2 = limit * limit;
  const count = width * height;
  const gray = new Float32Array(count);
  const like = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    like[i] = dist2(key, data[o], data[o + 1], data[o + 2]) <= limit2 ? 1 : 0;
  }
  const barrier = new Uint8Array(count);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const gx = Math.abs(gray[i] - gray[y * width + Math.min(width - 1, x + 1)]);
      const gy = Math.abs(gray[i] - gray[Math.min(height - 1, y + 1) * width + x]);
      barrier[i] = gx + gy > 18 ? 1 : 0;
    }
  }
  const walk = new Uint8Array(count);
  for (let i = 0; i < count; i++) walk[i] = like[i] && !barrier[i] ? 1 : 0;
  for (let x = 0; x < width; x++) {
    walk[x] = like[x];
    walk[(height - 1) * width + x] = like[(height - 1) * width + x];
  }
  for (let y = 0; y < height; y++) {
    walk[y * width] = like[y * width];
    walk[y * width + width - 1] = like[y * width + width - 1];
  }
  const outerBg = floodWalkable(walk, width, height);
  let fg = new Uint8Array(count);
  for (let i = 0; i < count; i++) fg[i] = outerBg[i] ? 0 : 1;
  const radius = tightness > 0.28 ? 3 : tightness > 0.16 ? 2 : 1;
  fg = fillInterior(closeMask(fg, width, height, radius), width, height);

  const out = new ImageData(width, height);
  out.data.set(data);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    if (!fg[i]) {
      out.data[o + 3] = 0;
      continue;
    }
    const x = i % width;
    const y = (i / width) | 0;
    const outer =
      (x > 0 && !fg[i - 1]) ||
      (x + 1 < width && !fg[i + 1]) ||
      (y > 0 && !fg[i - width]) ||
      (y + 1 < height && !fg[i + width]);
    out.data[o + 3] = outer ? 210 : 255;
  }
  return out;
}

export function contourWorkSize(videoWidth: number, videoHeight: number) {
  const scale = Math.min(1, MAX_WORK / Math.max(videoWidth, videoHeight, 1));
  return {
    width: Math.max(2, Math.round(videoWidth * scale)),
    height: Math.max(2, Math.round(videoHeight * scale)),
  };
}
