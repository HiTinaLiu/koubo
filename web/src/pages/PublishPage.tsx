import {jobCoverUrl} from '../api';
import {FinalMedia} from '../component/FinalMedia';
import {ReviewPanel} from '../component/ReviewPanel';
import {useStudio} from '../studio/StudioContext';

export function PublishPage() {
  const {busy, working, view, setView, produce, goBack, resetJob, openSettings, hasLlm} = useStudio();

  if (!view) {
    return (
      <section className="panel">
        <p className="hint">还没有可发布的任务。请先完成口播稿。</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <ReviewPanel
        jobId={view.job.id}
        initial={view.review}
        llmConfigured={hasLlm}
        coverUrl={view.has_cover ? jobCoverUrl(view.job.id, view.job.updated_at) : ''}
        onOpenSettings={() => openSettings('llm')}
        onReviewed={(review) => setView((current) => (current ? {...current, review} : current))}
      />
      {view.has_final ? (
        <FinalMedia
          jobId={view.job.id}
          stamp={view.job.updated_at}
          orientation={produce.orientation}
          hasCover={view.has_cover}
        />
      ) : (
        <p className="hint">成片还没有导出。可回到上一步生成，文案包可以先复制。</p>
      )}
      <div className="actions">
        <button className="btn ghost" disabled={busy || working} onClick={goBack}>
          上一步
        </button>
        <button className="btn ghost" onClick={resetJob}>
          再做一条
        </button>
      </div>
    </section>
  );
}
