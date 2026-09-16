import {useEffect, useState} from 'react';
import {getModels, installModel, removeModel} from '../api';
import type {EngineStatus, ModelPackage} from '../types';

function statusLabel(item: ModelPackage) {
  if (item.status === 'installing') return `下载中 ${item.progress}%`;
  if (item.installed) return '已就绪';
  if (item.ready && !item.torch) return '权重已在，还差运行库';
  if (item.status === 'error') return '失败';
  return item.optional ? '未安装（可选）' : '未安装';
}

export function ModelStore({
  compact,
  only,
  onChanged,
}: {
  compact?: boolean;
  only?: string;
  onChanged?: () => void;
}) {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    const next = await getModels();
    setEngine(next);
    return next;
  }

  useEffect(() => {
    void refresh().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    const installing = engine?.packages.some((item) => item.status === 'installing');
    if (!installing) return undefined;
    const timer = window.setInterval(() => {
      void refresh()
        .then((next) => {
          if (next.packages.some((item) => item.installed)) onChanged?.();
        })
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [engine?.packages.some((item) => item.status === 'installing')]);

  async function install(id: string) {
    setBusy(id);
    setError('');
    try {
      setEngine(await installModel(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败');
    } finally {
      setBusy('');
    }
  }

  async function remove(id: string) {
    if (!window.confirm('卸载这个可选组件？下次用还要重新下载。')) return;
    setBusy(id);
    setError('');
    try {
      setEngine(await removeModel(id));
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '卸载失败');
    } finally {
      setBusy('');
    }
  }

  const packages = (engine?.packages || []).filter((item) => !only || item.id === only);
  const tools = packages.filter((item) => item.kind === 'tool');
  const models = packages.filter((item) => item.kind !== 'tool');
  const source = engine?.cdn
    ? `国内 CDN：${engine.cdn}`
    : `国内镜像：${engine?.hf_endpoint || 'https://hf-mirror.com'}`;

  function cards(items: ModelPackage[]) {
    return (
      <div className="llm-profiles">
        {items.map((item) => (
          <article
            key={item.id}
            id={`component-${item.id}`}
            className={`llm-card${item.installed ? ' active' : ''}${!item.installed && !item.optional ? ' missing' : ''}`}
          >
            <div>
              <b>
                {item.name}
                {item.size_hint ? ` · ${item.size_hint}` : ''}
              </b>
              <p>{item.summary}</p>
              <p>
                {statusLabel(item)}
                {item.message ? ` · ${item.message}` : ''}
              </p>
              {item.status === 'installing' ? (
                <div className="model-bar">
                  <span style={{width: `${Math.max(4, item.progress)}%`}} />
                </div>
              ) : null}
            </div>
            <div className="actions">
              {item.installed ? (
                item.optional && engine?.packaged ? (
                  <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => void remove(item.id)}>
                    卸载
                  </button>
                ) : (
                  <button type="button" className="btn ghost" disabled>
                    已就绪
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={Boolean(busy) || item.status === 'installing'}
                  onClick={() => void install(item.id)}
                >
                  {item.status === 'installing' || busy === item.id ? '安装中…' : '安装'}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div id="local-components" className={compact ? 'model-store compact' : 'model-store'}>
      {compact ? null : (
        <>
          <div className="produce-head">本地组件</div>
          <p className="hint">
            转写、抽音和成片依赖下面这些组件。安装包一般会带齐；若缺失，可在这里下载安装。克隆配音从{source}
            按需下载。
          </p>
        </>
      )}
      {tools.length ? (
        <>
          {compact ? null : <p className="hint">系统组件</p>}
          {cards(tools)}
        </>
      ) : null}
      {models.length ? (
        <>
          {compact || !tools.length ? null : <p className="hint">模型组件</p>}
          {cards(models)}
        </>
      ) : null}
      {error ? <p className="hint danger">{error}</p> : null}
    </div>
  );
}
