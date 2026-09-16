import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {CAPTION_BOXES, CAPTION_FONTS, CAPTION_SIZES} from '../captionStyle';
import {FieldSelect} from '../component/FieldSelect';
import {ThemePreview} from '../component/ThemePreview';
import {captionHighlights} from '../highlight';
import {PATH} from '../paths';
import {BEAT_KIND_OPTIONS, ENTER_FX_OPTIONS, EXIT_FX_OPTIONS, REVEAL_OPTIONS, defaultReveal} from '../produce/options';
import {LookSceneFields} from '../produce/LookSceneFields';
import {useStudio} from '../studio/StudioContext';
import {scriptReady} from '../studio/script';
import type {BeatKind, DeckBeat, DeckStyle, VisualDeck} from '../types';

const DEFAULT_STYLE: DeckStyle = {
  font: 'sans',
  box: 'card',
  size: 'md',
  enter: 'slide_up',
  exit: 'fade_out',
  reveal: 'stagger',
};

const BEAT_ALIAS: Record<string, BeatKind> = {
  ppt: 'points',
  line_chart: 'chart',
  timeline_chart: 'timeline',
};

function spokenUnits(script: {hook?: string; body?: string[]; cta?: string; narration?: string; topic?: string}) {
  const units: string[] = [];
  if (script.hook?.trim()) units.push(script.hook.trim());
  for (const line of script.body || []) {
    if (line.trim()) units.push(line.trim());
  }
  if (script.cta?.trim()) units.push(script.cta.trim());
  return units.length ? units : [(script.narration || script.topic || '').trim()].filter(Boolean);
}

function uniqueLines(items: number[]) {
  return [...new Set(items.filter((n) => Number.isInteger(n) && n >= 0))].sort((a, b) => a - b);
}

