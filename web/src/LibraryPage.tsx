import {useEffect, useMemo, useState} from 'react';
import {deleteLibraryItem, deleteLibraryItems, listLibrary, reuseLibraryItem, saveLibraryItem} from './api';
import type {JobView, LibraryItem, VisualDeck} from './types';
import {BEAT_KIND_OPTIONS} from './produce/options';

function rewriteOf(item: LibraryItem) {
  if (item.script?.narration.trim()) return item.script.narration;
  if (!item.script) return '';
  return [item.script.hook, ...item.script.body, item.script.cta].filter(Boolean).join('。');
}

function cloneDeck(deck: VisualDeck | null | undefined): VisualDeck | null {
  if (!deck?.beats?.length) return deck ? {...deck, beats: [...deck.beats]} : null;
  return JSON.parse(JSON.stringify(deck)) as VisualDeck;
}

function deckSnippet(item: LibraryItem) {
  const titles = (item.deck?.beats || []).map((beat) => beat.title?.trim()).filter(Boolean);
  if (!titles.length) return '';
  return `${titles.length} 页 · ${titles.slice(0, 3).join(' · ')}`;
}

function kindName(id: string) {
  return BEAT_KIND_OPTIONS.find((item) => item.id === id)?.name || id;
}

function snippet(text: string, size = 42) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > size ? `${clean.slice(0, size)}…` : clean;
}

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleString('zh-CN');
  } catch {
    return value;
  }
}

