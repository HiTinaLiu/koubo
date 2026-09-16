import {useRef, useState} from 'react';
import {cloneRefUrl, createClone, deleteClone, previewVoice} from './api';
import {ModelStore} from './component/ModelStore';
import {Recorder} from './component/Recorder';
import type {SparkStatus, VoiceItem} from './types';

const FALLBACK_CLONE_PROMPT =
  '大家好，我是口播场记。今天用我自己的声音做一条短视频。开头三秒先抛结论，不要先介绍自己。把方法讲清楚，最后明确让人关注。';

type CloneMode = 'self' | 'other';

export function VoicePage({
  voices,
  spark,
  currentVoice,
  onPicked,
  onChanged,
}: {
  voices: VoiceItem[];
  spark: SparkStatus | null;
  currentVoice: string;
  onPicked: (id: string) => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<CloneMode>('self');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [otherText, setOtherText] = useState('');
  const clonePrompt = spark?.clone_prompt || FALLBACK_CLONE_PROMPT;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewing, setPreviewing] = useState('');
  const [previewNote, setPreviewNote] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const edge = voices.filter((item) => item.engine !== 'spark');
  const presets = voices.filter((item) => item.engine === 'spark' && item.kind !== 'clone');
  const clones = voices.filter((item) => item.engine === 'spark' && item.kind === 'clone');
  const promptText = mode === 'self' ? clonePrompt : otherText.trim();
  const canSubmit = Boolean(name.trim() && file && promptText.length >= 8);

  async function playUrl(url: string, id: string) {
    audioRef.current?.pause();
    setError('');
    setPreviewing(id);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? '参考音不存在，请重新录一段再创建克隆。'
            : `播放失败（${response.status}）`,
        );
      }
      const blob = await response.blob();
      if (blob.size < 800) {
        throw new Error('参考音文件几乎是空的，多半录到了无声设备。请改选麦克风后重录。');
      }
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(objectUrl);
        setPreviewing('');
        setPreviewNote('');
      };
      audio.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setPreviewing('');
        setPreviewNote('');
        setError('试听音频无法播放。');
      };
      await audio.play();
    } catch (err) {
      setPreviewing('');
      setPreviewNote('');
      setError(err instanceof Error ? err.message : '试听失败');
    }
  }

  async function playSynth(item: VoiceItem) {
    audioRef.current?.pause();
    setError('');
    setPreviewing(item.id);
    setPreviewNote(
      item.engine === 'spark'
        ? '本机 CPU 合成中：首次还要加载模型，通常要一两分钟，请稍候…'
        : '',
    );
    try {
      const blob = await previewVoice(item.id);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPreviewing('');
        setPreviewNote('');
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setPreviewing('');
        setPreviewNote('');
        setError('试听音频无法播放。');
      };
      setPreviewNote('');
      await audio.play();
    } catch (err) {
      setPreviewing('');
      setPreviewNote('');
      setError(err instanceof Error ? err.message : '试听失败');
    }
  }

  function playRef(id: string) {
    void playUrl(cloneRefUrl(id), `ref:${id}`);
  }

  function useRecording(blob: Blob) {
    const ext = blob.type.includes('webm') ? 'webm' : 'wav';
    setFile(new File([blob], `clone-ref.${ext}`, {type: blob.type || 'audio/webm'}));
  }

  function switchMode(next: CloneMode) {
    setMode(next);
    setFile(null);
    setError('');
    if (next === 'other') setOtherText('');
  }

  async function submitClone() {
    if (!file || !name.trim() || promptText.length < 8) return;
    setBusy(true);
    setError('');
    try {
      const created = await createClone(name.trim(), file, promptText, mode);
      setName('');
      setFile(null);
      setOtherText('');
      onChanged();
      onPicked(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '克隆失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel voice-page">
      <div className="produce-head">声音库</div>
      <p className="hint">
        Edge-TTS 是在线普通配音，快。Spark-TTS 可直接用内置男女声，也可以克隆本人或他人声音：上传音视频并填写对应文字即可。克隆组件从国内镜像按需下载，不打进安装包。
      </p>
      <div className="spark-box">
        <b>Spark-TTS 克隆</b>
        <p>
          {spark?.weights && spark?.torch !== false
            ? '权重已就绪。首次合成会加载模型，之后可以复用。'
            : spark?.note || '还没安装克隆配音组件，克隆和内置声无法合成。'}
          {spark?.error ? ` ${spark.error}` : ''}
        </p>
        {spark?.weights && spark?.torch !== false ? null : (
          <ModelStore compact only="spark-tts" onChanged={onChanged} />
        )}

        <div className="choice-row">
          <button type="button" className={mode === 'self' ? 'btn' : 'btn ghost'} disabled={busy} onClick={() => switchMode('self')}>
            克隆自己
          </button>
          <button type="button" className={mode === 'other' ? 'btn' : 'btn ghost'} disabled={busy} onClick={() => switchMode('other')}>
            克隆他人
          </button>
        </div>

        <label>
          <span>声音名称</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={mode === 'other' ? '例如：某某老师' : '我的口播'}
          />
        </label>

        {mode === 'self' ? (
          <>
            <p className="hint">对着下面固定稿朗读 8–12 秒；先确认麦克风正确，音量条会跟着动，再停止创建。</p>
            <div className="clone-script">{clonePrompt}</div>
            <Recorder
              disabled={busy}
              startLabel="朗读并录音"
              stopLabel="停止并用作参考音"
              onRecorded={useRecording}
            />
            <label className="btn ghost">
              {file ? `已选参考音 · ${file.name}` : '或上传 6–15 秒参考音 / 视频'}
              <input
                type="file"
                accept="audio/*,video/*"
                hidden
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </>
        ) : (
          <>
            <p className="hint">
              上传他人清晰口播音视频（建议 6–20 秒），并原样填写这段里说的文字。文字越准，克隆越稳。
            </p>
            <label className="btn ghost">
              {file ? `已选材料 · ${file.name}` : '上传音频 / 视频'}
              <input
                type="file"
                accept="audio/*,video/*"
                hidden
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label>
              <span>对应文字（材料里实际说的内容）</span>
              <textarea
                rows={4}
                value={otherText}
                disabled={busy}
                placeholder="把音视频里说的话按原样写下来，不要改写成别的稿。"
                onChange={(event) => setOtherText(event.target.value)}
              />
            </label>
          </>
        )}

        <div className="actions">
          <button className="btn" disabled={busy || !canSubmit} onClick={() => void submitClone()}>
            {busy ? '处理中…' : mode === 'other' ? '创建他人克隆声音' : '创建克隆声音'}
          </button>
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {previewNote ? <p className="hint">{previewNote}</p> : null}

      <div className="produce-head">Spark 内置</div>
      <p className="hint">不需要参考音。女声：星晓 / 星柔 / 星清 / 星夏 / 星利；男声：星朗 / 星沉 / 星健 / 星播 / 星浑。本机 CPU 首次试听要加载模型，会慢一些。</p>
      <div className="voice-list">
        {presets.map((item) => (
          <div key={item.id} className={`voice-item ${currentVoice === item.id ? 'on' : ''}`}>
            <div>
              <b>{item.name}</b>
              <p>
                {item.gender} · {item.style}
              </p>
            </div>
            <div className="actions">
              <button
                className="btn ghost"
                type="button"
                onClick={() => void playSynth(item)}
                disabled={Boolean(previewing)}
              >
                {previewing === item.id ? '合成中…' : '试听'}
              </button>
              <button className="btn" type="button" onClick={() => onPicked(item.id)}>
                选用
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="produce-head">克隆音色</div>
      {clones.length === 0 ? (
        <p className="hint">还没有克隆声音。可克隆自己，或用他人音视频 + 对应文字创建。</p>
      ) : (
        <p className="hint">
          「听参考音」立刻播放你上传/录下的原声；「合成试听」才会跑 Spark，本机 CPU 首次通常要一两分钟。
        </p>
      )}
      <div className="voice-list">
        {clones.map((item) => (
          <div key={item.id} className={`voice-item ${currentVoice === item.id ? 'on' : ''}`}>
            <div>
              <b>{item.name}</b>
              <p>
                Spark 克隆 · {item.source === 'other' || item.style === '他人' ? '他人' : '本人'} · {item.id}
              </p>
            </div>
            <div className="actions">
              <button
                className="btn ghost"
                type="button"
                onClick={() => playRef(item.id)}
                disabled={Boolean(previewing)}
              >
                {previewing === `ref:${item.id}` ? '播放中…' : '听参考音'}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => void playSynth(item)}
                disabled={Boolean(previewing)}
              >
                {previewing === item.id ? '合成中…' : '合成试听'}
              </button>
              <button className="btn" type="button" onClick={() => onPicked(item.id)}>
                选用
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => void deleteClone(item.id).then(onChanged).catch((err: Error) => setError(err.message))}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="produce-head">普通配音</div>
      <div className="voice-list">
        {edge.map((item) => (
          <div key={item.id} className={`voice-item ${currentVoice === item.id ? 'on' : ''}`}>
            <div>
              <b>{item.name}</b>
              <p>
                {item.gender} · {item.style}
              </p>
            </div>
            <div className="actions">
              <button
                className="btn ghost"
                type="button"
                onClick={() => void playSynth(item)}
                disabled={Boolean(previewing)}
              >
                {previewing === item.id ? '试听中…' : '试听'}
              </button>
              <button className="btn" type="button" onClick={() => onPicked(item.id)}>
                选用
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
