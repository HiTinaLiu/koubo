from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

JobStatus = Literal[
    "draft",
    "transcribing",
    "transcribed",
    "analyzing",
    "script_ready",
    "voicing",
    "rendering",
    "done",
    "failed",
]

WORKING_STATUSES = {"transcribing", "analyzing", "voicing", "rendering"}


class WordStamp(BaseModel):
    text: str
    start_ms: int
    end_ms: int


class Transcript(BaseModel):
    text: str
    language: str = "zh"
    duration_ms: int = 0
    words: list[WordStamp] = Field(default_factory=list)
    segments: list[WordStamp] = Field(default_factory=list)


class ScriptPlan(BaseModel):
    angle: str = ""
    audience: str = ""
    hook_plan: str = ""
    beats: list[str] = Field(default_factory=list)
    cta_plan: str = ""
    tone: str = ""
    platform_fit: str = ""
    must_keep: list[str] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list)


class Script(BaseModel):
    topic: str
    cleaned_transcript: str
    hook: str
    body: list[str]
    cta: str
    narration: str
    keywords: list[str] = Field(default_factory=list)
    keyword_engine: Literal["llm", "heuristic", "manual"] = "heuristic"
    engine: Literal["llm", "heuristic", "manual"] = "llm"
    notes: list[str] = Field(default_factory=list)
    genre: str = ""
    platform: str = ""
    plan: ScriptPlan | None = None


class Slide(BaseModel):
    text: str
    title: str
    start_ms: int
    end_ms: int
    index: int
    total: int
    highlights: list[str] = Field(default_factory=list)


CaptionFont = Literal["sans", "serif", "xiaowei", "huangyou", "kuaile", "mashan"]
CaptionBox = Literal["theme", "card", "bar", "chalk", "outline", "plain"]
CaptionSize = Literal["sm", "md", "lg"]

DeckKind = Literal[
    "mirror",
    "points",
    "steps",
    "stats",
    "compare",
    "quote",
    "chart",
    "timeline",
    "auto",
]
BeatKind = Literal[
    "points",
    "steps",
    "stats",
    "compare",
    "quote",
    "chart",
    "timeline",
    "ppt",
    "line_chart",
    "timeline_chart",
]


class ChartSeries(BaseModel):
    label: str = "数据"
    values: list[float] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)


class DeckEvent(BaseModel):
    label: str
    at: float = 0
    y: float | None = None


class DeckStyle(BaseModel):
    font: CaptionFont = "sans"
    box: CaptionBox = "card"
    size: CaptionSize = "md"
    enter: str = "slide_up"
    exit: str = "fade_out"
    reveal: str = "stagger"


class DeckStylePatch(BaseModel):
    font: CaptionFont | None = None
    box: CaptionBox | None = None
    size: CaptionSize | None = None
    enter: str | None = None
    exit: str | None = None
    reveal: str | None = None


class DeckBeat(BaseModel):
    id: str
    kind: BeatKind = "points"
    title: str = ""
    points: list[str] = Field(default_factory=list)
    stats: list[str] = Field(default_factory=list)
    left: str = ""
    right: str = ""
    series: list[ChartSeries] = Field(default_factory=list)
    events: list[DeckEvent] = Field(default_factory=list)
    lines: list[int] = Field(default_factory=list)
    enter: str = "slide_up"
    exit: str = "fade_out"
    reveal: str = "stagger"
    style: DeckStylePatch | None = None
    note: str = ""
    background_id: str = ""


class VisualDeck(BaseModel):
    kind: str = "mirror"
    source: Literal["llm", "heuristic"] = "heuristic"
    style: DeckStyle = Field(default_factory=DeckStyle)
    beats: list[DeckBeat] = Field(default_factory=list)


Orientation = Literal["portrait", "landscape"]
RenderPreset = Literal["fast", "standard"]
ThemeMotion = Literal["auto", "none", "pulse", "drift", "scan"]
TextMotion = Literal["fade", "pop", "type", "slide"]
PersonMask = Literal["off", "theme", "cutout", "square", "chroma"]
ThemeId = Literal["slate", "education", "tech", "life", "business", "news", "paper", "neon", "ink"]
MotionPack = Literal["auto", "knowledge", "news", "life", "tech", "education", "business", "custom"]


class SubtitleCue(BaseModel):
    text: str
    start_ms: int
    end_ms: int


class MotionClip(BaseModel):
    id: str
    type: str
    content: str = ""
    start: float = 0
    duration: float = 0.8
    params: dict = Field(default_factory=dict)


