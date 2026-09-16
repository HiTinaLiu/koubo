import type {JobStatus} from '../types';

export function waitTitle(kind: JobStatus | 'uploading', message = '') {
  if (kind === 'uploading') return '正在上传录音';
  if (kind === 'transcribing') return '正在转成文字';
  if (kind === 'analyzing') return '正在改稿';
  if (kind === 'voicing' && message.includes('口播声音')) return '正在生成声音';
  if (kind === 'voicing') return '正在配音';
  if (kind === 'rendering') return '正在渲染成片';
  return '处理中';
}

export function waitHint(kind: JobStatus | 'uploading', message = '') {
  if (kind === 'uploading') return '文件较大时上传会多等一会儿，请不要关页面。';
  if (kind === 'transcribing') return '长录音请稍候，不要关页面。进度会随已识别的口播时间往前走。';
  if (kind === 'analyzing') return '规划架构和写正文各要一轮模型，请稍候。';
  if (kind === 'voicing' && message.includes('口播声音')) return '只生成声音，不渲染成片，请不要关页面。';
  return '配音、转码和渲染都会比较久，请不要关页面。';
}

export function waitMessage(kind: JobStatus | 'uploading', working: boolean, stepMessage?: string) {
  if (kind === 'uploading') return '正在把录音送到本机识别…';
  if (working && stepMessage) return stepMessage;
  if (kind === 'analyzing') return '正在提交改稿…';
  if (kind === 'voicing' || kind === 'rendering') return '正在开始成片…';
  if (kind === 'transcribing') return '正在准备识别…';
  return stepMessage || '处理中…';
}

export function processStages(status: JobStatus, message: string) {
  if (status === 'transcribing') {
    const converting = message.includes('转成') || message.includes('时长') || message.includes('准备');
    return [
      {label: '整理音频', state: converting ? 'active' : 'done'},
      {label: '识别口播', state: converting ? 'wait' : 'active'},
    ];
  }
  if (status === 'analyzing') {
    const writing = message.includes('正文') || message.includes('写口播');
    return [
      {label: '规划架构', state: writing ? 'done' : 'active'},
      {label: '生成正文', state: writing ? 'active' : 'wait'},
    ];
  }
  if (status === 'voicing' && message.includes('口播声音')) {
    const making = message.includes('合成') || message.includes('提取');
    return [
      {label: '整理朗读稿', state: making ? 'done' : 'active'},
      {label: '生成声音', state: making ? 'active' : 'wait'},
    ];
  }
  const takeActive = status === 'voicing' && (message.includes('重录') || message.includes('整理重录'));
  const captionsActive = status === 'voicing' && (message.includes('字幕') || message.includes('时间轴') || message.includes('步骤'));
  const coverActive = status === 'rendering' && message.includes('主图');
  const renderActive = status === 'rendering' && !coverActive;
  const done = status === 'done';
  return [
    {
      label: takeActive || message.includes('重录') ? '整理重录' : '配音',
      state: done || renderActive || coverActive || captionsActive ? 'done' : 'active',
    },
    {label: '整理时间轴', state: done || renderActive || coverActive ? 'done' : captionsActive ? 'active' : 'wait'},
    {label: '渲染成片', state: done || coverActive ? 'done' : renderActive ? 'active' : 'wait'},
    {label: '生成主图', state: done ? 'done' : coverActive ? 'active' : 'wait'},
  ];
}
