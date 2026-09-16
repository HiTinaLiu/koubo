import type {AssetItem, EngineStatus, JobHistoryItem, JobView, LibraryItem, ProduceOptions, Script, SettingsView, SparkStatus, ThemeItem, VisualDeck, VoiceItem} from './types';
import {tokensPayload} from './theme';

function errorMessage(payload: unknown, fallback: string) {
  if (payload == null || payload === '') return fallback;
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    const record = payload as {detail?: unknown; message?: unknown};
    const detail = record.detail ?? record.message;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const lines = detail
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'msg' in item) return String((item as {msg: unknown}).msg);
          return '';
        })
        .filter(Boolean);
      if (lines.length) return lines.join('\n');
    }
    if (detail != null) return typeof detail === 'string' ? detail : JSON.stringify(detail);
  }
  return fallback;
}

async function readBody(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = await readBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(payload, response.statusText || `请求失败 ${response.status}`));
  }
  return payload as T;
}

export async function pingHealth(timeoutMs = 4000) {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(`/api/ping?t=${Date.now()}`, {signal: ctrl.signal, cache: 'no-store'});
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function restartBackend() {
  if (window.koubo?.restartApi) {
    const result = await window.koubo.restartApi();
    if (!result?.ok) throw new Error(result?.message || '强制重启失败');
    return result.message || '后端已强制重启';
  }
  try {
    await fetch('/api/system/restart', {method: 'POST'});
  } catch {
    throw new Error('后端已无响应。请用桌面端强制重启，或在运行 uvicorn 的终端按 Ctrl+C 后重新启动。');
  }
  const start = Date.now();
  while (Date.now() - start < 25000) {
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    if (await pingHealth(2500)) return '后端已重新就绪';
  }
  throw new Error('后端尚未恢复。请到终端重新启动。');
}

export function getJob(id: string) {
  return request<JobView>(`/api/jobs/${id}`);
}

export function listVoices() {
  return request<{voices: VoiceItem[]; themes: ThemeItem[]; default_voice: string; spark: SparkStatus}>(
    '/api/voices',
  );
}

export function createClone(name: string, file: File, promptText: string, source: 'self' | 'other' = 'self') {
  const data = new FormData();
  data.append('name', name);
  data.append('prompt_text', promptText);
  data.append('source', source);
  data.append('file', file, file.name);
  return request<VoiceItem>('/api/voices/clones', {method: 'POST', body: data});
}

export function deleteClone(id: string) {
  return request<{ok: boolean}>(`/api/voices/clones/${id}`, {method: 'DELETE'});
}

export function cloneRefUrl(id: string) {
  return `/api/voices/clones/${encodeURIComponent(id)}/ref?t=${Date.now()}`;
}

export function jobCoverUrl(id: string, stamp?: string) {
  return `/api/jobs/${id}/cover.jpg?t=${stamp || Date.now()}`;
}

export async function previewVoice(voice: string): Promise<Blob> {
  const response = await fetch(`/api/voices/preview?voice=${encodeURIComponent(voice)}&t=${Date.now()}`);
  if (!response.ok) {
    const payload = await readBody(response);
    throw new Error(errorMessage(payload, `试听失败 ${response.status}`));
  }
  return response.blob();
}

export function createTextJob(text: string, voice?: string) {
  return request<JobView>('/api/jobs/text', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({text, voice}),
  });
}

export async function createAudioJob(file: Blob, filename: string, voice?: string) {
  const data = new FormData();
  data.append('file', file, filename);
  if (voice) data.append('voice', voice);
  return request<JobView>('/api/jobs/audio', {method: 'POST', body: data});
}

export function saveTranscript(id: string, text: string) {
  return request<JobView>(`/api/jobs/${id}/transcript`, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({text}),
  });
}

export function analyzeJob(id: string, options?: {genre: string; platform: string}) {
  return request<JobView>(`/api/jobs/${id}/analyze`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(options || {}),
  });
}

