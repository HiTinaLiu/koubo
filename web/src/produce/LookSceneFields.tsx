import {useMemo, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {assetFileUrl, planLook} from '../api';
import {CAPTION_BOXES, CAPTION_FONTS, CAPTION_SIZES} from '../captionStyle';
import {FieldSelect} from '../component/FieldSelect';
import {applyLook, applyServerLook, BUILTIN_LOOKS, LOOK_SAMPLES, matchLookByBrief} from './lookPacks';
import {ENTER_FX_OPTIONS, EXIT_FX_OPTIONS, KEYWORD_FX_OPTIONS, REVEAL_OPTIONS, THEME_MOTION_OPTIONS} from './options';
import {deleteSavedLook, loadSavedLooks, saveCurrentLook} from './savedLooks';
import type {AssetItem, MotionPack, ProduceOptions, ThemeMotion, VisualDeck} from '../types';

const BG_AUDIO = '__bg_audio__';

export function LookSceneFields({
  options,
  disabled,
  jobId,
  assets,
  onChange,
  onOpenAssets,
  onDeck,
  deck,
}: {
  options: ProduceOptions;
  disabled: boolean;
  jobId?: string;
  assets: AssetItem[];
  onChange: (next: ProduceOptions) => void;
  onOpenAssets: () => void;
  onDeck?: (deck: VisualDeck) => void;
  deck?: VisualDeck | null;
}) {
  const [savedLooks, setSavedLooks] = useState(loadSavedLooks);
  const [packName, setPackName] = useState('');
  const [planning, setPlanning] = useState(false);
  const [planNote, setPlanNote] = useState('');
  const [planError, setPlanError] = useState('');
  const visuals = useMemo(() => assets.filter((item) => item.kind !== 'music'), [assets]);
  const tracks = useMemo(() => assets.filter((item) => item.kind === 'music'), [assets]);
  const background = visuals.find((item) => item.id === options.backgroundId) || null;
  const backgroundId = background ? background.id : '';
  const musicId =
    options.musicId === BG_AUDIO && background?.kind === 'video'
      ? BG_AUDIO
      : tracks.some((item) => item.id === options.musicId)
        ? options.musicId
        : '';
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const lookLocked = Boolean(options.savedLookId);
  const lookDisabled = disabled || lookLocked;

  function paintLook(next: ProduceOptions, nextDeck?: VisualDeck | null) {
    flushSync(() => {
      onChange(next);
    });
    if (nextDeck) {
      onDeck?.(nextDeck);
    } else if (onDeck && deck) {
      onDeck({
        ...deck,
        style: {
          font: next.captionFont,
          box: next.captionBox,
          size: next.captionSize,
          enter: next.stepEnter,
          exit: next.stepExit,
          reveal: next.deckReveal,
        },
      });
    }
    document.getElementById('produce-preview')?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }

  async function generateLook() {
    setPlanError('');
    setPlanNote('');
    if (!jobId) {
      setPlanError('还没有任务，请先导入口播稿。');
      return;
    }
    if (!options.lookBrief.trim()) {
      setPlanError('先写想要的效果，或点一条仿写。');
      return;
    }
    setPlanning(true);
    try {
      const payload = await planLook(jobId, options.lookBrief.trim());
      paintLook(applyServerLook(optionsRef.current, payload.look), payload.deck || undefined);
      setPlanNote(payload.note);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : '生成效果方案失败');
    } finally {
      setPlanning(false);
    }
  }

  return (
    <div className="fields">
      <label>
        <span>想要什么效果</span>
        <textarea
          rows={3}
          disabled={disabled}
          value={options.lookBrief}
          placeholder="例如：黑金干货，展示卡字大清楚，重点词弹出"
          onChange={(event) =>
            onChange({...options, lookBrief: event.target.value, motionPack: options.motionPack === 'custom' ? 'custom' : 'auto'})
          }
        />
        <div className="voice-row">
          <button className="btn" type="button" disabled={disabled || planning || !options.lookBrief.trim()} onClick={() => void generateLook()}>
            {planning ? '正在生成效果…' : '生成效果方案'}
          </button>
        </div>
        {planError ? <div className="error">{planError}</div> : null}
        {planNote ? <p className="hint">{planNote}</p> : null}
        <p className="hint">
          {options.motionPack === 'auto'
            ? '点「生成效果方案」后，AI 会配主题底色、动效，以及展示卡统一样式和揭示方式。没配模型则用常见搭配。'
            : options.motionPack === 'custom'
              ? '自定义以右侧预览和下面选项为准。可保存成「我的搭配」。'
              : '已套用常见搭配。改文字后若要让 AI 重新决定，点「AI 按效果决定」。'}
        </p>
      </label>
      <div className="look-block">
        <span>不会写就仿写一条</span>
        <div className="chip-grid look-samples">
          {LOOK_SAMPLES.map((sample) => (
            <button
              key={sample}
              type="button"
              className={options.lookBrief === sample ? 'chip on' : 'chip'}
              disabled={disabled}
              onClick={() => {
                const recipe = matchLookByBrief(sample);
                paintLook({
                  ...applyLook(optionsRef.current, recipe || BUILTIN_LOOKS[0], 'auto', sample),
                  savedLookId: '',
                });
              }}
            >
              {sample}
            </button>
          ))}
        </div>
      </div>
      <div className="look-block">
        <span>常见搭配</span>
        <div className="chip-grid">
          <button
            type="button"
            className={options.motionPack === 'auto' && !options.savedLookId ? 'chip on' : 'chip'}
            disabled={disabled}
            onClick={() => {
              const recipe = matchLookByBrief(options.lookBrief) || BUILTIN_LOOKS[0];
              paintLook({
                ...applyLook(optionsRef.current, recipe, 'auto', options.lookBrief || recipe.brief),
                savedLookId: '',
              });
            }}
          >
            AI 按效果决定
          </button>
          {BUILTIN_LOOKS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={options.motionPack === item.id ? 'chip on' : 'chip'}
              disabled={disabled}
              onClick={() => paintLook({...applyLook(optionsRef.current, item, item.id as MotionPack), savedLookId: ''})}
            >
              {item.name}
            </button>
          ))}
          <button
            type="button"
            className={options.motionPack === 'custom' && !options.savedLookId ? 'chip on' : 'chip'}
            disabled={disabled}
            onClick={() => paintLook({...optionsRef.current, motionPack: 'custom', savedLookId: ''})}
          >
            自定义
          </button>
        </div>
      </div>
      {savedLooks.length ? (
        <div className="look-block">
          <span>我的搭配</span>
          <div className="chip-grid">
            {savedLooks.map((item) => (
              <button
                key={item.id}
                type="button"
                className={options.savedLookId === item.id ? 'chip on' : 'chip'}
                disabled={disabled}
                onClick={() =>
                  paintLook({
                    ...applyLook(optionsRef.current, item, 'custom', item.brief),
                    savedLookId: item.id,
                  })
                }
              >
                {item.name}
              </button>
            ))}
          </div>
          {lookLocked ? (
            <p className="hint">已存搭配只还原、不改写。要改效果请点「自定义」，已存的这一份不会变。</p>
          ) : null}
          {lookLocked ? (
            <button
              type="button"
              className="linkish"
              disabled={disabled}
              onClick={() => {
                setSavedLooks(deleteSavedLook(options.savedLookId));
                paintLook({...optionsRef.current, savedLookId: '', motionPack: 'custom'});
              }}
            >
              删除当前「我的搭配」
            </button>
          ) : null}
        </div>
      ) : null}
      {options.motionPack === 'custom' ? (
        <>
          <div className="theme-token-row">
            <span>主题色</span>
            <div className="theme-token-swatches">
              <label>
                背景
                <input
                  type="color"
                  title="成片底色"
                  value={/^#[0-9a-fA-F]{6}$/.test(options.themeTokens.bg) ? options.themeTokens.bg : '#0a0a0a'}
                  disabled={lookDisabled}
                  onChange={(event) => {
                    const bg = event.target.value;
                    const card = options.themeTokens.captionBg;
                    onChange({
                      ...options,
                      themeTokens: {
                        ...options.themeTokens,
                        bg,
                        captionBg: !card || card === options.themeTokens.bg ? bg : card,
                      },
                    });
                  }}
                />
              </label>
              <label>
                文字
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(options.themeTokens.text) ? options.themeTokens.text : '#fff7d6'}
                  disabled={lookDisabled}
                  onChange={(event) => onChange({...options, themeTokens: {...options.themeTokens, text: event.target.value}})}
                />
              </label>
              <label>
                强调
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(options.themeTokens.accent) ? options.themeTokens.accent : '#ffcc33'}
                  disabled={lookDisabled}
                  onChange={(event) => onChange({...options, themeTokens: {...options.themeTokens, accent: event.target.value}})}
                />
              </label>
              <label>
                步骤卡
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(options.themeTokens.captionBg || '') ? options.themeTokens.captionBg || '' : '#111111'}
                  disabled={lookDisabled}
                  onChange={(event) => onChange({...options, themeTokens: {...options.themeTokens, captionBg: event.target.value}})}
                />
              </label>
            </div>
          </div>
          <FieldSelect
            label="主题动效"
            value={options.themeMotion}
            disabled={lookDisabled}
            options={THEME_MOTION_OPTIONS}
            onChange={(value) => onChange({...options, themeMotion: value as ThemeMotion})}
          />
          <FieldSelect
            label="标题进入"
            value={options.titleEnter}
            disabled={lookDisabled}
            options={ENTER_FX_OPTIONS}
            onChange={(value) => onChange({...options, titleEnter: value})}
          />
          <FieldSelect
            label="步骤卡进入"
            value={options.stepEnter}
            disabled={lookDisabled}
            options={ENTER_FX_OPTIONS}
            onChange={(value) => onChange({...options, stepEnter: value, stepEnters: [value]})}
          />
          <FieldSelect
            label="步骤卡退出"
            value={options.stepExit}
            disabled={lookDisabled}
            options={EXIT_FX_OPTIONS}
            onChange={(value) => onChange({...options, stepExit: value})}
          />
          <FieldSelect
            label="揭示"
            value={options.deckReveal}
            disabled={lookDisabled}
            options={REVEAL_OPTIONS}
            hint="卡片里的内容怎么陆续露出来。图表页会自动改成「画出图表」。"
            onChange={(value) => {
              const next = {...options, deckReveal: value};
              onChange(next);
              if (onDeck && deck) {
                onDeck({
                  ...deck,
                  style: {
                    ...(deck.style || {
                      font: next.captionFont,
                      box: next.captionBox,
                      size: next.captionSize,
                      enter: next.stepEnter,
                      exit: next.stepExit,
                      reveal: value,
                    }),
                    reveal: value,
                  },
                });
              }
            }}
          />
          <FieldSelect
            label="关键词"
            value={options.keywordFx}
            disabled={lookDisabled}
            options={KEYWORD_FX_OPTIONS}
            onChange={(value) => onChange({...options, keywordFx: value})}
          />
          <FieldSelect
            label="CTA 进入"
            value={options.ctaEnter}
            disabled={lookDisabled}
            options={ENTER_FX_OPTIONS}
            onChange={(value) => onChange({...options, ctaEnter: value})}
          />
          <details className="produce-more">
            <summary>文字样式（主题词 / 步骤卡）</summary>
            <FieldSelect
              label="主题词字体"
              value={options.titleFont}
              disabled={lookDisabled}
              options={CAPTION_FONTS.map((item) => ({id: item.id, name: item.name}))}
              onChange={(value) => onChange({...options, titleFont: value as ProduceOptions['titleFont']})}
            />
            <FieldSelect
              label="主题词样式"
              value={options.titleBox}
              disabled={lookDisabled}
              options={CAPTION_BOXES}
              onChange={(value) => onChange({...options, titleBox: value as ProduceOptions['titleBox']})}
            />
            <FieldSelect
              label="主题词大小"
              value={options.titleSize}
              disabled={lookDisabled}
              options={CAPTION_SIZES.map((item) => ({id: item.id, name: item.name}))}
              onChange={(value) => onChange({...options, titleSize: value as ProduceOptions['titleSize']})}
            />
            <FieldSelect
              label="步骤卡字体"
              value={options.captionFont}
              disabled={lookDisabled}
              options={CAPTION_FONTS.map((item) => ({id: item.id, name: item.name}))}
              onChange={(value) => onChange({...options, captionFont: value as ProduceOptions['captionFont']})}
            />
            <FieldSelect
              label="步骤卡样式"
              value={options.captionBox}
              disabled={lookDisabled}
              options={CAPTION_BOXES}
              onChange={(value) => onChange({...options, captionBox: value as ProduceOptions['captionBox']})}
            />
            <FieldSelect
              label="展示卡字号"
              value={options.captionSize}
              disabled={lookDisabled}
              options={CAPTION_SIZES.map((item) => ({id: item.id, name: item.name}))}
              hint="管标题和金句。要点、左右栏会比标题小两号。金句页也可在预览里改。"
              onChange={(value) => {
                const size = value as ProduceOptions['captionSize'];
                const next = {...options, captionSize: size};
                onChange(next);
                if (onDeck && deck) {
                  onDeck({
                    ...deck,
                    style: {
                      font: deck.style?.font || next.captionFont,
                      box: deck.style?.box || next.captionBox,
                      size,
                      enter: deck.style?.enter || next.stepEnter,
                      exit: deck.style?.exit || next.stepExit,
                      reveal: deck.style?.reveal || next.deckReveal,
                    },
                  });
                }
              }}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={options.hideCaptionsOnCta}
                disabled={lookDisabled}
                onChange={(event) => onChange({...options, hideCaptionsOnCta: event.target.checked})}
              />
              最后 3 秒出 CTA 时先藏步骤卡
            </label>
          </details>
          {lookLocked ? null : (
            <div className="look-save">
              <input
                type="text"
                value={packName}
                disabled={disabled}
                placeholder="给当前搭配起名，存进「我的搭配」"
                onChange={(event) => setPackName(event.target.value)}
              />
              <button
                type="button"
                className="btn ghost"
                disabled={disabled || !packName.trim()}
                onClick={() => {
                  const item = saveCurrentLook(optionsRef.current, packName.trim());
                  setSavedLooks(loadSavedLooks());
                  setPackName('');
                  paintLook({...optionsRef.current, motionPack: 'custom', savedLookId: item.id, lookBrief: item.brief});
                }}
              >
                保存搭配
              </button>
            </div>
          )}
        </>
      ) : null}
      <label>
        <span>成片背景</span>
        <select value={backgroundId} disabled={disabled} onChange={(event) => onChange({...options, backgroundId: event.target.value})}>
          <option value="">主题底色</option>
          {visuals.map((item) => (
            <option key={item.id} value={item.id}>
              {item.kind === 'video' ? '视频 · ' : '图片 · '}
              {item.name}
            </option>
          ))}
        </select>
        <p className="hint">各页没单独选背景时，用这一份。</p>
      </label>
      <button className="linkish" type="button" onClick={onOpenAssets}>
        打开素材库，上传封面图或空镜
      </button>
      <label>
        <span>配乐</span>
        <select value={musicId} disabled={disabled} onChange={(event) => onChange({...options, musicId: event.target.value})}>
          <option value="">不配乐</option>
          {background?.kind === 'video' ? <option value={BG_AUDIO}>背景视频原声</option> : null}
          {tracks.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {musicId && musicId !== BG_AUDIO ? <audio className="asset-audio" src={assetFileUrl(musicId)} controls /> : null}
      </label>
      {musicId ? (
        <label>
          <span>配乐音量 {Math.round(options.musicVolume * 100)}%</span>
          <input
            type="range"
            min={0}
            max={40}
            value={Math.round(options.musicVolume * 100)}
            disabled={disabled}
            onChange={(event) => onChange({...options, musicVolume: Number(event.target.value) / 100})}
          />
        </label>
      ) : (
        <button className="linkish" type="button" onClick={onOpenAssets}>
          打开素材库，上传配乐
        </button>
      )}
    </div>
  );
}
