import type {EngineStatus} from '../types';

export const COMPONENT_LABELS: Record<string, string> = {
  ffmpeg: 'ffmpeg 转码',
  node: 'Node 运行时',
  remotion: '成片渲染器',
  'whisper-base': '转写模型',
  whisper: '转写模型',
  'spark-tts': '克隆配音',
  spark: '克隆配音',
};

export function componentMissing(engine: EngineStatus, id: string) {
  if (id === 'ffmpeg') return !engine.ffmpeg;
  if (id === 'node') return !engine.node;
  if (id === 'remotion') return !engine.remotion;
  if (id === 'whisper' || id === 'whisper-base') return !engine.whisper;
  if (id === 'spark' || id === 'spark-tts') return !engine.spark || !engine.torch;
  const item = engine.packages.find((pkg) => pkg.id === id);
  return item ? !item.installed : false;
}

export function installHint(message: string) {
  return /ffmpeg|ffprobe|whisper|remotion|克隆配音|未找到 node|未找到 Node|本地组件/i.test(message);
}
