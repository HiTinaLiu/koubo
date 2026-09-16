import {useEffect, useMemo, useRef, useState} from 'react';
import {highlightParts} from '../highlight';
import type {Orientation} from '../types';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

function promptLines(text: string) {
  const parts = (text || '')
    .split(/(?<=[。！？!?])/)
    .map((item) => item.trim())
    .filter(Boolean);
  const lines: string[] = [];
  for (const part of parts) {
    if (part.length <= 18) {
      lines.push(part);
      continue;
    }
    for (let index = 0; index < part.length; index += 18) {
      lines.push(part.slice(index, index + 18));
    }
  }
  return lines.length ? lines : ['还没有口播稿，请先回到上一步。'];
}

function pickMime() {
  const types = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'];
  return types.find((item) => MediaRecorder.isTypeSupported(item)) || '';
}

function isVirtualMic(label: string) {
  return /iriun|droidcam|epoccam|ivcam|many cam|snap camera|obs virtual/i.test(label);
}

const CAMERA_KEY = 'koubo.camera';
const MIC_KEY = 'koubo.mic';

function loadCameraId() {
  try {
    return localStorage.getItem(CAMERA_KEY) || '';
  } catch {
    return '';
  }
}

function saveCameraId(id: string) {
  try {
    if (id) localStorage.setItem(CAMERA_KEY, id);
  } catch {
    /* ignore */
  }
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

function cameraLabel(device: MediaDeviceInfo, index: number) {
  const name = device.label.trim();
  if (!name) return `摄像头 ${index + 1}`;
  if (/iriun/i.test(name)) return `${name}（手机）`;
  return name;
}

export function Teleprompter({
  text,
  highlights,
  orientation,
  disabled,
  takeUrl,
  onRecorded,
}: {
  text: string;
  highlights?: string[];
  orientation: Orientation;
  disabled: boolean;
  takeUrl?: string;
  onRecorded: (blob: Blob) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mixCtxRef = useRef<AudioContext | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const startedAt = useRef(0);
  const frameRef = useRef(0);
  const timerRef = useRef(0);
  const cancelledRef = useRef(false);
  const [live, setLive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState('');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState(loadCameraId);
  const [micId, setMicId] = useState(loadMicId);
  const cameraIdRef = useRef(cameraId);
  const micIdRef = useRef(micId);
  cameraIdRef.current = cameraId;
  micIdRef.current = micId;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(false);
  const lines = useMemo(() => promptLines(text), [text]);
  const chars = useMemo(() => lines.join('').length, [lines]);
  const durationSec = Math.max(8, Math.round(chars / (4.2 * speed)));
  const portrait = orientation === 'portrait';

  function releaseCamera() {
    window.cancelAnimationFrame(frameRef.current);
    window.clearInterval(timerRef.current);
    void mixCtxRef.current?.close();
    mixCtxRef.current = null;
    recordStreamRef.current?.getTracks().forEach((track) => {
      if (track.kind === 'audio') track.stop();
    });
    recordStreamRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(false);
  }

  async function listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return {cameras: [] as MediaDeviceInfo[], mics: [] as MediaDeviceInfo[]};
    const devices = await navigator.mediaDevices.enumerateDevices();
    const nextCameras = devices.filter((item) => item.kind === 'videoinput' && item.deviceId);
    const nextMics = devices.filter((item) => item.kind === 'audioinput' && item.deviceId);
    setCameras(nextCameras);
    setMics(nextMics);
    return {cameras: nextCameras, mics: nextMics};
  }

  useEffect(() => {
    void listDevices().catch(() => undefined);
    const onChange = () => {
      void listDevices().catch(() => undefined);
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    const onFullscreen = () => {
      if (!document.fullscreenElement) setWide(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) setWide(false);
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelledRef.current = true;
      recorderRef.current?.stop();
      window.cancelAnimationFrame(frameRef.current);
      window.clearInterval(timerRef.current);
      void mixCtxRef.current?.close();
      mixCtxRef.current = null;
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
      recordStreamRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    const box = scrollRef.current;
    const wrap = wrapRef.current;
    if (!box || !wrap) return;
    const sync = () => {
      const y = Math.max(0, Math.round(box.clientHeight / 2));
      wrap.style.setProperty('--tele-pad', `${y}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(box);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [wide, orientation]);

  function tickScroll() {
    const view = scrollRef.current;
    const inner = innerRef.current;
    if (!view || !inner) return;
    const elapsed = (performance.now() - startedAt.current) / 1000;
    const progress = Math.min(1, elapsed / durationSec);
    const max = Math.max(0, inner.scrollHeight - view.clientHeight);
    view.scrollTop = max * progress;
    if (progress < 1 && recorderRef.current) {
      frameRef.current = window.requestAnimationFrame(tickScroll);
    }
  }

  async function openMic(nextId?: string) {
    const preferred = (nextId ?? micIdRef.current).trim();
    const audioBase: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    const attempts: MediaStreamConstraints[] = preferred
      ? [{audio: {...audioBase, deviceId: {exact: preferred}}, video: false}]
      : [
          {audio: {...audioBase, deviceId: {ideal: 'communications'}}, video: false},
          {audio: audioBase, video: false},
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
      throw lastError instanceof Error ? lastError : new Error('无法打开麦克风，成片会没有声音');
    }
    const listed = await listDevices();
    const currentId = stream.getAudioTracks()[0]?.getSettings().deviceId || '';
    const current = listed.mics.find((item) => item.deviceId === currentId);
    const label = current?.label || stream.getAudioTracks()[0]?.label || '';
    if (!preferred && isVirtualMic(label)) {
      const better = listed.mics.find((item) => !isVirtualMic(item.label));
      if (better?.deviceId && better.deviceId !== currentId) {
        stream.getTracks().forEach((track) => track.stop());
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {...audioBase, deviceId: {exact: better.deviceId}},
          video: false,
        });
      }
    }
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== 'live') {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error('没有麦克风声音。请允许使用麦克风后再录。');
    }
    track.enabled = true;
    const used = track.getSettings().deviceId || preferred;
    if (used) {
      micIdRef.current = used;
      setMicId(used);
      saveMicId(used);
    }
    micStreamRef.current?.getTracks().forEach((item) => item.stop());
    micStreamRef.current = stream;
    return stream;
  }

  async function mixForRecord(video: MediaStream, mic: MediaStream) {
    const picture = video.getVideoTracks().find((track) => track.readyState === 'live');
    if (!picture) throw new Error('没有打开摄像头');
    const voice = mic.getAudioTracks().find((track) => track.readyState === 'live');
    if (!voice) throw new Error('没有麦克风声音。请允许使用麦克风后再录。');
    void mixCtxRef.current?.close();
    const ctx = new AudioContext();
    mixCtxRef.current = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    const dest = ctx.createMediaStreamDestination();
    ctx.createMediaStreamSource(mic).connect(dest);
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const mixed = new MediaStream([picture, ...dest.stream.getAudioTracks()]);
    recordStreamRef.current = mixed;
    return mixed;
  }

  async function armCamera(nextId?: string) {
    setError('');
    const preferred = (nextId ?? cameraIdRef.current).trim();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const size: MediaTrackConstraints = {
      width: {ideal: portrait ? 720 : 1280},
      height: {ideal: portrait ? 1280 : 720},
    };
    const attempts: MediaStreamConstraints[] = preferred
      ? [
          {video: {...size, deviceId: {exact: preferred}}},
          {video: {deviceId: {exact: preferred}}},
          {video: {...size, deviceId: {ideal: preferred}}},
        ]
      : [
          {video: {...size, facingMode: 'user'}},
          {video: true},
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
      throw lastError instanceof Error ? lastError : new Error('无法打开摄像头。Iriun 等虚拟摄像头请先在手机上点开始，并确认 Windows 里能预览。');
    }
    for (const track of stream.getAudioTracks()) {
      stream.removeTrack(track);
      track.stop();
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    const used = stream.getVideoTracks()[0]?.getSettings().deviceId || preferred;
    if (used) {
      cameraIdRef.current = used;
      setCameraId(used);
      saveCameraId(used);
    }
    await listDevices();
    setLive(true);
  }

  async function pickCamera(id: string) {
    cameraIdRef.current = id;
    setCameraId(id);
    saveCameraId(id);
    if (!live || recording || countdown) return;
    try {
      await armCamera(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法切换摄像头');
    }
  }

  async function pickMic(id: string) {
    micIdRef.current = id;
    setMicId(id);
    saveMicId(id);
    if (recording || countdown) return;
    try {
      await openMic(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法切换麦克风');
    }
  }

  async function begin() {
    try {
      cancelledRef.current = false;
      if (!live) await armCamera();
      const video = streamRef.current;
      if (!video) throw new Error('没有打开摄像头');
      const mic = await openMic();
      await mixForRecord(video, mic);
      for (const value of [3, 2, 1]) {
        if (cancelledRef.current) {
          setCountdown(0);
          return;
        }
        setCountdown(value);
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
      if (cancelledRef.current) {
        setCountdown(0);
        return;
      }
      setCountdown(0);
      const recordStream = recordStreamRef.current;
      if (!recordStream?.getAudioTracks().some((track) => track.readyState === 'live')) {
        throw new Error('没有麦克风声音。请允许使用麦克风后再录。');
      }
      const mime = pickMime();
      const recorder = mime
        ? new MediaRecorder(recordStream, {
            mimeType: mime,
            videoBitsPerSecond: 2_500_000,
            audioBitsPerSecond: 128_000,
          })
        : new MediaRecorder(recordStream, {
            videoBitsPerSecond: 2_500_000,
            audioBitsPerSecond: 128_000,
          });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        window.cancelAnimationFrame(frameRef.current);
        window.clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, {type: recorder.mimeType || 'video/webm'});
        releaseCamera();
        onRecorded(blob);
      };
      recorderRef.current = recorder;
      recorder.start(200);
      setRecording(true);
      setSeconds(0);
      startedAt.current = performance.now();
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      frameRef.current = window.requestAnimationFrame(tickScroll);
      window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        setSeconds((value) => value + 1);
      }, 1000);
    } catch (err) {
      setCountdown(0);
      setError(err instanceof Error ? err.message : '无法打开摄像头或麦克风');
    }
  }

  function stop() {
    cancelledRef.current = true;
    window.cancelAnimationFrame(frameRef.current);
    window.clearInterval(timerRef.current);
    setRecording(false);
    setCountdown(0);
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      return;
    }
    releaseCamera();
  }

  async function toggleWide() {
    const node = rootRef.current;
    if (wide) {
      setWide(false);
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    setWide(true);
    try {
      await node?.requestFullscreen?.();
    } catch {
      /* 用页面铺满，不依赖系统全屏 */
    }
  }

  return (
    <div ref={rootRef} className={`teleprompter ${orientation}${wide ? ' is-wide' : ''}`}>
      <p className="hint">
        对着提词器朗读定稿口播。虚线是口播居中位置。监视画面会静音预览，声音走系统麦克风进成片，不要选 Iriun 虚拟麦。
      </p>
      <div className="tele-stage">
        <div className="tele-script-wrap" ref={wrapRef}>
          <div className="tele-cue" aria-hidden="true">
            <span>口播居中</span>
          </div>
          <div className="tele-script" ref={scrollRef}>
            <div className="tele-inner" ref={innerRef}>
            {lines.map((line, index) => (
              <p key={`${line}-${index}`}>
                {highlightParts(line, highlights || []).map((part, partIndex) =>
                  part.hit ? (
                    <em key={`${part.text}-${partIndex}`} className={part.step ? 'step' : undefined}>
                      {part.text}
                    </em>
                  ) : (
                    <span key={`${part.text}-${partIndex}`}>{part.text}</span>
                  ),
                )}
              </p>
            ))}
          </div>
          </div>
        </div>
        <div className="tele-cam">
          <video ref={videoRef} muted playsInline className="tele-preview" hidden={!live} />
          {!live && takeUrl ? <video className="tele-take" src={takeUrl} controls playsInline /> : null}
          {!live && !takeUrl ? <div className="tele-cam-empty">监视画面</div> : null}
          {countdown ? <div className="tele-count">{countdown}</div> : null}
          {recording ? <div className="tele-rec">REC {formatTime(seconds)}</div> : null}
        </div>
      </div>
      {cameras.length > 1 ? (
        <label>
          <span>摄像头</span>
          <select
            value={cameras.some((item) => item.deviceId === cameraId) ? cameraId : cameras[0].deviceId}
            disabled={disabled || recording || Boolean(countdown)}
            onChange={(event) => void pickCamera(event.target.value)}
          >
            {cameras.map((item, index) => (
              <option key={item.deviceId} value={item.deviceId}>
                {cameraLabel(item, index)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {mics.length ? (
        <label>
          <span>麦克风</span>
          <select
            value={mics.some((item) => item.deviceId === micId) ? micId : mics[0].deviceId}
            disabled={disabled || recording || Boolean(countdown)}
            onChange={(event) => void pickMic(event.target.value)}
          >
            {mics.map((item, index) => (
              <option key={item.deviceId} value={item.deviceId}>
                {isVirtualMic(item.label) ? `${item.label || `麦克风 ${index + 1}`}（可能无声）` : item.label || `麦克风 ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        <span>提词速度 {speed.toFixed(1)}x · 约 {durationSec} 秒滚完</span>
        <input
          type="range"
          min={7}
          max={14}
          value={Math.round(speed * 10)}
          disabled={disabled || recording || Boolean(countdown)}
          onChange={(event) => setSpeed(Number(event.target.value) / 10)}
        />
      </label>
      <div className="actions" style={{marginTop: 0}}>
        {!live ? (
          <button type="button" className="btn ghost" disabled={disabled || recording} onClick={() => void armCamera()}>
            打开摄像头
          </button>
        ) : null}
        {countdown ? (
          <button type="button" className="btn ghost" onClick={() => { cancelledRef.current = true; setCountdown(0); }}>
            取消倒计时
          </button>
        ) : recording ? (
          <button type="button" className="btn" onClick={stop}>
            停录并使用
          </button>
        ) : (
          <button type="button" className="btn" disabled={disabled} onClick={() => void begin()}>
            {takeUrl ? '重新录一段' : '倒计时后开录'}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => void toggleWide()}>
          {wide ? '退出全屏' : '全屏提词'}
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}
