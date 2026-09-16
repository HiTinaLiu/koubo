import {REWRITE_GENRES, REWRITE_PLATFORMS} from '../rewrite';
import type {RewriteOptions} from '../rewrite';

export function RewritePicker({
  options,
  disabled,
  llmConfigured,
  onChange,
  onOpenSettings,
}: {
  options: RewriteOptions;
  disabled: boolean;
  llmConfigured: boolean;
  onChange: (next: RewriteOptions) => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="rewrite-picker">
      <div>
        <div className="produce-head">改稿主题</div>
        <div className="chip-grid">
          {REWRITE_GENRES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={options.genre === item.id ? 'chip on' : 'chip'}
              disabled={disabled}
              onClick={() => onChange({...options, genre: item.id})}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="produce-head">发布平台</div>
        <div className="chip-grid">
          {REWRITE_PLATFORMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={options.platform === item.id ? 'chip on' : 'chip'}
              disabled={disabled}
              onClick={() => onChange({...options, platform: item.id})}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">
        {llmConfigured
          ? 'AI 改稿是可选项：会先按主题和平台规划结构，再生成可朗读正文。直接点「下一步」则用原文进口播稿。'
          : '还没配置大模型，「AI 改稿」不可用。点右上角齿轮添加 DeepSeek / 通义等 Key，或不改稿直接「下一步」用原文成片。'}
      </p>
      {!llmConfigured ? (
        <button className="linkish" type="button" onClick={onOpenSettings}>
          去配置大模型
        </button>
      ) : null}
    </div>
  );
}
