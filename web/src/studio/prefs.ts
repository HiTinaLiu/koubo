import {
  DEFAULT_CHROMA_COLOR,
  DEFAULT_CHROMA_TOLERANCE,
  normalizeChromaColor,
  normalizeChromaTolerance,
} from '../chroma';
import {DEFAULT_REWRITE, REWRITE_GENRES, REWRITE_PLATFORMS} from '../rewrite';
import {
  DEFAULT_MASK_H,
  DEFAULT_MASK_W,
  DEFAULT_MASK_X,
  DEFAULT_MASK_Y,
  DEFAULT_MASK_ZOOM,
  normalizeMask,
  normalizeZoom,
} from '../produce/mask';
import {resolveThemeId} from '../theme';
import type {DeckKind, ProduceOptions} from '../types';
import type {RewriteOptions} from '../rewrite';

const DECK_KINDS: DeckKind[] = ['mirror', 'points', 'steps', 'stats', 'compare', 'quote', 'chart', 'timeline', 'auto'];
const LEGACY_DECK: Record<string, DeckKind> = {
  ppt_summary: 'points',
  data_analysis: 'chart',
  method_steps: 'steps',
  comparison: 'compare',
  timeline_story: 'timeline',
  mixed: 'auto',
};

export function normalizeDeckKind(raw: unknown): DeckKind {
  const mapped = LEGACY_DECK[String(raw || '')] || String(raw || '');
  return DECK_KINDS.includes(mapped as DeckKind) ? (mapped as DeckKind) : 'mirror';
}

function clampPct(value: unknown, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(8, Math.min(92, Math.round(next * 10) / 10));
}

export const PREFS_KEY = 'koubo.produce';
export const REWRITE_KEY = 'koubo.rewrite';

export const DEFAULT_PRODUCE: ProduceOptions = {
  voice: 'zh-CN-XiaoxiaoNeural',
  orientation: 'portrait',
  theme: 'slate',
  watermark: '口播场记',
  showWatermark: true,
  captionFont: 'sans',
  captionBox: 'theme',
  captionSize: 'md',
  hideCaptionsOnCta: true,
  titleFont: 'sans',
  titleBox: 'outline',
  titleSize: 'lg',
  backgroundId: '',
  musicId: '',
  musicVolume: 0.16,
  mode: 'tts',
  renderPreset: 'standard',
  themeMotion: 'auto',
  textMotion: 'pop',
  showSubtitles: false,
  personMask: 'square',
  maskX: DEFAULT_MASK_X,
  maskY: DEFAULT_MASK_Y,
  maskW: DEFAULT_MASK_W,
  maskH: DEFAULT_MASK_H,
  maskZoom: DEFAULT_MASK_ZOOM,
  chromaColor: DEFAULT_CHROMA_COLOR,
  chromaTolerance: DEFAULT_CHROMA_TOLERANCE,
  motionPack: 'auto',
  lookBrief: '',
  savedLookId: '',
  titleEnter: 'scale_in',
  titleExit: 'fade_out',
  stepEnter: 'spring_pop',
  stepEnters: ['spring_pop'],
  stepExit: 'fade_out',
  keywordFx: 'keyword_pop',
  ctaEnter: 'slide_up',
  themeTokens: {bg: '#0a0a0a', text: '#fff7d6', accent: '#ffcc33', captionBg: '#0c0c0c'},
  deckKind: 'auto',
  titleX: 50,
  titleY: 24,
  cardX: 50,
  cardY: 72,
  deckReveal: 'stagger',
};

