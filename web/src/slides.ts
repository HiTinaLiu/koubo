function letters(text: string) {
  return (text || '').replace(/[^\w\u4e00-\u9fff]+/g, '');
}

export function slideLines(hook: string, body: string[] | undefined) {
  const lines = (body || []).map((line) => line.trim()).filter(Boolean);
  const lead = (hook || '').trim();
  if (!lead) return lines;
  if (lines[0] && letters(lead) === letters(lines[0])) return lines;
  return [lead, ...lines];
}

export function slideTitle(text: string, limit = 14) {
  const raw = (text || '').replace(/\s+/g, '').replace(/^[，、。！？!?;；：:\s]+|[，、。！？!?;；：:\s]+$/g, '');
  if (!raw) return '要点';
  for (const sep of ['，', '、', '；', ';', '：', ':']) {
    const idx = raw.indexOf(sep);
    if (idx >= 4 && idx <= limit) return raw.slice(0, idx);
  }
  return raw.length <= limit ? raw : raw.slice(0, limit);
}

export function padIndex(value: number) {
  return String(value).padStart(2, '0');
}

export function slideHighlights(text: string, keywords: string[] | undefined, limit = 3) {
  const hits: string[] = [];
  for (const item of keywords || []) {
    if (item && text.includes(item) && !hits.includes(item)) hits.push(item);
    if (hits.length >= limit) break;
  }
  return hits;
}