class Timeline(BaseModel):
    version: int = 1
    width: int = 1080
    height: int = 1920
    fps: int = 30
    duration_ms: int
    audio: str
    topic: str
    hook: str
    cta: str
    slides: list[Slide] = Field(default_factory=list)
    orientation: Orientation = "portrait"
    theme: ThemeId = "slate"
    watermark: str = "口播场记"
    show_watermark: bool = True
    caption_font: CaptionFont = "sans"
    caption_box: CaptionBox = "theme"
    caption_size: CaptionSize = "md"
    hide_captions_on_cta: bool = True
    title_end_ms: int = 0
    title_font: CaptionFont = "sans"
    title_box: CaptionBox = "outline"
    title_size: CaptionSize = "lg"
    background: str | None = None
    background_kind: Literal["image", "video"] | None = None
    music: str | None = None
    music_volume: float = 0.16
    talking_head: str | None = None
    background_duration_ms: int | None = None
    theme_motion: ThemeMotion = "auto"
    text_motion: TextMotion = "pop"
    show_subtitles: bool = False
    person_mask: PersonMask = "square"
    mask_x: float = 0.5
    mask_y: float = 0.47
    mask_w: float = 0.64
    mask_h: float = 0.72
    mask_zoom: float = 1.0
    chroma_color: str = "#2ecc40"
    chroma_tolerance: float = 0.18
    subtitles: list[SubtitleCue] = Field(default_factory=list)
    clips: list[MotionClip] = Field(default_factory=list)
    motion_pack: MotionPack = "auto"
    motion_source: str = "pack"
    theme_tokens: dict[str, str] = Field(default_factory=dict)
    title_enter: str = "scale_in"
    title_exit: str = "fade_out"
    step_enters: list[str] = Field(default_factory=lambda: ["spring_pop"])
    step_exit: str = "fade_out"
    keyword_fx: str = "keyword_pop"
    cta_enter: str = "slide_up"
    deck: VisualDeck | None = None
    title_x: float = 50
    title_y: float = 24
    card_x: float = 50
    card_y: float = 72
    background_asset_id: str = ""
    page_bgs: dict[str, dict] = Field(default_factory=dict)


class Job(BaseModel):
    id: str
    status: JobStatus = "draft"
    source: Literal["text", "audio"] = "text"
    voice: str
    orientation: Orientation = "portrait"
    theme: ThemeId = "slate"
    watermark: str = "口播场记"
    show_watermark: bool = True
    caption_font: CaptionFont = "sans"
    caption_box: CaptionBox = "theme"
    caption_size: CaptionSize = "md"
    hide_captions_on_cta: bool = True
    title_font: CaptionFont = "sans"
    title_box: CaptionBox = "outline"
    title_size: CaptionSize = "lg"
    background_id: str | None = None
    music_id: str | None = None
    music_volume: float = 0.16
    produce_mode: Literal["tts", "teleprompter"] = "tts"
    render_preset: RenderPreset = "standard"
    theme_motion: ThemeMotion = "auto"
    text_motion: TextMotion = "pop"
    show_subtitles: bool = False
    person_mask: PersonMask = "square"
    mask_x: float = 0.5
    mask_y: float = 0.47
    mask_w: float = 0.64
    mask_h: float = 0.72
    mask_zoom: float = 1.0
    chroma_color: str = "#2ecc40"
    chroma_tolerance: float = 0.18
    motion_pack: MotionPack = "auto"
    look_brief: str = ""
    theme_tokens: dict[str, str] = Field(default_factory=dict)
    title_enter: str = "scale_in"
    title_exit: str = "fade_out"
    step_enters: list[str] = Field(default_factory=lambda: ["spring_pop"])
    step_exit: str = "fade_out"
    keyword_fx: str = "keyword_pop"
    cta_enter: str = "slide_up"
    deck_kind: str = "mirror"
    title_x: float = 50
    title_y: float = 24
    card_x: float = 50
    card_y: float = 72
    rewrite_genre: str = "knowledge"
    rewrite_platform: str = "douyin"
    error: str | None = None
    created_at: str
    updated_at: str
    step_message: str = ""
    progress: int = 0
    llm_configured: bool = False


class JobHistoryItem(BaseModel):
    id: str
    status: JobStatus
    title: str
    has_final: bool
    has_audio: bool
    has_cover: bool = False
    source: str
    orientation: Orientation = "portrait"
    created_at: str
    updated_at: str
    step_message: str = ""
    error: str | None = None


class Asset(BaseModel):
    id: str
    name: str
    kind: Literal["image", "video", "music"]
    filename: str
    size: int = 0
    created_at: str


class LibraryItem(BaseModel):
    id: str
    job_id: str | None = None
    title: str
    original: str
    script: Script | None = None
    deck: VisualDeck | None = None
    created_at: str
    updated_at: str


class RiskFinding(BaseModel):
    code: str
    level: Literal["block", "warn"]
    platforms: list[Literal["douyin", "weixin", "xiaohongshu"]] = Field(default_factory=list)
    title: str
    detail: str = ""
    suggestion: str = ""


class PlatformPack(BaseModel):
    platform: Literal["douyin", "weixin", "xiaohongshu"]
    title: str
    caption: str
    tags: list[str] = Field(default_factory=list)
    cover: str = ""


class Review(BaseModel):
    summary: str
    score: int = 100
    verdict: Literal["pass", "revise", "block"] = "pass"
    findings: list[RiskFinding] = Field(default_factory=list)
    packs: list[PlatformPack] = Field(default_factory=list)
    engine: Literal["llm", "heuristic"] = "heuristic"
    source_hash: str = ""
    created_at: str


class JobView(BaseModel):
    job: Job
    transcript: Transcript | None = None
    script: Script | None = None
    timeline: Timeline | None = None
    has_final: bool = False
    has_audio: bool = False
    has_take: bool = False
    has_cover: bool = False
    review: Review | None = None
    deck: VisualDeck | None = None
