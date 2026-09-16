import {useEffect, useMemo, useState} from 'react';
import {deleteJob, deleteJobs, getJob, listHistory} from './api';
import type {JobHistoryItem, JobStatus, JobView} from './types';

const WORKING: JobStatus[] = ['transcribing', 'analyzing', 'voicing', 'rendering'];

const STATUS_LABEL: Record<JobStatus, string> = {
  draft: '草稿',
  transcribing: '识别中',
  transcribed: '已识别',
  analyzing: '改稿中',
  script_ready: '待成片',
  voicing: '配音中',
  rendering: '渲染中',
  done: '已成片',
  failed: '失败',
};

type Filter = 'done' | 'all' | 'failed';

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleString('zh-CN');
  } catch {
    return value;
  }
}

function openStep(item: JobHistoryItem) {
  if (item.has_final) return 4;
  if (item.status === 'script_ready' || item.status === 'done' || item.status === 'failed') return 3;
  if (item.status === 'transcribed' || item.status === 'analyzing') return 1;
  return 0;
}

export function HistoryPage({
  onOpen,
  onDeleted,
}: {
  onOpen: (view: JobView, step: number) => void;
  onDeleted: (id: string) => void;
}) {
  const [items, setItems] = useState<JobHistoryItem[]>([]);
  const [filter, setFilter] = useState<Filter>('done');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const visible = useMemo(() => {
    if (filter === 'done') return items.filter((item) => item.has_final);
    if (filter === 'failed') return items.filter((item) => item.status === 'failed');
    return items;
  }, [items, filter]);

  const visibleIds = useMemo(() => visible.map((item) => item.id), [visible]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  async function refresh() {
    const payload = await listHistory();
    setItems(payload.jobs);
    const keep = new Set(payload.jobs.map((item) => item.id));
    setSelected((current) => current.filter((id) => keep.has(id)));
  }

  useEffect(() => {
    void refresh()
      .catch((err: Error) => setError(err.message))
      .finally(() => setReady(true));
  }, []);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleAll() {
    setSelected(allSelected ? selected.filter((id) => !visibleIds.includes(id)) : [...new Set([...selected, ...visibleIds])]);
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
    <section className="panel history-page">
      <div className="library-head">
        <div className="choice-row">
          {(
            [
              ['done', '已成片'],
              ['all', '全部任务'],
              ['failed', '失败'],
            ] as Array<[Filter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'btn' : 'btn ghost'}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="actions" style={{marginTop: 0}}>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void wrap(refresh)}>
            刷新
          </button>
        </div>
      </div>

      <div className="library-batch">
        <label className="check">
          <input type="checkbox" checked={allSelected} disabled={busy || !visible.length} onChange={toggleAll} />
          全选当前列表
        </label>
        <button
          type="button"
          className="btn ghost"
          disabled={busy || !selected.length}
          onClick={() =>
            void wrap(async () => {
              if (!window.confirm(`删除选中的 ${selected.length} 条？处理中的任务会跳过，成片文件会一起删。`)) return;
              const result = await deleteJobs(selected);
              selected.filter((id) => !result.skipped.includes(id)).forEach(onDeleted);
              setSelected(result.skipped);
              await refresh();
            })
          }
        >
          删除选中{selected.length ? ` ${selected.length}` : ''}
        </button>
      </div>

      {!ready ? (
        <p className="hint">正在读取成片…</p>
      ) : visible.length ? (
        <div className="history-grid">
          {visible.map((item) => {
            const locked = WORKING.includes(item.status);
            const landscape = item.orientation === 'landscape';
            return (
              <article key={item.id} className={`history-card ${landscape ? 'landscape' : ''}`}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    disabled={busy || locked}
                    onChange={() => toggle(item.id)}
                    aria-label={`选择 ${item.title}`}
                  />
                  <span className={`status-pill ${item.status}`}>{STATUS_LABEL[item.status]}</span>
                </label>
                {item.has_cover ? (
                  <div className="thumb">
                    <img src={`/api/jobs/${item.id}/cover.jpg?t=${item.updated_at}`} alt="" />
                  </div>
                ) : item.has_final ? (
                  <div className="thumb">
                    <video src={`/api/jobs/${item.id}/final.mp4?t=${item.updated_at}`} controls preload="metadata" />
                  </div>
                ) : (
                  <div className="thumb empty">
                    <span>{locked ? item.step_message || '处理中' : '还没有成片'}</span>
                  </div>
                )}
                <b>{item.title}</b>
                <p>{formatTime(item.updated_at)}</p>
                {item.error ? <p className="error">{item.error}</p> : null}
                <div className="actions history-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void wrap(async () => {
                        const view = await getJob(item.id);
                        onOpen(view, openStep(item));
                      })
                    }
                  >
                    制作
                  </button>
                  {item.has_final ? (
                    <a className="btn ghost" href={`/api/jobs/${item.id}/final.mp4`} download>
                      下载
                    </a>
                  ) : (
                    <button type="button" className="btn ghost" disabled>
                      下载
                    </button>
                  )}
                  {item.has_cover ? (
                    <a className="btn ghost" href={`/api/jobs/${item.id}/cover.jpg?t=${item.updated_at}`} download>
                      主图
                    </a>
                  ) : (
                    <button type="button" className="btn ghost" disabled>
                      主图
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy || locked}
                    onClick={() =>
                      void wrap(async () => {
                        if (!window.confirm('删除这条记录？成片文件会一起删掉。')) return;
                        await deleteJob(item.id);
                        onDeleted(item.id);
                        await refresh();
                      })
                    }
                  >
                    删除
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="hint">
          {filter === 'done'
            ? '还没有成片。做完一条后会显示在这里，可回放、下载或删掉。'
            : filter === 'failed'
              ? '没有失败的任务。'
              : '还没有任何制作任务。'}
        </p>
      )}
      {error ? <div className="error">{error}</div> : null}
    </section>
  );
}