export function LibraryPage({onReuse}: {onReuse: (view: JobView, step: number) => void}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [currentId, setCurrentId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [original, setOriginal] = useState('');
  const [rewrite, setRewrite] = useState('');
  const [deck, setDeck] = useState<VisualDeck | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const current = useMemo(() => items.find((item) => item.id === currentId) || null, [items, currentId]);
  const allIds = useMemo(() => items.map((item) => item.id), [items]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));

  async function refresh(nextQuery = query, keepId = currentId) {
    const payload = await listLibrary(nextQuery);
    setItems(payload.items);
    const visible = new Set(payload.items.map((item) => item.id));
    setSelected((current) => current.filter((id) => visible.has(id)));
    const keep = payload.items.find((item) => item.id === keepId) || payload.items[0] || null;
    setCurrentId(keep?.id || '');
    if (keep) {
      setTitle(keep.title);
      setOriginal(keep.original);
      setRewrite(rewriteOf(keep));
      setDeck(cloneDeck(keep.deck));
    } else {
      setTitle('');
      setOriginal('');
      setRewrite('');
      setDeck(null);
    }
  }

  useEffect(() => {
    void refresh()
      .catch((err: Error) => setError(err.message))
      .finally(() => setReady(true));
  }, []);

  function pick(item: LibraryItem) {
    setCurrentId(item.id);
    setTitle(item.title);
    setOriginal(item.original);
    setRewrite(rewriteOf(item));
    setDeck(cloneDeck(item.deck));
    setError('');
  }

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleAll() {
    setSelected(allSelected ? [] : allIds);
  }

  async function wrap(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel library-page">
      <div className="library-head">
        <label>
          <span>查询文稿</span>
          <input
            type="text"
            value={query}
            placeholder="搜标题、原文、改写稿或展示页"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void wrap(() => refresh(query, currentId));
            }}
          />
        </label>
        <div className="actions" style={{marginTop: 0}}>
          <button type="button" className="btn" disabled={busy} onClick={() => void wrap(() => refresh(query, currentId))}>
            搜索
          </button>
        </div>
      </div>

      <div className="library-batch">
        <label className="check">
          <input type="checkbox" checked={allSelected} disabled={busy || !items.length} onChange={toggleAll} />
          全选当前列表
        </label>
        <button
          type="button"
          className="btn ghost"
          disabled={busy || !selected.length}
          onClick={() =>
            void wrap(async () => {
              if (!window.confirm(`删除选中的 ${selected.length} 篇文稿？制作任务不会一起删。`)) return;
              await deleteLibraryItems(selected);
              setSelected([]);
              await refresh(query, selected.includes(currentId) ? '' : currentId);
            })
          }
        >
          删除选中{selected.length ? ` ${selected.length}` : ''}
        </button>
      </div>

      <div className="library-layout">
        <div className="library-list">
          {!ready ? (
            <p className="hint">正在读取文稿…</p>
          ) : items.length ? (
            items.map((item) => (
              <div key={item.id} className={`voice-item library-item ${item.id === currentId ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  disabled={busy}
                  onChange={() => toggle(item.id)}
                  aria-label={`选择 ${item.title || '未命名口播'}`}
                />
                <button type="button" className="library-pick" onClick={() => pick(item)}>
                  <b>{item.title || '未命名口播'}</b>
                  <p>
                    {snippet(item.original) || snippet(rewriteOf(item)) || '空文稿'}
                    {deckSnippet(item) ? ` · ${deckSnippet(item)}` : ''}
                  </p>
                  <p>{formatTime(item.updated_at)}</p>
                </button>
              </div>
            ))
          ) : (
            <p className="hint">还没有保存的文稿。确认原文、改口播稿或保存展示稿后会自动入库。</p>
          )}
        </div>

        {current ? (
          <div className="fields">
            <label>
              <span>标题</span>
              <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              <span>口播原文</span>
              <textarea value={original} onChange={(event) => setOriginal(event.target.value)} />
            </label>
            <label>
              <span>AI 改写稿</span>
              <textarea value={rewrite} onChange={(event) => setRewrite(event.target.value)} />
            </label>
            {deck?.beats?.length ? (
              <div className="library-deck">
                <div className="produce-head">展示稿 · {deck.beats.length} 页</div>
                {deck.beats.map((beat, index) => (
                  <div key={beat.id || index} className="library-deck-beat">
                    <p className="hint">
                      第 {index + 1} 页 · {kindName(beat.kind)}
                    </p>
                    <label>
                      <span>标题</span>
                      <input
                        type="text"
                        value={beat.title}
                        onChange={(event) =>
                          setDeck({
                            ...deck,
                            beats: deck.beats.map((item, i) => (i === index ? {...item, title: event.target.value} : item)),
                          })
                        }
                      />
                    </label>
                    {beat.kind === 'compare' ? (
                      <div className="deck-style-grid">
                        <label>
                          <span>左侧</span>
                          <input
                            value={beat.left || ''}
                            onChange={(event) =>
                              setDeck({
                                ...deck,
                                beats: deck.beats.map((item, i) => (i === index ? {...item, left: event.target.value} : item)),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>右侧</span>
                          <input
                            value={beat.right || ''}
                            onChange={(event) =>
                              setDeck({
                                ...deck,
                                beats: deck.beats.map((item, i) => (i === index ? {...item, right: event.target.value} : item)),
                              })
                            }
                          />
                        </label>
                      </div>
                    ) : beat.kind === 'stats' ? (
                      <label>
                        <span>数据（一行一项）</span>
                        <textarea
                          rows={3}
                          value={(beat.stats || []).join('\n')}
                          onChange={(event) =>
                            setDeck({
                              ...deck,
                              beats: deck.beats.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      stats: event.target.value
                                        .split('\n')
                                        .map((line) => line.trim())
                                        .filter(Boolean),
                                    }
                                  : item,
                              ),
                            })
                          }
                        />
                      </label>
                    ) : beat.kind === 'quote' || beat.kind === 'chart' || beat.kind === 'timeline' ? null : (
                      <label>
                        <span>{beat.kind === 'steps' ? '步骤（一行一步）' : '要点（一行一条）'}</span>
                        <textarea
                          rows={3}
                          value={(beat.points || []).join('\n')}
                          onChange={(event) =>
                            setDeck({
                              ...deck,
                              beats: deck.beats.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      points: event.target.value
                                        .split('\n')
                                        .map((line) => line.trim())
                                        .filter(Boolean),
                                    }
                                  : item,
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">这篇还没有展示稿。在制作流程里生成展示稿后会一起入库。</p>
            )}
            <p className="hint">
              入库时间 {formatTime(current.created_at)}
              {current.script ? ` · ${current.script.engine === 'llm' ? 'AI 改写' : '原文/手改'}` : ' · 尚未改写'}
              {current.deck?.beats?.length ? ` · 展示稿 ${current.deck.beats.length} 页` : ''}
            </p>
            <div className="actions">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  void wrap(async () => {
                    await saveLibraryItem(current.id, {title, original, narration: rewrite, deck});
                    await refresh(query, current.id);
                  })
                }
              >
                保存修改
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  void wrap(async () => {
                    const view = await reuseLibraryItem(current.id);
                    onReuse(view, view.script ? 2 : 1);
                  })
                }
              >
                继续使用
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || !deck?.beats?.length || !current.script}
                title={deck?.beats?.length ? '用当前保存的展示稿进入 04' : '这篇还没有展示稿'}
                onClick={() =>
                  void wrap(async () => {
                    await saveLibraryItem(current.id, {title, original, narration: rewrite, deck});
                    const view = await reuseLibraryItem(current.id);
                    onReuse(view, 3);
                  })
                }
              >
                从展示稿继续
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() =>
                  void wrap(async () => {
                    if (!window.confirm('删除这篇文稿？制作任务不会一起删。')) return;
                    await deleteLibraryItem(current.id);
                    setSelected((currentSelected) => currentSelected.filter((id) => id !== current.id));
                    await refresh(query, '');
                  })
                }
              >
                删除
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {error ? <div className="error">{error}</div> : null}
    </section>
  );
}
