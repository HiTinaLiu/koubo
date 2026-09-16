import {TtsProduceTab} from '../produce/TtsProduceTab';
import {TeleprompterProduceTab} from '../produce/TeleprompterProduceTab';
import {FinalMedia} from '../component/FinalMedia';
import {VoiceMedia} from '../component/VoiceMedia';
import {useStudio} from '../studio/StudioContext';
import {scriptReady} from '../studio/script';

export function ProducePage() {
  const {
    busy,
    working,
    view,
    produce,
    changeProduce,
    currentScript,
    goBack,
    goNext,
    resetJob,
    beginVoice,
    beginRender,
  } = useStudio();

  if (!view) {
    return (
      <section className="panel">
        <p className="hint">还没有成片任务。请先从输入页导入文字或录音。</p>
      </section>
    );
  }

  return (
    <section className="panel produce-step">
      <div className="produce-head">成片</div>
      <div className="choice-row produce-tabs">
        <button
          type="button"
          className={produce.mode !== 'teleprompter' ? 'btn' : 'btn ghost'}
          disabled={busy || working}
          onClick={() => changeProduce({...produce, mode: 'tts'})}
        >
          AI 配音
        </button>
        <button
          type="button"
          className={produce.mode === 'teleprompter' ? 'btn' : 'btn ghost'}
          disabled={busy || working}
          onClick={() => changeProduce({...produce, mode: 'teleprompter'})}
        >
          提词器重录
        </button>
      </div>
      {produce.mode === 'teleprompter' ? <TeleprompterProduceTab /> : <TtsProduceTab />}
      {view.job.status === 'failed' && view.job.error ? <div className="error">{view.job.error}</div> : null}
      {view.has_audio ? <VoiceMedia jobId={view.job.id} stamp={view.job.updated_at} /> : null}
      {view.has_final ? (
        <FinalMedia
          jobId={view.job.id}
          stamp={view.job.updated_at}
          orientation={produce.orientation}
          hasCover={view.has_cover}
        />
      ) : working ? (
        <p className="hint">
          {view.job.step_message?.includes('口播声音')
            ? '正在生成口播声音，请不要关页面。'
            : '成片还在生成。克隆配音、重录转码和渲染都会比较久，请不要关页面。'}
        </p>
      ) : produce.mode === 'teleprompter' ? (
        <p className="hint">
          {view.has_take ? '已有一版重录。可先导出声音试听，或直接生成成片。' : '还没有重录。打开摄像头，倒计时后对着提词器讲。'}
        </p>
      ) : (
        <p className="hint">
          {view.has_audio ? '已有口播声音。可再生成成片，或重新出一版声音。' : '还没有成片。可先只生成声音试听，或直接出成片。'}
        </p>
      )}
      <div className="actions produce-actions">
        <button className="btn ghost" disabled={busy || working} onClick={goBack}>
          上一步
        </button>
        {scriptReady(currentScript) ? (
          <>
            <button
              className="btn ghost"
              disabled={busy || working || (produce.mode === 'teleprompter' && !view.has_take)}
              onClick={() => void beginVoice()}
            >
              {view.has_audio ? '重新生成声音' : '只生成声音'}
            </button>
            <button
              className="btn ghost"
              disabled={busy || working || (produce.mode === 'teleprompter' && !view.has_take)}
              onClick={() => void beginRender()}
            >
              {view.has_final ? '重新生成成片' : '生成成片'}
            </button>
          </>
        ) : null}
        <button className="btn" disabled={busy || working || !scriptReady(currentScript)} onClick={() => void goNext()}>
          下一步
        </button>
        <button className="btn ghost" onClick={resetJob}>
          再做一条
        </button>
      </div>
    </section>
  );
}
