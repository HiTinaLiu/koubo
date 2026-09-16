export type Slide = {
  text: string;
  title: string;
  start_ms: number;
  end_ms: number;
  index: number;
  total: number;
  highlights?: string[];
};

export type ThemeId =
  | 'slate'
  | 'education'
  | 'tech'
  | 'life'
  | 'business'
  | 'news'
  | 'paper'
  | 'neon'
  | 'ink';
export type Orientation = 'portrait' | 'landscape';

export type MotionClip = {
  id: string;
  type: string;
  content?: string;
  start: number;
  duration: number;
  params?: Record<string, unknown>;
};

export type Timeline = {
  version: number;
  width: number;
  height: number;
  fps: number;
  duration_ms: number;
  audio: string;
  topic: string;
  hook: string;
  cta: string;
  slides?: Slide[];
  orientation?: Orientation;
  theme?: ThemeId;
  watermark?: string;
  show_watermark?: boolean;
  caption_font?: 'sans' | 'serif' | 'xiaowei' | 'huangyou' | 'kuaile' | 'mashan';
  caption_box?: 'theme' | 'card' | 'bar' | 'chalk' | 'outline' | 'plain';
  caption_size?: 'sm' | 'md' | 'lg';
  hide_captions_on_cta?: boolean;
  title_end_ms?: number;
  title_font?: 'sans' | 'serif' | 'xiaowei' | 'huangyou' | 'kuaile' | 'mashan';
  title_box?: 'theme' | 'card' | 'bar' | 'chalk' | 'outline' | 'plain';
  title_size?: 'sm' | 'md' | 'lg';
  background?: string | null;
  background_kind?: 'image' | 'video' | null;
  music?: string | null;
  music_volume?: number;
  talking_head?: string | null;
  background_duration_ms?: number | null;
  theme_motion?: 'auto' | 'none' | 'pulse' | 'drift' | 'scan';
  text_motion?: 'fade' | 'pop' | 'type' | 'slide';
  show_subtitles?: boolean;
  person_mask?: 'theme' | 'cutout' | 'square' | 'chroma' | 'off';
  mask_x?: number;
  mask_y?: number;
  mask_w?: number;
  mask_h?: number;
  mask_zoom?: number;
  chroma_color?: string;
  chroma_tolerance?: number;
  subtitles?: Array<{text: string; start_ms: number; end_ms: number}>;
  clips?: MotionClip[];
  motion_pack?: 'auto' | 'knowledge' | 'news' | 'life' | 'tech' | 'education' | 'business' | 'custom';
  motion_source?: string;
  theme_tokens?: Record<string, string>;
  title_x?: number;
  title_y?: number;
  card_x?: number;
  card_y?: number;
};

export type TalkingVideoProps = {
  jobId: string;
  audioFile: string;
  timeline: Timeline;
};

export const demoTimeline: Timeline = {
  version: 1,
  width: 1080,
  height: 1920,
  fps: 30,
  duration_ms: 12000,
  audio: 'voice.mp3',
  topic: '预览模板',
  hook: '你的口播，三秒就要抓住人！',
  cta: '关注我，下条继续讲。',
  orientation: 'portrait',
  theme: 'education',
  watermark: '口播场记',
  show_watermark: true,
  hide_captions_on_cta: true,
  slides: [
    {text: '先说结论，再说方法', title: '先说结论', start_ms: 2800, end_ms: 5600, index: 1, total: 3, highlights: ['结论']},
    {text: '第二步把步骤拆开讲清楚', title: '把步骤拆开', start_ms: 5600, end_ms: 8400, index: 2, total: 3, highlights: ['步骤']},
    {text: '最后给一个明确动作', title: '给一个明确动作', start_ms: 8400, end_ms: 10800, index: 3, total: 3, highlights: ['动作']},
  ],
};