export function adoptScript(id: string) {
  return request<JobView>(`/api/jobs/${id}/script/from-transcript`, {method: 'POST'});
}

export function saveScript(id: string, script: Partial<Script>) {
  return request<JobView>(`/api/jobs/${id}/script`, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(script),
  });
}

export function generateKeywords(id: string) {
  return request<JobView>(`/api/jobs/${id}/keywords`, {method: 'POST'});
}

export function scrubScriptLimits(id: string) {
  return request<JobView>(`/api/jobs/${id}/script/limits`, {method: 'POST'});
}

export function renderJob(id: string, options?: ProduceOptions, extra?: {audioOnly?: boolean}) {
  return request<JobView>(`/api/jobs/${id}/render`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(
      options
        ? {
            voice: options.voice,
            orientation: options.orientation,
            theme: options.theme,
            watermark: options.watermark,
            show_watermark: options.showWatermark,
            caption_font: options.captionFont,
            caption_box: options.captionBox,
            caption_size: options.captionSize,
            hide_captions_on_cta: options.hideCaptionsOnCta,
            title_font: options.titleFont,
            title_box: options.titleBox,
            title_size: options.titleSize,
            background_id: options.backgroundId || null,
            music_id: options.musicId || null,
            music_volume: options.musicVolume,
            produce_mode: options.mode,
            render_preset: options.renderPreset === 'fast' ? 'fast' : 'standard',
            theme_motion: options.themeMotion || 'auto',
            text_motion: options.textMotion || 'pop',
            show_subtitles: Boolean(options.showSubtitles),
            person_mask: options.mode === 'teleprompter' ? options.personMask || 'square' : 'square',
            mask_x: options.maskX,
            mask_y: options.maskY,
            mask_w: options.maskW,
            mask_h: options.maskH,
            mask_zoom: options.maskZoom,
            chroma_color: options.chromaColor,
            chroma_tolerance: options.chromaTolerance,
            motion_pack: options.motionPack || 'auto',
            look_brief: options.lookBrief || '',
            theme_tokens: tokensPayload(options),
            title_enter: options.titleEnter || 'scale_in',
            title_exit: options.titleExit || 'fade_out',
            step_enters: options.stepEnters?.length ? options.stepEnters : [options.stepEnter || 'spring_pop'],
            step_exit: options.stepExit || 'fade_out',
            keyword_fx: options.keywordFx || 'keyword_pop',
            cta_enter: options.ctaEnter || 'slide_up',
            deck_kind: options.deckKind || 'mirror',
            title_x: options.titleX ?? 50,
            title_y: options.titleY ?? 24,
            card_x: options.cardX ?? 50,
            card_y: options.cardY ?? 72,
            audio_only: Boolean(extra?.audioOnly),
          }
        : {},
    ),
  });
}

export type LookPlan = {
  look: {
    theme: string;
    theme_motion: string;
    title_enter: string;
    title_exit: string;
    step_enters: string[];
    step_exit: string;
    keyword_fx: string;
    cta_enter: string;
    title_font: string;
    title_box: string;
    title_size: string;
    caption_font: string;
    caption_box: string;
    caption_size: string;
    hide_captions_on_cta: boolean;
    tokens?: Record<string, string>;
    deck_style?: {
      font?: string;
      box?: string;
      size?: string;
      enter?: string;
      exit?: string;
      reveal?: string;
    };
  };
  deck?: VisualDeck | null;
  source: 'llm' | 'pack';
  note: string;
};

export function planLook(jobId: string, brief: string) {
  return request<LookPlan>(`/api/jobs/${jobId}/look`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({brief}),
  });
}

export function planDeck(jobId: string, kind: string) {
  return request<{deck: VisualDeck; source: 'llm' | 'heuristic'; note: string}>(`/api/jobs/${jobId}/deck`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({kind}),
  });
}

export function saveDeck(jobId: string, deck: VisualDeck) {
  return request<{deck: VisualDeck}>(`/api/jobs/${jobId}/deck`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(deck),
  });
}