export function loadPrefs(): ProduceOptions {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ProduceOptions>;
      if (parsed.theme) parsed.theme = resolveThemeId(parsed.theme);
      if (parsed.mode !== 'teleprompter') parsed.mode = 'tts';
      return {
        ...DEFAULT_PRODUCE,
        ...parsed,
        renderPreset: parsed.renderPreset === 'fast' ? 'fast' : 'standard',
        themeMotion:
          parsed.themeMotion === 'none' ||
          parsed.themeMotion === 'pulse' ||
          parsed.themeMotion === 'drift' ||
          parsed.themeMotion === 'scan'
            ? parsed.themeMotion
            : 'auto',
        textMotion:
          parsed.textMotion === 'fade' || parsed.textMotion === 'type' || parsed.textMotion === 'slide'
            ? parsed.textMotion
            : 'pop',
        personMask:
          parsed.personMask === 'theme' ||
          parsed.personMask === 'cutout' ||
          parsed.personMask === 'chroma'
            ? parsed.personMask
            : 'square',
        showSubtitles: Boolean(parsed.showSubtitles),
        ...normalizeMask(parsed.maskX, parsed.maskY, parsed.maskW, parsed.maskH),
        maskZoom: normalizeZoom(parsed.maskZoom),
        chromaColor: normalizeChromaColor(parsed.chromaColor),
        chromaTolerance: normalizeChromaTolerance(parsed.chromaTolerance),
        motionPack:
          parsed.motionPack === 'knowledge' ||
          parsed.motionPack === 'news' ||
          parsed.motionPack === 'life' ||
          parsed.motionPack === 'tech' ||
          parsed.motionPack === 'education' ||
          parsed.motionPack === 'business' ||
          parsed.motionPack === 'custom'
            ? parsed.motionPack
            : 'auto',
        lookBrief: typeof parsed.lookBrief === 'string' ? parsed.lookBrief : '',
        savedLookId: typeof parsed.savedLookId === 'string' ? parsed.savedLookId : '',
        titleEnter: typeof parsed.titleEnter === 'string' ? parsed.titleEnter : 'scale_in',
        titleExit: typeof parsed.titleExit === 'string' ? parsed.titleExit : 'fade_out',
        stepEnter: typeof parsed.stepEnter === 'string' ? parsed.stepEnter : 'spring_pop',
        stepEnters: Array.isArray(parsed.stepEnters) && parsed.stepEnters.length
          ? parsed.stepEnters.map(String)
          : [typeof parsed.stepEnter === 'string' ? parsed.stepEnter : 'spring_pop'],
        stepExit: typeof parsed.stepExit === 'string' ? parsed.stepExit : 'fade_out',
        keywordFx: parsed.keywordFx === 'keyword_pulse' ? 'keyword_pulse' : 'keyword_pop',
        ctaEnter: typeof parsed.ctaEnter === 'string' ? parsed.ctaEnter : 'slide_up',
        themeTokens: {
          bg: parsed.themeTokens?.bg || DEFAULT_PRODUCE.themeTokens.bg,
          text: parsed.themeTokens?.text || DEFAULT_PRODUCE.themeTokens.text,
          accent: parsed.themeTokens?.accent || DEFAULT_PRODUCE.themeTokens.accent,
          captionBg: parsed.themeTokens?.captionBg || DEFAULT_PRODUCE.themeTokens.captionBg,
        },
        deckKind: normalizeDeckKind(parsed.deckKind),
        titleX: clampPct(parsed.titleX, 50),
        titleY: clampPct(parsed.titleY, 24),
        cardX: clampPct(parsed.cardX, 50),
        cardY: clampPct(parsed.cardY, 72),
        deckReveal:
          parsed.deckReveal === 'fade' || parsed.deckReveal === 'draw' || parsed.deckReveal === 'count'
            ? parsed.deckReveal
            : 'stagger',
      };
    }
  } catch {
    /* ignore */
  }
  return {...DEFAULT_PRODUCE};
}

export function savePrefs(options: ProduceOptions) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(options));
}

export function loadRewritePrefs(): RewriteOptions {
  try {
    const raw = localStorage.getItem(REWRITE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RewriteOptions>;
      const genre = REWRITE_GENRES.some((item) => item.id === parsed.genre) ? parsed.genre : DEFAULT_REWRITE.genre;
      const platform = REWRITE_PLATFORMS.some((item) => item.id === parsed.platform)
        ? parsed.platform
        : DEFAULT_REWRITE.platform;
      return {genre: genre as RewriteOptions['genre'], platform: platform as RewriteOptions['platform']};
    }
  } catch {
    /* ignore */
  }
  return {...DEFAULT_REWRITE};
}

export function saveRewritePrefs(options: RewriteOptions) {
  localStorage.setItem(REWRITE_KEY, JSON.stringify(options));
}
