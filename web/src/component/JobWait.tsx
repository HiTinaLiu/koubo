import {useStudio} from '../studio/StudioContext';
import {processStages, waitHint, waitMessage, waitTitle} from '../studio/wait';
import {WaitProgress} from './WaitProgress';

export function JobWait({mode}: {mode: 'panel' | 'sticky'}) {
  const {waiting, uploading, waitKind, view, elapsed, step} = useStudio();
  if (!waiting) return null;
  if (mode === 'sticky' && step === 0) return null;
  if (mode === 'panel' && step !== 0) return null;

  return (
    <WaitProgress
      sticky={mode === 'sticky'}
      title={waitTitle(waitKind, view?.job.step_message)}
      message={waitMessage(waitKind, !uploading && waiting, view?.job.step_message)}
      progress={uploading ? 2 : view?.job.progress || 0}
      elapsedSec={elapsed}
      stages={
        uploading
          ? [
              {label: '上传录音', state: 'active'},
              {label: '整理音频', state: 'wait'},
              {label: '识别口播', state: 'wait'},
            ]
          : processStages(waitKind === 'uploading' ? 'transcribing' : waitKind, view?.job.step_message || '')
      }
      hint={waitHint(waitKind, view?.job.step_message)}
    />
  );
}