export function styleDeck(jobId: string, brief: string) {
  return request<{deck: VisualDeck; note: string}>(`/api/jobs/${jobId}/deck/style`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({brief}),
  });
}

export function listLibrary(query = '') {
  const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
  return request<{items: LibraryItem[]}>(`/api/library${suffix}`);
}

export function getLibraryItem(id: string) {
  return request<LibraryItem>(`/api/library/${id}`);
}

export function saveLibraryItem(
  id: string,
  body: {title?: string; original?: string; narration?: string; script?: Script | null; deck?: VisualDeck | null},
) {
  return request<LibraryItem>(`/api/library/${id}`, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

export function deleteLibraryItem(id: string) {
  return request<{ok: boolean}>(`/api/library/${id}`, {method: 'DELETE'});
}

export function deleteLibraryItems(ids: string[]) {
  return request<{ok: boolean; deleted: number}>('/api/library/batch-delete', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ids}),
  });
}

export function reuseLibraryItem(id: string) {
  return request<JobView>(`/api/library/${id}/reuse`, {method: 'POST'});
}

export function listHistory() {
  return request<{jobs: JobHistoryItem[]}>('/api/jobs');
}

export function deleteJob(id: string) {
  return request<{ok: boolean}>(`/api/jobs/${id}`, {method: 'DELETE'});
}

export function deleteJobs(ids: string[]) {
  return request<{ok: boolean; deleted: number; skipped: string[]}>('/api/jobs/batch-delete', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ids}),
  });
}

export function listAssets(kind = '') {
  const suffix = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return request<{items: AssetItem[]}>(`/api/assets${suffix}`);
}

export function createAsset(file: File, name = '', kind = '') {
  const data = new FormData();
  data.append('file', file, file.name);
  if (name) data.append('name', name);
  if (kind) data.append('kind', kind);
  return request<AssetItem>('/api/assets', {method: 'POST', body: data});
}

export function deleteAsset(id: string) {
  return request<{ok: boolean}>(`/api/assets/${id}`, {method: 'DELETE'});
}

export function assetFileUrl(id: string) {
  return `/api/assets/${id}/file`;
}

export function reviewJob(id: string) {
  return request<JobView>(`/api/jobs/${id}/review`, {method: 'POST'});
}

export function uploadTake(id: string, file: Blob, filename = 'take.webm') {
  const data = new FormData();
  data.append('file', file, filename);
  return request<JobView>(`/api/jobs/${id}/take`, {method: 'POST', body: data});
}

export function getSettings() {
  return request<SettingsView>('/api/settings');
}

export function cleanupWorkspace() {
  return request<{ok: boolean; freed: number; freed_label: string; message: string}>('/api/settings/cleanup', {
    method: 'POST',
  });
}

export function saveSettings(body: {
  llm?: {
    id?: string;
    name?: string;
    provider: string;
    base_url: string;
    model: string;
    api_key?: string;
    activate?: boolean;
  };
  prompts?: Record<string, string>;
  genres?: Record<string, string>;
  platforms?: Record<string, string>;
}) {
  return request<SettingsView>('/api/settings', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

export function activateLlm(id: string) {
  return request<SettingsView>('/api/settings/llm/activate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({id}),
  });
}

export function deleteLlm(id: string) {
  return request<SettingsView>(`/api/settings/llm/${id}`, {method: 'DELETE'});
}

export function resetSettings(scope = 'all') {
  return request<SettingsView>('/api/settings/reset', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({scope}),
  });
}

export function testSettings(body: {base_url?: string; model?: string; api_key?: string}) {
  return request<{ok: boolean; model: string; reply: string}>('/api/settings/test', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

export function getModels() {
  return request<EngineStatus>('/api/models');
}

export function installModel(id: string) {
  return request<EngineStatus>(`/api/models/${id}/install`, {method: 'POST'});
}

export function removeModel(id: string) {
  return request<EngineStatus>(`/api/models/${id}`, {method: 'DELETE'});
}
