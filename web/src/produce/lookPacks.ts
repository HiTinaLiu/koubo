import {asCssHex, THEME_TOKENS} from '../theme';
import type {CaptionBox, CaptionFont, CaptionSize, ProduceOptions, TextMotion, ThemeId, ThemeMotion} from '../types';

export type LookRecipe = {
  id: string;
  name: string;
  brief: string;
  theme: ThemeId;
  themeMotion: ThemeMotion;
  textMotion: TextMotion;
  titleFont: CaptionFont;
  titleBox: CaptionBox;
  titleSize: CaptionSize;
  captionFont: CaptionFont;
  captionBox: CaptionBox;
  captionSize: CaptionSize;
  hideCaptionsOnCta: boolean;
  titleEnter: string;
  titleExit: string;
  stepEnters: string[];
  stepExit: string;
  keywordFx: string;
  ctaEnter: string;
  deckReveal?: string;
  themeTokens?: {bg: string; text: string; accent: string; captionBg?: string};
};

export const BUILTIN_LOOKS: LookRecipe[] = [
  {
    id: 'knowledge',
    name: '知识干货',
    brief: '黑金干货口播：结论和重点词从画面中间弹出，步骤卡干脆利落，不要全程字幕。',
    theme: 'slate',
    themeMotion: 'pulse',
    textMotion: 'pop',
    titleEnter: 'scale_in',
    titleExit: 'fade_out',
    stepEnters: ['spring_pop', 'bounce', 'scale_in'],
    stepExit: 'fade_out',
    keywordFx: 'keyword_pop',
    ctaEnter: 'slide_up',
    deckReveal: 'stagger',
    titleFont: 'sans',
    titleBox: 'outline',
    titleSize: 'lg',
    captionFont: 'sans',
    captionBox: 'card',
    captionSize: 'md',
    hideCaptionsOnCta: true,
  },
  {
    id: 'news',
    name: '资讯快报',
    brief: '像新闻直播：浅底红条，标题和步骤从左侧滑入，口播全程叠字幕。',
    theme: 'news',
    themeMotion: 'scan',
    textMotion: 'slide',
    titleEnter: 'slide_left',
    titleExit: 'slide_left',
    stepEnters: ['slide_left', 'slide_up'],
    stepExit: 'fade_out',
    keywordFx: 'keyword_pop',
    ctaEnter: 'slide_up',
    deckReveal: 'stagger',
    titleFont: 'sans',
    titleBox: 'bar',
    titleSize: 'md',
    captionFont: 'sans',
    captionBox: 'bar',
    captionSize: 'md',
    hideCaptionsOnCta: true,
  },
  {
    id: 'life',
    name: '轻松生活',
    brief: '生活号暖色：柔光慢慢铺开，文字淡入，轻松不抢人，少字幕。',
    theme: 'life',
    themeMotion: 'drift',
    textMotion: 'fade',
    titleEnter: 'fade_in',
    titleExit: 'fade_out',
    stepEnters: ['fade_in', 'blur_reveal'],
    stepExit: 'fade_out',
    keywordFx: 'keyword_pulse',
    ctaEnter: 'fade_in',
    titleFont: 'kuaile',
    titleBox: 'plain',
    titleSize: 'lg',
    captionFont: 'sans',
    captionBox: 'card',
    captionSize: 'md',
    hideCaptionsOnCta: true,
  },
  {
    id: 'tech',
    name: '科技感',
    brief: '深空青光科技风：扫描线扫过画面，关键词弹出，标题描边大字。',
    theme: 'tech',
    themeMotion: 'scan',
    textMotion: 'pop',
    titleEnter: 'glitch_text',
    titleExit: 'fade_out',
    stepEnters: ['spring_pop', 'slide_right', 'glitch_text'],
    stepExit: 'scale_out',
    keywordFx: 'keyword_pulse',
    ctaEnter: 'scale_in',
    titleFont: 'sans',
    titleBox: 'outline',
    titleSize: 'lg',
    captionFont: 'sans',
    captionBox: 'card',
    captionSize: 'md',
    hideCaptionsOnCta: true,
  },
  {
    id: 'education',
    name: '课堂板书',
    brief: '黑板粉笔课：主题词像板书打出来，步骤卡粉笔底，适合讲方法和概念。',
    theme: 'education',
    themeMotion: 'drift',
    textMotion: 'type',
    titleEnter: 'typewriter',
    titleExit: 'fade_out',
    stepEnters: ['char_reveal', 'typewriter', 'underline_reveal'],
    stepExit: 'fade_out',
    keywordFx: 'keyword_pop',
    ctaEnter: 'slide_up',
    deckReveal: 'stagger',
    titleFont: 'xiaowei',
    titleBox: 'chalk',
    titleSize: 'lg',
    captionFont: 'xiaowei',
    captionBox: 'chalk',
    captionSize: 'md',
    hideCaptionsOnCta: true,
  },
  {
    id: 'business',
    name: '商务金',
    brief: '海军金商务风：沉稳淡入，少动效噱头，适合公司和职场口播。',
    theme: 'business',
    themeMotion: 'pulse',
    textMotion: 'fade',
    titleEnter: 'fade_in',
    titleExit: 'fade_out',
    stepEnters: ['fade_in', 'slide_up'],
    stepExit: 'fade_out',
    keywordFx: 'keyword_pop',
    ctaEnter: 'slide_up',
    deckReveal: 'stagger',
    titleFont: 'serif',
    titleBox: 'card',
    titleSize: 'md',
    captionFont: 'serif',
    captionBox: 'card',
    captionSize: 'md',
    hideCaptionsOnCta: true,
  },
];

