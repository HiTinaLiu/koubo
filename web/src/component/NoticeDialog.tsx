import {useEffect} from 'react';

export type NoticeKind = 'ok' | 'error' | 'warn';

export type NoticeState = {
  kind: NoticeKind;
  title: string;
  message: string;
  actionLabel?: string;
  secondaryLabel?: string;
  go?: 'llm' | 'components';
};

export function NoticeDialog({
  kind,
  title,
  message,
  actionLabel,
  secondaryLabel,
  onClose,
  onAction,
  onSecondary,
}: NoticeState & {
  onClose: () => void;
  onAction?: () => void;
  onSecondary?: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-mask" role="presentation" onClick={onClose}>
      <div
        className={`dialog ${kind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-title"
        onClick={(event) => event.stopPropagation()}
      >
        <b id="notice-title">{title}</b>
        <p>{message}</p>
        <div className="actions">
          {actionLabel && onAction ? (
            <button type="button" className="btn" onClick={onAction}>
              {actionLabel}
            </button>
          ) : (
            <button type="button" className="btn" onClick={onClose}>
              知道了
            </button>
          )}
          {actionLabel ? (
            <button type="button" className="btn ghost" onClick={onClose}>
              稍后再说
            </button>
          ) : null}
          {secondaryLabel && onSecondary ? (
            <button type="button" className="btn ghost" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
