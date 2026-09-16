from __future__ import annotations

from pydantic import BaseModel, Field

from backend.schemas import (
    CaptionBox,
    CaptionFont,
    CaptionSize,
    MotionPack,
    Orientation,
    PersonMask,
    RenderPreset,
    Script,
    TextMotion,
    ThemeId,
    ThemeMotion,
    VisualDeck,
)


class TextJobBody(BaseModel):
    text: str
    voice: str | None = None


class TranscriptPatch(BaseModel):
    text: str


class ScriptPatch(BaseModel):
    topic: str | None = None
    hook: str | None = None
    body: list[str] | None = None
    cta: str | None = None
    narration: str | None = None
    cleaned_transcript: str | None = None
    keywords: list[str] | None = None


class LibraryPatch(BaseModel):
    title: str | None = None
    original: str | None = None
    narration: str | None = None
    script: Script | None = None
    deck: VisualDeck | None = None


class LibraryBatchDelete(BaseModel):
    ids: list[str]


class JobBatchDelete(BaseModel):
    ids: list[str]


class LookPlanRequest(BaseModel):
    brief: str = ""


class DeckPlanRequest(BaseModel):
    kind: str = "mirror"


class DeckStyleRequest(BaseModel):
    brief: str = ""



class AnalyzeRequest(BaseModel):
    genre: str = "knowledge"
    platform: str = "douyin"


class SettingsSaveBody(BaseModel):
    llm: dict | None = None
    prompts: dict | None = None
    genres: dict | None = None
    platforms: dict | None = None


class SettingsResetBody(BaseModel):
    scope: str = "all"


class SettingsTestBody(BaseModel):
    provider: str | None = None
    base_url: str | None = None
    model: str | None = None
    api_key: str | None = None


class SettingsActivateBody(BaseModel):
    id: str


class RenderRequest(BaseModel):
    voice: str | None = None
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
    produce_mode: str = "tts"
    render_preset: RenderPreset = "standard"
    audio_only: bool = False
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
