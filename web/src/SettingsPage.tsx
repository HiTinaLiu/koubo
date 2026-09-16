import {useEffect, useMemo, useState} from 'react';
import {activateLlm, cleanupWorkspace, deleteLlm, getSettings, resetSettings, saveSettings, testSettings} from './api';
import {ModelStore} from './component/ModelStore';
import {NoticeDialog, type NoticeState} from './component/NoticeDialog';
import type {LlmProfile, LlmProvider, PromptItem, SettingsView} from './types';

function toMap(items: PromptItem[]) {
  return Object.fromEntries(items.map((item) => [item.id, item.text]));
}

function PromptEditor({
  item,
  disabled,
  onChange,
  onReset,
}: {
  item: PromptItem;
  disabled: boolean;
  onChange: (text: string) => void;
  onReset: () => void;
}) {
  return (
    <label className="prompt-card">
      <span>
        {item.name}
        {item.dirty ? ' · 已改' : ''}
        <button type="button" className="linkish" disabled={disabled || !item.dirty} onClick={onReset}>
          恢复默认
        </button>
      </span>
      {item.hint ? <small>{item.hint}</small> : null}
      <textarea value={item.text} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function SettingsPage({
  onChanged,
  onModelsChanged,
  onRestartBackend,
  restarting,
  focus,
}: {
  onChanged: (next: {configured: boolean; label: string}) => void;
  onModelsChanged?: () => void;
  onRestartBackend?: () => void;
  restarting?: boolean;
  focus?: 'llm' | 'components' | '';
}) {
  const [view, setView] = useState<SettingsView | null>(null);
  const [editingId, setEditingId] = useState('');
  const [alias, setAlias] = useState('');
  const [provider, setProvider] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1');
  const [model, setModel] = useState('deepseek-v4-flash');
  const [apiKey, setApiKey] = useState('');
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [genres, setGenres] = useState<PromptItem[]>([]);
  const [platforms, setPlatforms] = useState<PromptItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<NoticeState | null>(null);

  const current = useMemo(
    () => view?.providers.find((item) => item.id === provider) || null,
    [view, provider],
  );

  function apply(next: SettingsView, profile?: LlmProfile | null) {
    setView(next);
    setPrompts(next.prompts);
    setGenres(next.genres);
    setPlatforms(next.platforms);
    onChanged({configured: next.configured, label: next.llm.label});
    const selected = profile || next.profiles.find((item) => item.active) || null;
    if (selected) {
      fillForm(selected);
      return;
    }
    clearForm();
  }

  function fillForm(item: LlmProfile) {
    setEditingId(item.id);
    setAlias(item.alias);
    setProvider(item.provider || 'custom');
    setBaseUrl(item.base_url);
    setModel(item.model);
    setApiKey('');
  }

  function clearForm() {
    setEditingId('');
    setAlias('');
    setProvider('deepseek');
    setBaseUrl('https://api.deepseek.com/v1');
    setModel('deepseek-v4-flash');
    setApiKey('');
  }

  useEffect(() => {
    void getSettings()
      .then((next) => apply(next))
      .catch((err: Error) => setFlash({kind: 'error', title: '读取失败', message: err.message}));
  }, []);

  useEffect(() => {
    if (!view || !focus) return;
    const id = focus === 'components' ? 'local-components' : 'llm-config';
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({behavior: 'smooth', block: 'start'});
    }, 50);
    return () => window.clearTimeout(timer);
  }, [view, focus]);

  function pickProvider(item: LlmProvider) {
    setProvider(item.id);
    if (item.base_url) setBaseUrl(item.base_url);
    if (item.models.length && !item.models.includes(model)) setModel(item.models[0]);
  }

  function ok(message: string, title = '已保存') {
    setFlash({kind: 'ok', title, message});
  }

  function fail(err: unknown, title: string) {
    setFlash({
      kind: 'error',
      title,
      message: err instanceof Error ? err.message : title,
    });
  }

  function patchList(list: PromptItem[], id: string, text: string) {
    return list.map((item) =>
      item.id === id ? {...item, text, dirty: text.trim() !== item.default.trim()} : item,
    );
  }

  async function persist(activate: boolean) {
    setBusy(true);
    try {
      const next = await saveSettings({
        llm: {
          id: editingId || undefined,
          name: alias,
          provider,
          base_url: baseUrl,
          model,
          api_key: apiKey,
          activate,
        },
        prompts: toMap(prompts),
        genres: toMap(genres),
        platforms: toMap(platforms),
      });
      const known = new Set((view?.profiles || []).map((item) => item.id));
      const saved =
        next.profiles.find((item) => item.id === editingId) ||
        next.profiles.find((item) => !known.has(item.id)) ||
        next.profiles.find((item) => item.active) ||
        next.profiles[next.profiles.length - 1] ||
        null;
      apply(next, saved);
      const name = saved?.name || next.llm.name || '这套大模型';
      ok(
        activate
          ? `已保存 Key，并切换为当前使用。\n${name}`
          : `已保存 Key 到本机，未切换使用。\n${name}`,
        activate ? '已保存并使用' : '已仅保存',
      );
    } catch (err) {
      fail(err, '保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function persistPrompts() {
    setBusy(true);
    try {
      apply(await saveSettings({prompts: toMap(prompts), genres: toMap(genres), platforms: toMap(platforms)}), view?.profiles.find((item) => item.id === editingId));
      ok('提示词已保存。');
    } catch (err) {
      fail(err, '保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function restore(scope: string) {
    setBusy(true);
    try {
      apply(await resetSettings(scope), view?.profiles.find((item) => item.id === editingId));
      ok(scope === 'all' ? '提示词已全部恢复默认。' : '已恢复该项默认提示词。', '已恢复');
    } catch (err) {
      fail(err, '恢复失败');
    } finally {
      setBusy(false);
    }
  }

  async function ping() {
    setBusy(true);
    try {
      const result = await testSettings({base_url: baseUrl, model, api_key: apiKey});
      ok(`${result.model}${result.reply ? `\n${result.reply}` : ''}`, '连接成功');
    } catch (err) {
      fail(err, '连接失败');
    } finally {
      setBusy(false);
    }
  }

  async function useProfile(id: string) {
    setBusy(true);
    try {
      const next = await activateLlm(id);
      apply(next, next.profiles.find((item) => item.id === id));
      ok(next.llm.label || next.llm.name, '已切换');
    } catch (err) {
      fail(err, '切换失败');
    } finally {
      setBusy(false);
    }
  }

  async function removeProfile(id: string) {
    if (!window.confirm('删除这套大模型？Key 会一起从本机清掉。')) return;
    setBusy(true);
    try {
      const next = await deleteLlm(id);
      apply(next);
      ok('这套大模型已从本机删除。', '已删除');
    } catch (err) {
      fail(err, '删除失败');
    } finally {
      setBusy(false);
    }
  }

  if (!view) {
    return (
      <section className="panel">
        <p className="hint">正在读取配置…</p>
        {flash ? <NoticeDialog {...flash} onClose={() => setFlash(null)} /> : null}
      </section>
    );
  }

  const domestic = view.providers.filter((item) => item.region === 'cn');
  const overseas = view.providers.filter((item) => item.region === 'intl');
  const custom = view.providers.find((item) => item.region === 'custom');
  const editing = view.profiles.find((item) => item.id === editingId);

  return (
    <section className="panel settings-page">
      <div className="produce-head">本机引擎</div>
      <p className="hint">
        配音或成片卡住、页面一直转圈时，可强制结束后端再拉起。进行中的任务会被标成失败，需要重试。
        报错会写入项目目录 logs/server.log（安装包在用户数据目录 logs）。清理占用空间会清空这些日志，以及临时文件、试听缓存和渲染中间拷贝；成片、文稿库、素材、模型和大模型 Key 会留下。
        {window.koubo?.restartApi ? ' 桌面端会结束占用 8777 端口的进程。' : ' 浏览器里若后端已完全卡死，请到运行 uvicorn 的终端操作。'}
      </p>
      <div className="actions" style={{marginTop: 0}}>
        <button
          type="button"
          className="btn"
          disabled={busy || restarting}
          onClick={() => {
            if (!window.confirm('强制重启后端？进行中的识别、改稿、成片都会中断。')) return;
            onRestartBackend?.();
          }}
        >
          {restarting ? '正在重启…' : '强制重启后端'}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy || restarting}
          onClick={() => {
            if (!window.confirm('清理日志、临时文件和可重建的缓存？成片、文稿库、素材、模型和大模型 Key 不会删。')) return;
            setBusy(true);
            void cleanupWorkspace()
              .then((next) => ok(next.message, '已清理'))
              .catch((err) => fail(err, '清理失败'))
              .finally(() => setBusy(false));
          }}
        >
          清理占用空间
        </button>
      </div>

      <ModelStore onChanged={onModelsChanged} />

      <div className="produce-head" id="llm-config">
        当前大模型
      </div>
      <div className={`llm-now${view.configured ? ' on' : ''}`}>
        <b>{view.configured ? view.llm.name : '还没选用大模型'}</b>
        <p>
          {view.configured
            ? `${view.llm.provider_name} · ${view.llm.model} · ${view.llm.api_key_hint}`
            : '改稿会走规则草稿。填 Key 后可「仅保存」存到本机，或「保存并使用」立即启用。'}
        </p>
      </div>

      <div className="settings-split">
        <div className="produce-head">已保存的大模型</div>
        <button type="button" className="linkish" disabled={busy} onClick={clearForm}>
          新增一套
        </button>
      </div>
      <p className="hint">可以存多家 Key，改稿只走下面标成「使用中」的那一套。Key 只在本机 data/settings.json，不会回显。</p>
      {view.profiles.length ? (
        <div className="llm-profiles">
          {view.profiles.map((item) => (
            <article key={item.id} className={`llm-card${item.active ? ' active' : ''}`}>
              <div>
                <b>
                  {item.name}
                  {item.active ? ' · 使用中' : ''}
                </b>
                <p>
                  {item.model || '未选模型'}
                  {item.api_key_set ? ` · ${item.api_key_hint}` : ' · 还没填 Key'}
                </p>
              </div>
              <div className="actions">
                <button type="button" className="btn ghost" disabled={busy} onClick={() => fillForm(item)}>
                  编辑
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy || item.active || !item.api_key_set}
                  onClick={() => void useProfile(item.id)}
                >
                  使用这个
                </button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => void removeProfile(item.id)}>
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="hint">还没有保存过。选厂商、填 Key；「仅保存」只存本地，「保存并使用」会立即启用。</p>
      )}

      <div className="produce-head">{editingId ? `编辑：${editing?.name || '这套大模型'}` : '新增一套大模型'}</div>
      <div className="produce-head">国内常用</div>
      <div className="chip-grid">
        {domestic.map((item) => (
          <button
            key={item.id}
            type="button"
            className={provider === item.id ? 'chip on' : 'chip'}
            disabled={busy}
            onClick={() => pickProvider(item)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="produce-head">国外常用</div>
      <div className="chip-grid">
        {overseas.map((item) => (
          <button
            key={item.id}
            type="button"
            className={provider === item.id ? 'chip on' : 'chip'}
            disabled={busy}
            onClick={() => pickProvider(item)}
          >
            {item.name}
          </button>
        ))}
        {custom ? (
          <button
            type="button"
            className={provider === 'custom' ? 'chip on' : 'chip'}
            disabled={busy}
            onClick={() => pickProvider(custom)}
          >
            自定义
          </button>
        ) : null}
      </div>
      {current ? <p className="hint">{current.hint}</p> : null}
      <div className="fields">
        <label>
          <span>备注名，可空</span>
          <input
            value={alias}
            disabled={busy}
            placeholder="例如：DeepSeek 改稿"
            onChange={(event) => setAlias(event.target.value)}
          />
        </label>
        <label>
          <span>接口地址</span>
          <input value={baseUrl} disabled={busy} onChange={(event) => setBaseUrl(event.target.value)} />
        </label>
        <label>
          <span>模型</span>
          {current?.models.length ? (
            <select value={model} disabled={busy} onChange={(event) => setModel(event.target.value)}>
              {current.models.includes(model) ? null : <option value={model}>{model}</option>}
              {current.models.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          ) : (
            <input value={model} disabled={busy} onChange={(event) => setModel(event.target.value)} />
          )}
        </label>
        <label>
          <span>API Key</span>
          <input
            type="password"
            value={apiKey}
            disabled={busy}
            autoComplete="off"
            placeholder={editing?.api_key_set ? '已保存，留空则不改' : 'sk-…'}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
      </div>
      <div className="actions">
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void ping()}>
          测试连接
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          title="只保存 Key 到本地（不使用该模型）"
          onClick={() => void persist(false)}
        >
          仅保存
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          title="保存 Key 并使用当前模型"
          onClick={() => void persist(true)}
        >
          保存并使用
        </button>
      </div>
      <p className="hint">
        「仅保存」只把 Key 存到本机，不切换当前模型；「保存并使用」会保存并立即用这套做改稿。
      </p>

      <div className="settings-split">
        <div className="produce-head">系统提示词</div>
        <button type="button" className="linkish" disabled={busy} onClick={() => void restore('prompts')}>
          系统提示词全部恢复默认
        </button>
      </div>
      <p className="hint">改稿、字幕重点词、发布检查都会用这里的提示词。单项恢复后请再点保存。</p>
      {prompts.map((item) => (
        <PromptEditor
          key={item.id}
          item={item}
          disabled={busy}
          onChange={(text) => setPrompts((currentList) => patchList(currentList, item.id, text))}
          onReset={() =>
            setPrompts((currentList) =>
              currentList.map((row) => (row.id === item.id ? {...row, text: row.default, dirty: false} : row)),
            )
          }
        />
      ))}

      <div className="settings-split">
        <div className="produce-head">主题约束</div>
        <button type="button" className="linkish" disabled={busy} onClick={() => void restore('genres')}>
          主题约束全部恢复默认
        </button>
      </div>
      <p className="hint">会拼进改稿的用户提示里，约束「规划架构」和「生成正文」。</p>
      {genres.map((item) => (
        <PromptEditor
          key={item.id}
          item={item}
          disabled={busy}
          onChange={(text) => setGenres((currentList) => patchList(currentList, item.id, text))}
          onReset={() =>
            setGenres((currentList) =>
              currentList.map((row) => (row.id === item.id ? {...row, text: row.default, dirty: false} : row)),
            )
          }
        />
      ))}

      <div className="settings-split">
        <div className="produce-head">平台约束</div>
        <button type="button" className="linkish" disabled={busy} onClick={() => void restore('platforms')}>
          平台约束全部恢复默认
        </button>
      </div>
      {platforms.map((item) => (
        <PromptEditor
          key={item.id}
          item={item}
          disabled={busy}
          onChange={(text) => setPlatforms((currentList) => patchList(currentList, item.id, text))}
          onReset={() =>
            setPlatforms((currentList) =>
              currentList.map((row) => (row.id === item.id ? {...row, text: row.default, dirty: false} : row)),
            )
          }
        />
      ))}

      <div className="actions">
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void restore('all')}>
          全部提示词恢复默认
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void persistPrompts()}>
          保存提示词
        </button>
      </div>
      {flash ? <NoticeDialog {...flash} onClose={() => setFlash(null)} /> : null}
    </section>
  );
}
