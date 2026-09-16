export type JobStatus =
  | 'draft'
  | 'transcribing'
  | 'transcribed'
  | 'analyzing'
  | 'script_ready'
  | 'voicing'
  | 'rendering'
  | 'done'
  | 'failed';

export type Transcript = {
  text: string;
  language: string;
  duration_ms: number;
};

export type ScriptPlan = {
  angle?: string;
  audience?: string;
  hook_plan?: string;
  beats?: string[];
  cta_plan?: string;
  tone?: string;
  platform_fit?: string;
  must_keep?: string[];
  avoid?: string[];
};

export type Script = {
  topic: string;
  cleaned_transcript: string;
  hook: string;
  body: string[];
  cta: string;
  narration: string;
  keywords?: string[];
  keyword_engine?: 'llm' | 'heuristic' | 'manual';
  engine: 'llm' | 'heuristic' | 'manual';
  notes: string[];
  genre?: string;
  platform?: string;
  plan?: ScriptPlan | null;
};

export type Orientation = 'portrait' | 'landscape';
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

export type VoiceItem = {
  id: string;
  name: string;
  gender: string;
  style: string;
  engine?: 'edge' | 'spark';
  kind?: 'edge' | 'preset' | 'clone';
  source?: 'self' | 'other';
};

export type SparkStatus = {
  weights: boolean;
  torch?: boolean;
  loaded: boolean;
  error: string;
  device: string;
  note?: string;
  clone_prompt?: string;
};

export type ModelPackage = {
  id: string;
  name: string;
  summary: string;
  optional?: boolean;
  bundled?: boolean;
  size_hint?: string;
  ready: boolean;
  torch: boolean;
  installed: boolean;
  status: string;
  progress: number;
  message: string;
  dest: string;
  kind?: 'tool' | 'model';
};

export type EngineStatus = {
  packaged: boolean;
  cdn: string;
  hf_endpoint: string;
  ffmpeg: boolean;
  node: boolean;
  remotion: boolean;
  whisper: boolean;
  spark: boolean;
  torch: boolean;
  user_models: string;
  packages: ModelPackage[];
};

export type ThemeItem = {
  id: ThemeId;
  name: string;
  accent: string;
  hint?: string;
  bg?: string;
};

export type CaptionFont = 'sans' | 'serif' | 'xiaowei' | 'huangyou' | 'kuaile' | 'mashan';
export type CaptionBox = 'theme' | 'card' | 'bar' | 'chalk' | 'outline' | 'plain';
export type CaptionSize = 'sm' | 'md' | 'lg';
export type ThemeMotion = 'auto' | 'none' | 'pulse' | 'drift' | 'scan';
export type TextMotion = 'fade' | 'pop' | 'type' | 'slide';
export type PersonMask = 'theme' | 'cutout' | 'square' | 'chroma';
export type MotionPack = 'auto' | 'knowledge' | 'news' | 'life' | 'tech' | 'education' | 'business' | 'custom';
export type DeckKind =
  | 'mirror'
  | 'points'
  | 'steps'
  | 'stats'
  | 'compare'
  | 'quote'
  | 'chart'
  | 'timeline'
  | 'auto';
export type BeatKind = 'points' | 'steps' | 'stats' | 'compare' | 'quote' | 'chart' | 'timeline';

export type DeckStyle = {
  font: CaptionFont;
  box: CaptionBox;
  size: CaptionSize;
  enter: string;
  exit: string;
  reveal: string;
};

export type DeckStylePatch = Partial<DeckStyle>;

export type DeckBeat = {
  id: string;
  kind: BeatKind;
  title: string;
  points?: string[];
  stats?: string[];
  left?: string;
  right?: string;
  series?: Array<{label?: string; values?: number[]; labels?: string[]}>;
  events?: Array<{label: string; at: number; y?: number | null}>;
  lines: number[];
  enter?: string;
  exit?: string;
  reveal?: string;
  style?: DeckStylePatch | null;
  note?: string;
  background_id?: string;
};

export type VisualDeck = {
  kind: DeckKind;
  source: 'llm' | 'heuristic';
  style?: DeckStyle;
  beats: DeckBeat[];
};

export type ThemeTokensPatch = {
  bg: string;
  text: string;
  accent: string;
  captionBg?: string;
};

