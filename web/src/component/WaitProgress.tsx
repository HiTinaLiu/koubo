import {useEffect, useState} from 'react';

export type WaitStage = {
  label: string;
  state: string;
};

type Props = {
  title: string;
  message: string;
  progress: number;
  elapsedSec: number;
  stages: WaitStage[];
  hint?: string;
  sticky?: boolean;
};

export function formatElapsed(sec: number) {
  const total = Math.max(0, sec);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}小时${minutes}分${seconds.toString().padStart(2, '0')}秒`;
  if (minutes) return `${minutes}分${seconds.toString().padStart(2, '0')}秒`;
  return `${seconds}秒`;
}

export function WaitProgress({title, message, progress, elapsedSec, stages, hint, sticky}: Props) {
  const pct = Math.max(3, Math.min(99, progress || 0));
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    setStalled(false);
    const timer = window.setTimeout(() => setStalled(true), 1600);
    return () => window.clearTimeout(timer);
  }, [progress, message]);

  return (
    <div className={`progress-card wait-progress${sticky ? ' sticky' : ''}`} aria-live="polite">
      <div className="wait-head">
        <i className="spinner" aria-hidden />
        <div className="wait-copy">
          <b>{title}</b>
          <p>{message || '处理中…'}</p>
        </div>
        <div className="wait-meta">
          <span>{pct}%</span>
          <small>已等 {formatElapsed(elapsedSec)}</small>
        </div>
      </div>
      <div className={`progress-bar${stalled ? ' indeterminate' : ''}`}>
        <i style={{width: `${pct}%`}} />
      </div>
      {stages.length ? (
        <ol className={`progress-stages cols-${Math.min(3, stages.length)}`}>
          {stages.map((item) => (
            <li key={item.label} className={item.state}>
              {item.label}
            </li>
          ))}
        </ol>
      ) : null}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}
