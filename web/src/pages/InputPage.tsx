import {createAudioJob} from '../api';
import {Recorder} from '../component/Recorder';
import {useStudio} from '../studio/StudioContext';
import {JobWait} from '../component/JobWait';

export function InputPage() {
  const {
    busy,
    working,
    waiting,
    text,
    setText,
    produce,
    wrap,
    goNext,
    nextHint,
    remindNeedEngine,
    setAudioPending,
  } = useStudio();

  if (waiting) {
    return (
      <section className="panel">
        <JobWait mode="panel" />
      </section>
    );
  }

  function startUpload(file: Blob | File, name: string, ok: string) {
    if (remindNeedEngine(['ffmpeg', 'whisper-base'], name.includes('recording') ? '录音转写' : '音频转写')) return;
    setAudioPending(true);
    void wrap(() => createAudioJob(file, name, produce.voice), ok).finally(() => {
      setAudioPending(false);
    });
  }

  return (
    <section className="panel">
      <div className="row">
        <Recorder
          disabled={busy || working}
          stopLabel="停止并上传"
          onRecorded={(blob) => startUpload(blob, 'recording.webm', '录音已上传，开始转成文字。')}
        />
        <div>
          <label>
            <span>或直接贴文字</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="嗯那个就是说今天想讲一下，短视频开头一定要先抛结论……"
            />
          </label>
          <div className="actions">
            <label className="btn ghost">
              上传音频
              <input
                type="file"
                accept="audio/*,video/mp4"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) startUpload(file, file.name, '音频已上传，开始转成文字。');
                }}
              />
            </label>
          </div>
          <p className="hint">可上传 webm / mp3 / m4a / wav，最长约 90 分钟。长录音只转文字，改稿时再收成一条短口播。</p>
        </div>
      </div>
      <div className="actions">
        <button className="btn" disabled={busy || working || !text.trim()} onClick={() => void goNext()}>
          下一步
        </button>
      </div>
      {nextHint ? <p className="hint">{nextHint}</p> : null}
    </section>
  );
}