export const LOOK_SAMPLES = BUILTIN_LOOKS.map((item) => item.brief);

export function builtinLook(id: string) {
  return BUILTIN_LOOKS.find((item) => item.id === id) || null;
}

function recipeTokens(recipe: LookRecipe) {
  const preset = THEME_TOKENS[recipe.theme] || THEME_TOKENS.slate;
  const presetCard = asCssHex(preset.captionBg, lumaGuess(preset.bg) ? '#111111' : '#ffffff');
  return {
    bg: asCssHex(recipe.themeTokens?.bg, preset.bg),
    text: asCssHex(recipe.themeTokens?.text, preset.text),
    accent: asCssHex(recipe.themeTokens?.accent, preset.accent),
    captionBg: asCssHex(recipe.themeTokens?.captionBg, presetCard),
  };
}

function lumaGuess(bg: string) {
  const hex = asCssHex(bg, '#0a0a0a').slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.55;
}

export function applyLook(
  options: ProduceOptions,
  recipe: LookRecipe,
  packId: ProduceOptions['motionPack'],
  brief?: string,
): ProduceOptions {
  return {
    ...options,
    lookBrief: brief !== undefined ? brief : recipe.brief,
    motionPack: packId,
    savedLookId: packId === 'custom' ? options.savedLookId : '',
    theme: recipe.theme,
    themeMotion: recipe.themeMotion,
    textMotion: recipe.textMotion,
    titleEnter: recipe.titleEnter,
    titleExit: recipe.titleExit,
    stepEnter: recipe.stepEnters[0] || 'spring_pop',
    stepEnters: recipe.stepEnters.length ? recipe.stepEnters : ['spring_pop'],
    stepExit: recipe.stepExit,
    keywordFx: recipe.keywordFx,
    ctaEnter: recipe.ctaEnter,
    deckReveal: recipe.deckReveal || 'stagger',
    themeTokens: recipeTokens(recipe),
    titleFont: recipe.titleFont,
    titleBox: recipe.titleBox,
    titleSize: recipe.titleSize,
    captionFont: recipe.captionFont,
    captionBox: recipe.captionBox,
    captionSize: recipe.captionSize,
    hideCaptionsOnCta: recipe.hideCaptionsOnCta,
  };
}

export function produceToLook(options: ProduceOptions, name: string, id: string): LookRecipe {
  return {
    id,
    name: name.trim() || '我的搭配',
    brief: options.lookBrief.trim() || name.trim() || '自定义成片搭配',
    theme: options.theme,
    themeMotion: options.themeMotion,
    textMotion: options.textMotion,
    titleEnter: options.titleEnter,
    titleExit: options.titleExit,
    stepEnters: options.stepEnters?.length ? options.stepEnters : [options.stepEnter],
    stepExit: options.stepExit,
    keywordFx: options.keywordFx,
    ctaEnter: options.ctaEnter,
    deckReveal: options.deckReveal,
    titleFont: options.titleFont,
    titleBox: options.titleBox,
    titleSize: options.titleSize,
    captionFont: options.captionFont,
    captionBox: options.captionBox,
    captionSize: options.captionSize,
    hideCaptionsOnCta: options.hideCaptionsOnCta,
    themeTokens: {
      bg: asCssHex(options.themeTokens.bg, THEME_TOKENS.slate.bg),
      text: asCssHex(options.themeTokens.text, THEME_TOKENS.slate.text),
      accent: asCssHex(options.themeTokens.accent, THEME_TOKENS.slate.accent),
      captionBg: asCssHex(options.themeTokens.captionBg, THEME_TOKENS.slate.bg),
    },
  };
}