export type ProduceOptions = {
  voice: string;
  orientation: Orientation;
  theme: ThemeId;
  watermark: string;
  showWatermark: boolean;
  captionFont: CaptionFont;
  captionBox: CaptionBox;
  captionSize: CaptionSize;
  hideCaptionsOnCta: boolean;
  titleFont: CaptionFont;
  titleBox: CaptionBox;
  titleSize: CaptionSize;
  backgroundId: string;
  musicId: string;
  musicVolume: number;
  mode: 'tts' | 'teleprompter';
  renderPreset: 'fast' | 'standard';
  themeMotion: ThemeMotion;
  textMotion: TextMotion;
  showSubtitles: boolean;
  personMask: PersonMask;
  maskX: number;
  maskY: number;
  maskW: number;
  maskH: number;
  maskZoom: number;
  chromaColor: string;
  chromaTolerance: number;
  motionPack: MotionPack;
  lookBrief: string;
  savedLookId: string;
  titleEnter: string;
  titleExit: string;
  stepEnter: string;
  stepEnters: string[];
  stepExit: string;
  keywordFx: string;
  ctaEnter: string;
  themeTokens: ThemeTokensPatch;
  deckKind: DeckKind;
  titleX: number;
  titleY: number;
  cardX: number;
  cardY: number;
  deckReveal: string;
};

export type Job = {
  id: string;
  status: JobStatus;
  source: 'text' | 'audio';
  voice: string;
  orientation?: Orientation;
  theme?: ThemeId;
  watermark?: string;
  show_watermark?: boolean;
  caption_font?: CaptionFont;
  caption_box?: CaptionBox;
  caption_size?: CaptionSize;
  hide_captions_on_cta?: boolean;
  title_font?: CaptionFont;
  title_box?: CaptionBox;
  title_size?: CaptionSize;
  background_id?: string | null;
  music_id?: string | null;
  music_volume?: number;
  produce_mode?: 'tts' | 'teleprompter';
  render_preset?: 'fast' | 'standard';
  rewrite_genre?: string;
  rewrite_platform?: string;
  deck_kind?: DeckKind;
  error: string | null;
  created_at: string;
  updated_at: string;
  step_message: string;
  progress?: number;
  llm_configured: boolean;
};

export type RiskLevel = 'block' | 'warn';
export type ReviewVerdict = 'pass' | 'revise' | 'block';
export type ReviewPlatform = 'douyin' | 'weixin' | 'xiaohongshu';

export type RiskFinding = {
  code: string;
  level: RiskLevel;
  platforms: ReviewPlatform[];
  title: string;
  detail: string;
  suggestion: string;
};

export type PlatformPack = {
  platform: ReviewPlatform;
  title: string;
  caption: string;
  tags: string[];
  cover: string;
};

export type Review = {
  summary: string;
  score: number;
  verdict: ReviewVerdict;
  findings: RiskFinding[];
  packs: PlatformPack[];
  engine: 'llm' | 'heuristic';
  source_hash: string;
  created_at: string;
};

export type JobView = {
  job: Job;
  transcript: Transcript | null;
  script: Script | null;
  timeline: unknown;
  has_final: boolean;
  has_audio: boolean;
  has_take?: boolean;
  has_cover?: boolean;
  review?: Review | null;
  deck?: VisualDeck | null;
};

export type LibraryItem = {
  id: string;
  job_id: string | null;
  title: string;
  original: string;
  script: Script | null;
  deck?: VisualDeck | null;
  created_at: string;
  updated_at: string;
};

export type JobHistoryItem = {
  id: string;
  status: JobStatus;
  title: string;
  has_final: boolean;
  has_audio: boolean;
  has_cover?: boolean;
  source: string;
  orientation?: Orientation;
  created_at: string;
  updated_at: string;
  step_message: string;
  error: string | null;
};

export type AssetKind = 'image' | 'video' | 'music';

export type AssetItem = {
  id: string;
  name: string;
  kind: AssetKind;
  filename: string;
  size: number;
  created_at: string;
};

export type LlmProvider = {
  id: string;
  region: 'cn' | 'intl' | 'custom';
  name: string;
  hint: string;
  base_url: string;
  models: string[];
};

export type PromptItem = {
  id: string;
  name: string;
  hint?: string;
  text: string;
  default: string;
  dirty: boolean;
};

export type LlmProfile = {
  id: string;
  alias: string;
  name: string;
  provider: string;
  provider_name: string;
  base_url: string;
  model: string;
  api_key_set: boolean;
  api_key_hint: string;
  active: boolean;
};

export type SettingsView = {
  configured: boolean;
  llm: LlmProfile & {label: string};
  profiles: LlmProfile[];
  providers: LlmProvider[];
  prompts: PromptItem[];
  genres: PromptItem[];
  platforms: PromptItem[];
};
