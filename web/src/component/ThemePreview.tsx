import {useRef} from 'react';
import {assetFileUrl} from '../api';
import {
  captionBoxLabel,
  captionBodyScale,
  captionFontFamily,
  captionFontName,
  captionScale,
  captionSizeName,
  captionVisualStyle,
  captionInk,
  CAPTION_SIZES,
  resolveCaptionBox,
} from '../captionStyle';
import {isRectPersonFrame, usesPersonFrame} from '../produce/mask';
import {EllipseCutout} from './EllipseCutout';
import {padIndex, slideHighlights, slideLines, slideTitle} from '../slides';
import {tokensForProduce} from '../theme';
import type {AssetItem, CaptionSize, DeckBeat, DeckStyle, ProduceOptions} from '../types';

function clampPct(value: number) {
  return Math.max(8, Math.min(92, Math.round(value * 10) / 10));
}

function DeckPreviewBody({
  beat,
  accent,
  ctaText,
  text,
  bodySize,
}: {
  beat?: DeckBeat | null;
  accent: string;
  ctaText: string;
  text: string;
  bodySize: string;
}) {
  if (!beat) return null;
  if (beat.kind === 'quote') {
    return <p className="preview-deck-quote">「{beat.title}」</p>;
  }
  if (beat.kind === 'compare') {
    return (
      <div className="preview-deck-compare" style={{fontSize: bodySize}}>
        <div>
          <strong>{beat.left || beat.points?.[0] || ''}</strong>
        </div>
        <div>
          <strong>{beat.right || beat.points?.[1] || ''}</strong>
        </div>
      </div>
    );
  }
  if (beat.kind === 'stats') {
    const items = beat.stats?.length ? beat.stats : beat.points || [];
    return (
      <div className="preview-deck-stats" style={{fontSize: bodySize}}>
        {items.slice(0, 4).map((item) => (
          <em key={item} style={{background: accent, color: ctaText}}>
            {item}
          </em>
        ))}
      </div>
    );
  }
  if (beat.kind === 'chart') {
    const values = beat.series?.[0]?.values || [18, 28, 22, 36];
    const max = Math.max(...values, 1);
    const pts = values
      .map((value, index) => {
        const x = 8 + (index / Math.max(values.length - 1, 1)) * 84;
        const y = 36 - (value / max) * 26;
        return `${x},${y}`;
      })
      .join(' ');
    return (
      <svg className="preview-deck-spark" viewBox="0 0 100 40" preserveAspectRatio="none">
        <polyline fill="none" stroke={accent} strokeWidth="3" points={pts} />
      </svg>
    );
  }
  if (beat.kind === 'timeline') {
    const events = beat.events?.length ? beat.events : (beat.points || []).map((label, index, all) => ({label, at: all.length > 1 ? index / (all.length - 1) : 0.5}));
    return (
      <div className="preview-deck-time">
        <i style={{background: accent}} />
        {events.slice(0, 4).map((item) => (
          <span key={`${item.label}-${item.at}`}>
            <b style={{background: accent}} />
            {item.label}
          </span>
        ))}
      </div>
    );
  }
  const items = beat.points || [];
  if (!items.length) return null;
  return (
    <ol className="preview-deck-list" style={{fontSize: bodySize}}>
      {items.slice(0, 4).map((item, index) => (
        <li key={`${item}-${index}`}>
          <em style={{color: accent}}>{beat.kind === 'steps' ? String(index + 1).padStart(2, '0') : '•'}</em>
          <span style={{color: text}}>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function beatLook(options: ProduceOptions, deckStyle?: DeckStyle | null, beat?: DeckBeat | null): DeckStyle {
  const base: DeckStyle = {
    font: deckStyle?.font || options.captionFont,
    box: deckStyle?.box || options.captionBox,
    size: deckStyle?.size || options.captionSize,
    enter: deckStyle?.enter || options.stepEnter,
    exit: deckStyle?.exit || options.stepExit,
    reveal: deckStyle?.reveal || options.deckReveal || 'stagger',
  };
  return {
    font: beat?.style?.font || base.font,
    box: beat?.style?.box || base.box,
    size: beat?.style?.size || base.size,
    enter: beat?.style?.enter || base.enter,
    exit: beat?.style?.exit || base.exit,
    reveal: beat?.style?.reveal || beat?.reveal || base.reveal,
  };
}

export function ThemePreview({
  options,
  hook,
  topic,
  bodyLines,
  highlights,
  background,
  takeUrl,
  disabled,
  onChange,
  deckBeat,
  deckStyle,
  deckIndex,
  deckTotal,
  onDeckSize,
}: {
  options: ProduceOptions;
  hook: string;
  topic: string;
  bodyLines?: string[];
  highlights?: string[];
  background?: AssetItem | null;
  takeUrl?: string;
  disabled?: boolean;
  onChange?: (next: ProduceOptions) => void;
  deckBeat?: DeckBeat | null;
  deckStyle?: DeckStyle | null;
  deckIndex?: number;
  deckTotal?: number;
  onDeckSize?: (size: CaptionSize) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const theme = tokensForProduce(options);
  const portrait = options.orientation === 'portrait';
  const look = beatLook(options, deckStyle, deckBeat);
  const captionStyle = resolveCaptionBox(look.box, theme.captionStyle);
  const ink = captionInk(captionStyle, theme);
  const captionFamily = captionFontFamily(look.font);
  const scale = captionScale(look.size);
  const bodyScale = captionBodyScale(look.size);
  const quotePage = deckBeat?.kind === 'quote';
  const cardType = `calc(${(quotePage ? 48 : 40) * scale} * min(1cqw, 1cqh) / 10.8)`;
  const bodyType = `calc(${(quotePage ? 48 : 40) * bodyScale} * min(1cqw, 1cqh) / 10.8)`;
  const titleStyle = resolveCaptionBox(options.titleBox, theme.captionStyle);
  const titleFamily = captionFontFamily(options.titleFont);
  const titleScale = captionScale(options.titleSize);
  const titleText = topic || hook || '主题词';
  const lines = slideLines(hook, bodyLines);
  const slideLine = lines[0] || '先说结论再说方法';
  const slideHead = slideTitle(slideLine);
  const slideKeys = slideHighlights(slideLine, highlights);
  const slideTotal = Math.max(deckTotal || lines.length, 1);
  const pageIndex = Math.max(1, (deckIndex ?? 0) + 1);
  const packMotion =
    options.themeMotion === 'none'
      ? 'none'
      : options.themeMotion === 'auto'
        ? options.theme === 'news'
          ? 'scan'
          : options.theme === 'life' || options.theme === 'education'
            ? 'drift'
            : options.theme === 'tech'
              ? 'scan'
              : 'pulse'
        : options.themeMotion;
  const motionClass = packMotion === 'auto' ? 'pulse' : packMotion;
  const showPersonMask = takeUrl !== undefined && usesPersonFrame(options.personMask);
  const titleX = options.titleX ?? 50;
  const titleY = options.titleY ?? 24;
  const cardX = options.cardX ?? 50;
  const cardY = options.cardY ?? 72;

  function dragLayer(which: 'title' | 'card') {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || !onChange || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const frame = frameRef.current;
      if (!frame) return;
      const pointer = event.pointerId;
      event.currentTarget.setPointerCapture(pointer);
      const move = (next: PointerEvent) => {
        const box = frame.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const x = clampPct(((next.clientX - box.left) / box.width) * 100);
        const y = clampPct(((next.clientY - box.top) / box.height) * 100);
        if (which === 'title') onChange({...optionsRef.current, titleX: x, titleY: y});
        else onChange({...optionsRef.current, cardX: x, cardY: y});
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  }

  return (
    <div id="produce-preview" className={`preview-stage ${options.orientation}`}>
      <div
        ref={frameRef}
        key={`${theme.bg}-${theme.text}-${theme.accent}-${motionClass}-${look.font}-${look.box}-${look.size}-${deckBeat?.id || ''}-${deckBeat?.background_id || ''}-${background?.id || ''}-${options.savedLookId}`}
        className={`preview-frame motion-${motionClass}${showPersonMask ? ' has-cutout' : ''}`}
        style={{
          background: `${theme.glow}, ${theme.bg}`,
          color: theme.text,
          borderColor: theme.accent,
        }}
      >
        {background?.kind === 'image' ? (
          <div className="preview-media" style={{backgroundImage: `url(${assetFileUrl(background.id)})`}} />
        ) : null}
        {background?.kind === 'video' ? (
          <video className="preview-media" src={assetFileUrl(background.id)} muted loop playsInline />
        ) : null}
        {background ? (
          <div className="preview-scrim" style={showPersonMask ? {background: 'rgba(0,0,0,0.16)'} : undefined} />
        ) : null}
        {showPersonMask ? (
          onChange ? (
            <EllipseCutout options={options} takeUrl={takeUrl} disabled={disabled} onChange={onChange} />
          ) : (
            <div className={`preview-person-mask${isRectPersonFrame(options.personMask) ? ' is-square' : ''}`} />
          )
        ) : null}
        {options.showWatermark ? (
          <div
            className="preview-mark"
            style={{
              color: theme.captionStyle === 'bar' ? '#fff' : theme.accent,
              background: theme.markBg,
              borderColor: theme.accent,
            }}
          >
            {options.watermark || '口播场记'}
          </div>
        ) : null}
        <div className="preview-step-index" style={{background: theme.accent, color: theme.ctaText}}>
          {padIndex(pageIndex)} / {padIndex(slideTotal)}
        </div>
        <div
          className={`preview-hook${onChange && !disabled ? ' is-draggable' : ''}`}
          onPointerDown={dragLayer('title')}
          style={{
            ...captionVisualStyle(titleStyle, theme, titleFamily, 16 * titleScale),
            fontSize: `calc(${86 * titleScale} * min(1cqw, 1cqh) / 10.8)`,
            opacity: 0.35,
            left: `${titleX}%`,
            top: `${titleY}%`,
            right: 'auto',
            width: '85%',
            transform: 'translate(-50%, 0)',
          }}
        >
          <i style={{background: theme.accent}} />
          <strong style={{fontFamily: titleFamily}}>{titleText}</strong>
        </div>
        <div
          className={`preview-slide ${captionStyle}${onChange && !disabled ? ' is-draggable' : ''}`}
          onPointerDown={dragLayer('card')}
          style={{
            ...captionVisualStyle(captionStyle, theme, captionFamily, 15 * scale),
            fontSize: cardType,
            left: `${cardX}%`,
            top: `${cardY}%`,
            right: 'auto',
            bottom: 'auto',
            width: '85%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <strong>{quotePage ? '' : deckBeat?.title || slideHead}</strong>
          {deckBeat ? (
            <DeckPreviewBody
              beat={deckBeat}
              accent={theme.accent}
              ctaText={theme.ctaText}
              text={ink}
              bodySize={bodyType}
            />
          ) : slideKeys.length ? (
            <div className="preview-slide-keys">
              {slideKeys.map((item) => (
                <em key={item} style={{background: theme.accent, color: theme.ctaText}}>
                  {item}
                </em>
              ))}
            </div>
          ) : (
            <div className="preview-slide-keys">
              <em style={{background: theme.accent, color: theme.ctaText}}>{slideLine}</em>
            </div>
          )}
          {quotePage && onDeckSize && !disabled ? (
            <div
              className="preview-size-chips"
              onPointerDown={(event) => event.stopPropagation()}
            >
              {CAPTION_SIZES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={look.size === item.id ? 'on' : ''}
                  onClick={() => onDeckSize(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="preview-bar" style={{background: theme.line}}>
          <span style={{background: theme.accent, width: portrait ? '38%' : '52%'}} />
        </div>
        {options.showSubtitles ? (
          <div className="preview-subtitles">{hook || topic || '字幕按朗读稿逐句出现'}</div>
        ) : null}
      </div>
      <p className="preview-caption-meta">
        主图 {captionFontName(options.titleFont)} · {captionBoxLabel(titleStyle)} · {captionSizeName(options.titleSize)}
        {` ｜ 第 ${pageIndex} 页 ${captionFontName(look.font)} · ${captionBoxLabel(captionStyle)} · ${captionSizeName(look.size)}`}
        {onChange ? ' ｜ 拖主题词或展示卡改位置' : ''}
        {showPersonMask
          ? isRectPersonFrame(options.personMask)
            ? ' ｜ 拖方框改选框，滚轮或滑条放大缩小框里的人像'
            : ' ｜ 拖椭圆改选框，滚轮或滑条放大缩小椭圆里的人像'
          : ''}
      </p>
    </div>
  );
}