export function matchLookByBrief(brief: string) {
  const text = brief.trim();
  if (!text) return builtinLook('knowledge');
  const exact = BUILTIN_LOOKS.find((item) => item.brief === text);
  if (exact) return exact;
  const scored = BUILTIN_LOOKS.map((item) => {
    const hay = `${item.name} ${item.brief} ${item.theme}`;
    let score = 0;
    for (const token of ['新闻', '资讯', '字幕', '红', '科技', '青', '扫描', '黑板', '粉笔', '课堂', '商务', '职场', '生活', '暖', '干货', '弹出', '金']) {
      if (text.includes(token) && hay.includes(token)) score += 2;
    }
    if (text.includes(item.name)) score += 5;
    return {item, score};
  }).sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score > 0 ? scored[0].item : BUILTIN_LOOKS[0];
}

const MOTIONS: ThemeMotion[] = ['auto', 'none', 'pulse', 'drift', 'scan'];
const FONTS: CaptionFont[] = ['sans', 'serif', 'xiaowei', 'huangyou', 'kuaile', 'mashan'];
const BOXES: CaptionBox[] = ['theme', 'card', 'bar', 'chalk', 'outline', 'plain'];
const SIZES: CaptionSize[] = ['sm', 'md', 'lg'];

function pick<T extends string>(value: string, allowed: T[], fallback: T): T {
  return (allowed as string[]).includes(value) ? (value as T) : fallback;
}

export function applyServerLook(options: ProduceOptions, look: Record<string, unknown>): ProduceOptions {
  const rawTokens = (look.tokens && typeof look.tokens === 'object'
    ? look.tokens
    : look.theme_tokens && typeof look.theme_tokens === 'object'
      ? look.theme_tokens
      : {}) as Record<string, string>;
  const steps = Array.isArray(look.step_enters) ? look.step_enters.map(String).filter(Boolean) : [];
  const deckStyle =
    look.deck_style && typeof look.deck_style === 'object' ? (look.deck_style as Record<string, string>) : {};
  const reveal = String(deckStyle.reveal || '');
  return {
    ...options,
    motionPack: 'custom',
    savedLookId: '',
    theme: 'slate',
    themeMotion: pick(String(look.theme_motion || ''), MOTIONS, options.themeMotion),
    titleEnter: String(look.title_enter || options.titleEnter),
    titleExit: String(look.title_exit || options.titleExit),
    stepEnters: steps.length ? steps : [options.stepEnter],
    stepEnter: (steps[0] || options.stepEnter),
    stepExit: String(look.step_exit || options.stepExit),
    keywordFx: String(look.keyword_fx || options.keywordFx),
    ctaEnter: String(look.cta_enter || options.ctaEnter),
    deckReveal: reveal === 'fade' || reveal === 'draw' || reveal === 'count' ? reveal : 'stagger',
    themeTokens: {
      bg: asCssHex(rawTokens.bg || rawTokens.background, options.themeTokens.bg),
      text: asCssHex(rawTokens.text || rawTokens.text_color, options.themeTokens.text),
      accent: asCssHex(rawTokens.accent || rawTokens.accent_color, options.themeTokens.accent),
      captionBg: asCssHex(rawTokens.captionBg || rawTokens.caption_bg, options.themeTokens.captionBg || options.themeTokens.bg),
    },
    titleFont: pick(String(look.title_font || ''), FONTS, options.titleFont),
    titleBox: pick(String(look.title_box || ''), BOXES, options.titleBox),
    titleSize: pick(String(look.title_size || ''), SIZES, options.titleSize),
    captionFont: pick(String(deckStyle.font || look.caption_font || ''), FONTS, options.captionFont),
    captionBox: pick(String(deckStyle.box || look.caption_box || ''), BOXES, options.captionBox),
    captionSize: pick(String(deckStyle.size || look.caption_size || ''), SIZES, options.captionSize),
    hideCaptionsOnCta: typeof look.hide_captions_on_cta === 'boolean' ? look.hide_captions_on_cta : options.hideCaptionsOnCta,
  };
}
