import {useEffect, useRef, useState} from 'react';

const MIC_KEY = 'koubo.mic';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

function isVirtualMic(label: string) {
  return /iriun|droidcam|epoccam|ivcam|many cam|snap camera|obs virtual|stereo mix|立体声混音|what u hear/i.test(
    label,
  );
}

function loadMicId() {
  try {
    return localStorage.getItem(MIC_KEY) || '';
  } catch {
    return '';
  }
}

function saveMicId(id: string) {
  try {
    if (id) localStorage.setItem(MIC_KEY, id);
  } catch {
    /* ignore */
  }
}

export function Recorder({
  disabled,
  startLabel = '开始录音',
  stopLabel = '停止并使用',
  onRecorded,
}: {
  disabled: boolean;
  startLabel?: string;
  stopLabel?: string;
  onRecorded: (blob: Blob) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState(loadMicId);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const meterRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micIdRef = useRef(micId);
  micIdRef.current = micId;

  async function listMics() {
    if (!navigator.mediaDevices?.enumerateDevices) return [] as MediaDeviceInfo[];
    const devices = await navigator.mediaDevices.enumerateDevices();
    const next = devices.filter((item) => item.kind === 'audioinput' && item.deviceId);
    setMics(next);
    return next;
  }

  useEffect(() => {
    void listMics().catch(() => undefined);
    const onChange = () => {
      void listMics().catch(() => undefined);
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (meterRef.current) window.cancelAnimationFrame(meterRef.current);
      void audioCtxRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
    };
  }, []);

  function stopMeter() {
    if (meterRef.current) window.cancelAnimationFrame(meterRef.current);
    meterRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setLevel(0);
  }

  function watchLevel(stream: MediaStream) {
    stopMeter();
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const n = (value - 128) / 128;
        sum += n * n;
      }
      const rms = Math.sqrt(sum / data.length);
      setLevel(Math.min(1, rms * 4.2));
      meterRef.current = window.requestAnimationFrame(tick);
    };
    void ctx.resume().then(tick);
  }

  async function openMic(preferred = micIdRef.current) {
    const audioBase: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    const attempts: MediaStreamConstraints[] = preferred
      ? [{audio: {...audioBase, deviceId: {exact: preferred}}}]
      : [
          {audio: {...audioBase, deviceId: {ideal: 'communications'}}},
          {audio: audioBase},
        ];
    let stream: MediaStream | null = null;
    let lastError: unknown;
    for (const constraints of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!stream) {
      throw lastError instanceof Error ? lastError : new Error('无法打开麦克风，请允许权限后重试。');
    }
    const listed = await listMics();
    const currentId = stream.getAudioTracks()[0]?.getSettings().deviceId || '';
    const current = listed.find((item) => item.deviceId === currentId);
    const label = current?.label || stream.getAudioTracks()[0]?.label || '';
    if (!preferred && isVirtualMic(label)) {
      const better = listed.find((item) => !isVirtualMic(item.label));
      if (better?.deviceId && better.deviceId !== currentId) {
        stream.getTracks().forEach((track) => track.stop());
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {...audioBase, deviceId: {exact: better.deviceId}},
        });
      }
    }
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== 'live') {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error('没有麦克风声音。请改选系统麦克风后再录。');
    }
    const used = track.getSettings().deviceId || preferred;
    if (used) {
      setMicId(used);
      saveMicId(used);
    }
    return stream;
  }

  async function start() {
    setError('');
    try {
      const stream = await openMic();
      streamRef.current = stream;
      watchLevel(stream);
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, {mimeType: mime});
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopMeter();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, {type: recorder.mimeType});
        if (blob.size < 1200) {
          setError('录音几乎是空的。请确认选对了麦克风，并对着麦说话后再录。');
          return;
        }
        onRecorded(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法开始录音');
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
  }

  async function changeMic(nextId: string) {
    setMicId(nextId);
    saveMicId(nextId);
    if (!recording) return;
    stop();
    setError('已切换麦克风，请重新点录音。');
  }

  return (
    <div className={`record ${recording ? 'hot' : ''}`}>
      <div>
        {mics.length ? (
          <label className="mic-pick">
            <span>录音麦克风</span>
            <select
              value={mics.some((item) => item.deviceId === micId) ? micId : mics[0]?.deviceId || ''}
              disabled={disabled || recording}
              onChange={(event) => void changeMic(event.target.value)}
            >
              {mics.map((item, index) => (
                <option key={item.deviceId} value={item.deviceId}>
                  {isVirtualMic(item.label)
                    ? `${item.label || `麦克风 ${index + 1}`}（可能无声）`
                    : item.label || `麦克风 ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="timer">{formatTime(seconds)}</div>
        <div className="mic-meter" aria-hidden>
          <span style={{width: `${Math.round(level * 100)}%`}} />
        </div>
        {error ? <div className="error">{error}</div> : null}
      </div>
      <div className="actions">
        {recording ? (
          <button className="btn" type="button" onClick={stop}>
            {stopLabel}
          </button>
        ) : (
          <button className="btn" type="button" disabled={disabled} onClick={() => void start()}>
            {startLabel}
          </button>
        )}
      </div>
    </div>
  );
}
