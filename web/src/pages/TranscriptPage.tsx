import {RewritePicker} from '../component/RewritePicker';
import {useStudio} from '../studio/StudioContext';

export function TranscriptPage() {
  const {
    busy,
    working,
    view,
    setView,
    setText,
    transcriptText,
    rewrite,
    changeRewrite,
    hasLlm,
    goBack,
    goNext,
    startAnalyze,
    openSettings,
    nextHint,
  } = useStudio();

  return (
    <section className="panel">
      <label>
        <span>原始口播文字，可改。原文可用即可进入口播稿，AI 改稿是可选项。</span>
        <textarea
          value={transcriptText}
          disabled={busy || working}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            setView((currentView) =>
              currentView?.transcript
                ? {
                    ...currentView,
                    transcript: {...currentView.transcript, text: next},
                  }
                : currentView,
            );
          }}
        />
      </label>
      <RewritePicker
        options={rewrite}
        disabled={busy || working}
        llmConfigured={hasLlm}
        onChange={changeRewrite}
        onOpenSettings={() => openSettings('llm')}
      />
      <div className="actions">
        <button className="btn ghost" disabled={busy || working} onClick={goBack}>
          上一步
        </button>
        <button className="btn ghost" disabled={busy || working || !view || !transcriptText.trim()} onClick={startAnalyze}>
          AI 改稿
        </button>
        <button className="btn" disabled={busy || working || !transcriptText.trim()} onClick={() => void goNext()}>
          下一步
        </button>
      </div>
      {nextHint ? <p className="hint">{nextHint}</p> : null}
    </section>
  );
}