function uniqueText(items: Array<string | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = (item || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function absorbBeat(host: DeckBeat, extra: DeckBeat): DeckBeat {
  const lines = uniqueLines([...(host.lines || []), ...(extra.lines || [])]);
  if (host.kind === 'stats') {
    return {
      ...host,
      lines,
      stats: uniqueText([...(host.stats || []), ...(extra.stats || []), extra.title, ...(extra.points || [])]),
    };
  }
  if (host.kind === 'compare' || host.kind === 'quote' || host.kind === 'chart' || host.kind === 'timeline') {
    return {...host, lines};
  }
  return {
    ...host,
    lines,
    points: uniqueText([
      ...(host.points || []),
      extra.title !== host.title ? extra.title : '',
      ...(extra.points || []),
      ...(extra.stats || []),
      extra.left,
      extra.right,
    ]),
  };
}

function mergeDeckBeats(beats: DeckBeat[], picked: number[]) {
  const idxs = [...new Set(picked)].sort((a, b) => a - b).filter((i) => i >= 0 && i < beats.length);
  if (idxs.length < 2) return beats;
  const hostAt = idxs[0];
  let host = beats[hostAt];
  for (const i of idxs.slice(1)) host = absorbBeat(host, beats[i]);
  const drop = new Set(idxs.slice(1));
  return beats.map((beat, i) => (i === hostAt ? host : beat)).filter((_, i) => !drop.has(i));
}

function deleteDeckBeats(beats: DeckBeat[], picked: number[]) {
  const drop = new Set([...new Set(picked)].filter((i) => i >= 0 && i < beats.length));
  if (!drop.size || drop.size >= beats.length) return beats;
  const next = beats.map((beat) => ({...beat, lines: [...(beat.lines || [])]}));
  for (let i = 0; i < beats.length; i++) {
    if (!drop.has(i)) continue;
    let dest = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (!drop.has(j)) {
        dest = j;
        break;
      }
    }
    if (dest < 0) {
      for (let j = i + 1; j < beats.length; j++) {
        if (!drop.has(j)) {
          dest = j;
          break;
        }
      }
    }
    if (dest >= 0) next[dest].lines = uniqueLines([...next[dest].lines, ...(beats[i].lines || [])]);
  }
  return next.filter((_, i) => !drop.has(i));
}

function withStyle(deck: VisualDeck): VisualDeck {
  return {
    ...deck,
    style: {...DEFAULT_STYLE, ...deck.style},
    beats: deck.beats.map((beat) => ({
      ...beat,
      kind: BEAT_ALIAS[beat.kind] || beat.kind,
    })),
  };
}

export function DeckPage() {
  const {
    busy,
    working,
    view,
    setView,
    currentScript,
    goBack,
    goNext,
    nextHint,
    produce,
    changeProduce,
    assets,
  } = useStudio();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<VisualDeck | null>(view?.deck ? withStyle(view.deck) : null);
  const [previewBeat, setPreviewBeat] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const jobId = view?.job.id;
  const units = currentScript ? spokenUnits(currentScript) : [];
  const locked = busy || working || !jobId;

  function commit(next: VisualDeck) {
    const packed = withStyle(next);
    setDeck(packed);
    setView((current) => (current ? {...current, deck: packed} : current));
  }

  useEffect(() => {
    if (!view?.deck?.beats?.length) return;
    setDeck(withStyle(view.deck));
  }, [view?.job.id, view?.deck?.source, view?.deck?.beats?.length]);

  function patchBeat(index: number, patch: Partial<DeckBeat>) {
    if (!deck) return;
    setPreviewBeat(index);
    commit({
      ...deck,
      beats: deck.beats.map((beat, i) => (i === index ? {...beat, ...patch} : beat)),
    });
  }

  function togglePicked(index: number) {
    setPicked((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index].sort((a, b) => a - b),
    );
    setPreviewBeat(index);
  }

  function applyBeats(nextBeats: DeckBeat[], keepIndex: number) {
    if (!deck) return;
    const safe = Math.max(0, Math.min(keepIndex, nextBeats.length - 1));
    setPicked([]);
    setPreviewBeat(safe);
    commit({...deck, beats: nextBeats});
  }

  const globalStyle = deck?.style || DEFAULT_STYLE;

  return (
    <section className="panel">
      <div className="produce-head">展示稿</div>
      <p className="hint">
        先写想要的效果并生成方案（主题色、动效、展示卡样式和揭示一起配）。版式只决定这一页怎么排内容，不改颜色。预览里可拖主题词和展示卡。
      </p>

      <div className="produce">
        <div className="produce-grid">
          <LookSceneFields
            options={produce}
            disabled={locked}
            jobId={jobId}
            assets={assets}
            onChange={changeProduce}
            onOpenAssets={() => navigate(PATH.assets)}
            onDeck={commit}
            deck={deck}
          />
          <div>
            {deck?.beats?.length ? (
              <div className="choice-row deck-kinds" style={{marginBottom: 8}}>
                {deck.beats.map((beat, index) => (
                  <button
                    key={beat.id || index}
                    type="button"
                    className={previewBeat === index ? 'btn' : 'btn ghost'}
                    onClick={() => setPreviewBeat(index)}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            ) : null}
            <ThemePreview
              options={produce}
              hook={currentScript?.hook ?? ''}
              topic={currentScript?.topic ?? ''}
              bodyLines={currentScript?.body ?? []}
              highlights={captionHighlights(currentScript)}
              background={
                deck?.beats?.[previewBeat]?.background_id === '__theme__'
                  ? null
                  : assets.find((item) => {
                      const pageId = deck?.beats?.[previewBeat]?.background_id || produce.backgroundId;
                      return item.id === pageId && item.kind !== 'music';
                    }) || null
              }
              disabled={locked}
              onChange={changeProduce}
              deckBeat={deck?.beats?.[previewBeat] || deck?.beats?.[0] || null}
              deckStyle={globalStyle}
              deckIndex={previewBeat}
              deckTotal={deck?.beats?.length || 0}
              onDeckSize={(size) => {
                changeProduce({...produce, captionSize: size});
                if (!deck) return;
                const beat = deck.beats[previewBeat];
                if (beat?.style && Object.keys(beat.style).length) {
                  patchBeat(previewBeat, {style: {...globalStyle, ...beat.style, size}});
                  return;
                }
                commit({...deck, style: {...globalStyle, size}});
              }}
            />
          </div>
        </div>
      </div>

      {deck?.beats?.length ? (
        <>
          <div className="deck-page-tools">
            <button
              type="button"
              className="btn ghost"
              disabled={locked || picked.length < 2}
              onClick={() => {
                const host = Math.min(...picked);
                applyBeats(mergeDeckBeats(deck.beats, picked), host);
              }}
            >
              合并所选
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={locked || !picked.length || picked.length >= deck.beats.length}
              onClick={() => {
                const firstDel = Math.min(...picked);
                let dest = -1;
                for (let j = firstDel - 1; j >= 0; j--) {
                  if (!picked.includes(j)) {
                    dest = j;
                    break;
                  }
                }
                if (dest < 0) {
                  dest = deck.beats.findIndex((_, i) => !picked.includes(i));
                }
                const mapped = dest - picked.filter((i) => i < dest).length;
                applyBeats(deleteDeckBeats(deck.beats, picked), mapped);
              }}
            >
              删除所选
            </button>
            {picked.length ? (
              <button type="button" className="linkish" disabled={locked} onClick={() => setPicked([])}>
                取消选择
              </button>
            ) : null}
            <p className="hint">勾选多页可合并；删除后口播时间并入上一页（第一页则并入下一页）。至少留一页。</p>
          </div>
          <ol className="deck-beats">
            {deck.beats.map((beat, index) => {
              const special = Boolean(beat.style && Object.keys(beat.style).length);
              const look = {...globalStyle, ...beat.style};
              return (
                <li
                  key={beat.id || index}
                  className={`deck-beat${previewBeat === index ? ' is-preview' : ''}${picked.includes(index) ? ' is-picked' : ''}`}
                  onClick={() => setPreviewBeat(index)}
                >
                  <div className="produce-head">
                    <label className="check" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={picked.includes(index)}
                        disabled={locked}
                        onChange={() => togglePicked(index)}
                      />
                      第 {index + 1} 页
                    </label>
                    <span>对应口播第 {(beat.lines || []).map((n) => n + 1).join('、') || '—'} 句</span>
                  </div>
                  {(beat.lines || []).map((n) =>
                    units[n] ? (
                      <p key={`${beat.id}-line-${n}`} className="hint">
                        {units[n]}
                      </p>
                    ) : null,
                  )}
                  <div className="deck-style-grid">
                    <FieldSelect
                      label="版式"
                      value={beat.kind}
                      disabled={locked}
                      options={BEAT_KIND_OPTIONS}
                      onChange={(value) =>
                        patchBeat(index, {
                          kind: value as BeatKind,
                          reveal: defaultReveal(value, look.reveal),
                        })
                      }
                    />
                    <label>
                      <span>{beat.kind === 'quote' ? '金句' : '标题'}</span>
                      <input
                        value={beat.title}
                        disabled={locked}
                        onChange={(event) => patchBeat(index, {title: event.target.value})}
                      />
                    </label>
                    <label>
                      <span>这一页背景</span>
                      <select
                        value={beat.background_id || ''}
                        disabled={locked}
                        onChange={(event) => patchBeat(index, {background_id: event.target.value})}
                      >
                        <option value="">跟成片背景</option>
                        <option value="__theme__">只要主题底色</option>
                        {assets
                          .filter((item) => item.kind !== 'music')
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.kind === 'video' ? '视频 · ' : '图片 · '}
                              {item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  {beat.kind === 'compare' ? (
                    <div className="deck-style-grid">
                      <label>
                        <span>左侧</span>
                        <input
                          value={beat.left || ''}
                          disabled={locked}
                          onChange={(event) => patchBeat(index, {left: event.target.value})}
                        />
                      </label>
                      <label>
                        <span>右侧</span>
                        <input
                          value={beat.right || ''}
                          disabled={locked}
                          onChange={(event) => patchBeat(index, {right: event.target.value})}
                        />
                      </label>
                    </div>
                  ) : beat.kind === 'stats' ? (
                    <label>
                      <span>数据（一行一项）</span>
                      <textarea
                        rows={3}
                        disabled={locked}
                        value={(beat.stats || []).join('\n')}
                        onChange={(event) =>
                          patchBeat(index, {
                            stats: event.target.value
                              .split('\n')
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </label>
                  ) : beat.kind === 'quote' || beat.kind === 'chart' || beat.kind === 'timeline' ? null : (
                    <label>
                      <span>{beat.kind === 'steps' ? '步骤（一行一步）' : '要点（一行一条）'}</span>
                      <textarea
                        rows={3}
                        disabled={locked}
                        value={(beat.points || []).join('\n')}
                        onChange={(event) =>
                          patchBeat(index, {
                            points: event.target.value
                              .split('\n')
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </label>
                  )}
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={special}
                      disabled={locked}
                      onChange={(event) => patchBeat(index, {style: event.target.checked ? {...globalStyle} : null})}
                    />
                    这一页用特殊样式（不勾选则跟统一配置）
                  </label>
                  {special ? (
                    <div className="deck-style-grid">
                      <FieldSelect
                        label="字体"
                        value={look.font}
                        disabled={locked}
                        options={CAPTION_FONTS.map((item) => ({id: item.id, name: item.name}))}
                        onChange={(value) => patchBeat(index, {style: {...look, font: value as DeckStyle['font']}})}
                      />
                      <FieldSelect
                        label="底框"
                        value={look.box}
                        disabled={locked}
                        options={CAPTION_BOXES.map((item) => ({id: item.id, name: item.name}))}
                        onChange={(value) => patchBeat(index, {style: {...look, box: value as DeckStyle['box']}})}
                      />
                      <FieldSelect
                        label="字号"
                        value={look.size}
                        disabled={locked}
                        options={CAPTION_SIZES.map((item) => ({id: item.id, name: item.name}))}
                        onChange={(value) => patchBeat(index, {style: {...look, size: value as DeckStyle['size']}})}
                      />
                      <FieldSelect
                        label="入场"
                        value={look.enter}
                        disabled={locked}
                        options={ENTER_FX_OPTIONS}
                        onChange={(value) => patchBeat(index, {style: {...look, enter: value}})}
                      />
                      <FieldSelect
                        label="退场"
                        value={look.exit}
                        disabled={locked}
                        options={EXIT_FX_OPTIONS}
                        onChange={(value) => patchBeat(index, {style: {...look, exit: value}})}
                      />
                      <FieldSelect
                        label="揭示"
                        value={look.reveal}
                        disabled={locked}
                        options={REVEAL_OPTIONS}
                        onChange={(value) => patchBeat(index, {style: {...look, reveal: value}})}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className="hint">还没有展示页。请回到口播稿：点「下一步」逐句平移，或点「AI 生成展示稿」混排。</p>
      )}

      <div className="actions">
        <button className="btn ghost" disabled={busy || working} onClick={goBack}>
          上一步
        </button>
        <button className="btn" disabled={busy || working || !scriptReady(currentScript)} onClick={() => void goNext()}>
          下一步
        </button>
      </div>
      {nextHint ? <p className="hint">{nextHint}</p> : null}
    </section>
  );
}
