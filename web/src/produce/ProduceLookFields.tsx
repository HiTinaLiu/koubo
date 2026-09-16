import type {ReactNode} from 'react';
import {useMemo, useRef, useState} from 'react';
import {previewVoice} from '../api';
import {FieldSelect} from '../component/FieldSelect';
import {ThemePreview} from '../component/ThemePreview';
import {useStudio} from '../studio/StudioContext';
import {ORIENTATION_OPTIONS, PRESET_OPTIONS} from './options';
import {hidesTalkingHead} from './mask';
import type {AssetItem, PersonMask, ProduceOptions, VoiceItem} from '../types';

export function ProduceLookFields({
  voices,
  options,
  disabled,
  hook,
  topic,
  bodyLines,
  highlights,
  onChange,
  onOpenVoices,
  assets,
  showVoice,
  extra,
  takeUrl,
}: {
  voices: VoiceItem[];
  options: ProduceOptions;
  disabled: boolean;
  hook: string;
  topic: string;
  bodyLines?: string[];
  highlights?: string[];
  onChange: (next: ProduceOptions) => void;
  onOpenVoices: () => void;
  onOpenAssets?: () => void;
  assets: AssetItem[];
  showVoice?: boolean;
  showBackground?: boolean;
  extra?: ReactNode;
  takeUrl?: string;
  jobId?: string;
}) {
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const visuals = useMemo(() => assets.filter((item) => item.kind !== 'music'), [assets]);
  const {view} = useStudio();
  const deck = view?.deck;
  const deckBeat = deck?.beats?.[0] || null;
  const pageBgId = deckBeat?.background_id || options.backgroundId;
  const background =
    pageBgId === '__theme__'
      ? null
      : visuals.find((item) => item.id === pageBgId) || null;

  async function playPreview() {
    previewRef.current?.pause();
    setPreviewError('');
    setPreviewing(true);
    try {
      const blob = await previewVoice(options.voice);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPreviewing(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setPreviewing(false);
        setPreviewError('试听音频无法播放。');
      };
      await audio.play();
    } catch (err) {
      setPreviewing(false);
      setPreviewError(err instanceof Error ? err.message : '试听失败');
    }
  }

  return (
    <div className="produce">
      <div className="produce-grid">
        <div className="fields">
          {showVoice ? (
            <label>
              <span>配音</span>
              <div className="voice-row">
                <select
                  value={options.voice}
                  disabled={disabled}
                  onChange={(event) => onChange({...options, voice: event.target.value})}
                >
                  {(voices.length
                    ? voices
                    : [{id: options.voice, name: '晓晓', gender: '女', style: '默认', engine: 'edge' as const, kind: 'edge' as const}]
                  ).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.engine === 'spark' ? (item.kind === 'clone' ? '克隆 · ' : 'Spark · ') : ''}
                      {item.name} · {item.gender} · {item.style}
                    </option>
                  ))}
                </select>
                <button className="btn ghost" type="button" disabled={disabled || previewing} onClick={playPreview}>
                  {previewing ? '试听中' : '试听'}
                </button>
              </div>
              <button className="linkish" type="button" onClick={onOpenVoices}>
                打开声音库，管理 / 克隆音色
              </button>
              {previewError ? <div className="error">{previewError}</div> : null}
            </label>
          ) : null}
          {extra}
          <FieldSelect
            label="画幅"
            value={options.orientation}
            disabled={disabled}
            options={ORIENTATION_OPTIONS}
            onChange={(value) => onChange({...options, orientation: value as ProduceOptions['orientation']})}
          />
          <FieldSelect
            label="成片质量"
            value={options.renderPreset}
            disabled={disabled}
            options={PRESET_OPTIONS}
            hint={
              options.renderPreset === 'fast'
                ? '约 720×1280、24 帧，本机较慢时用。'
                : '1080p、30 帧。低配机仍会限制并发。'
            }
            onChange={(value) => onChange({...options, renderPreset: value as ProduceOptions['renderPreset']})}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={options.showSubtitles}
              disabled={disabled}
              onChange={(event) => onChange({...options, showSubtitles: event.target.checked})}
            />
            叠加字幕（按朗读稿全文拆句，对齐口播时间）
          </label>
          <label>
            <span>右上角角标</span>
            <input
              type="text"
              value={options.watermark}
              disabled={disabled}
              placeholder="口播场记"
              onChange={(event) => onChange({...options, watermark: event.target.value})}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={options.showWatermark}
              disabled={disabled}
              onChange={(event) => onChange({...options, showWatermark: event.target.checked})}
            />
            显示角标
          </label>
          <p className="hint">效果、主题色、背景和配乐在上一步「展示稿」里调。这里预览和成片都跟展示稿一致。</p>
        </div>
        <ThemePreview
          options={options}
          hook={hook}
          topic={topic}
          bodyLines={bodyLines}
          highlights={highlights}
          background={background}
          takeUrl={hidesTalkingHead(options.personMask) ? undefined : takeUrl}
          disabled={disabled}
          onChange={onChange}
          deckBeat={deckBeat}
          deckStyle={deck?.style || null}
          deckIndex={0}
          deckTotal={deck?.beats?.length || 0}
        />
      </div>
    </div>
  );
}

export function maskNeedsBackground(_mask: PersonMask) {
  return true;
}
