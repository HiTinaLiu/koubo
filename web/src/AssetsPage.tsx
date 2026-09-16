import {useEffect, useMemo, useState} from 'react';
import {assetFileUrl, createAsset, deleteAsset, listAssets} from './api';
import type {AssetItem, AssetKind} from './types';

type Filter = 'all' | AssetKind;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleString('zh-CN');
  } catch {
    return value;
  }
}

function kindLabel(kind: AssetKind) {
  if (kind === 'image') return '图片';
  if (kind === 'video') return '视频';
  return '配乐';
}

export function AssetsPage({
  onChanged,
  onUseBackground,
  onUseMusic,
}: {
  onChanged: () => void;
  onUseBackground: (id: string) => void;
  onUseMusic: (id: string) => void;
}) {
  const [items, setItems] = useState<AssetItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.kind === filter)),
    [items, filter],
  );

  async function refresh() {
    const payload = await listAssets();
    setItems(payload.items);
  }

  useEffect(() => {
    void refresh()
      .catch((err: Error) => setError(err.message))
      .finally(() => setReady(true));
  }, []);

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

  async function upload(file: File) {
    await wrap(async () => {
      await createAsset(file, name.trim() || file.name);
      setName('');
      await refresh();
      onChanged();
    });
  }

  return (
    <section className="panel assets-page">
      <p className="hint">
        本地素材只存在这台电脑。图片或视频可做成片背景；视频里的原声会当成配乐。单独上传的配乐会压在口播下面。成片时在「成片设置」里选用。
      </p>
      <div className="library-head">
        <label>
          <span>素材名称（可选）</span>
          <input
            type="text"
            value={name}
            placeholder="不填就用文件名"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="actions" style={{marginTop: 0}}>
          <label className="btn">
            上传素材
            <input
              type="file"
              hidden
              disabled={busy}
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/mp4,.m4a,.mov"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void upload(file);
              }}
            />
          </label>
        </div>
      </div>

      <div className="choice-row" style={{marginBottom: 16}}>
        {(
          [
            ['all', '全部'],
            ['image', '图片'],
            ['video', '视频'],
            ['music', '配乐'],
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

      {!ready ? (
        <p className="hint">正在读取素材…</p>
      ) : visible.length ? (
        <div className="asset-grid">
          {visible.map((item) => (
            <article key={item.id} className="asset-card">
              {item.kind === 'image' ? (
                <img className="asset-thumb" src={assetFileUrl(item.id)} alt={item.name} />
              ) : item.kind === 'video' ? (
                <video
                  className="asset-thumb video"
                  src={assetFileUrl(item.id)}
                  controls
                  playsInline
                  preload="metadata"
                />
              ) : (
                <div className="asset-thumb audio">
                  <audio src={assetFileUrl(item.id)} controls />
                </div>
              )}
              <b>{item.name}</b>
              <p>
                {kindLabel(item.kind)} · {formatSize(item.size)} · {formatTime(item.created_at)}
              </p>
              <div className="actions asset-actions">
                {item.kind === 'music' ? (
                  <button type="button" className="btn" disabled={busy} onClick={() => onUseMusic(item.id)}>
                    用作配乐
                  </button>
                ) : (
                  <button type="button" className="btn" disabled={busy} onClick={() => onUseBackground(item.id)}>
                    用作背景
                  </button>
                )}
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() =>
                    void wrap(async () => {
                      if (!window.confirm('删除这份素材？已生成的成片不会被改。')) return;
                      await deleteAsset(item.id);
                      await refresh();
                      onChanged();
                    })
                  }
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="hint">还没有本地素材。上传一张封面图、一段空镜，或一首配乐即可。</p>
      )}
      {error ? <div className="error">{error}</div> : null}
    </section>
  );
}
