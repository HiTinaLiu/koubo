import {useNavigate} from 'react-router-dom';
import {captionHighlights} from '../highlight';
import {PATH} from '../paths';
import {ProduceLookFields} from './ProduceLookFields';
import {useStudio} from '../studio/StudioContext';

export function TtsProduceTab() {
  const navigate = useNavigate();
  const {busy, working, view, produce, changeProduce, voices, assets, currentScript} = useStudio();
  return (
    <>
      <p className="hint">用 Spark 内置声、克隆本人/他人音色或 Edge 配音。效果、主题色、背景和配乐已在展示稿步骤设定，这里可再改配音和画幅。</p>
      <ProduceLookFields
        showVoice
        showBackground
        voices={voices}
        options={produce}
        disabled={busy || working}
        hook={currentScript?.hook ?? ''}
        topic={currentScript?.topic ?? ''}
        bodyLines={currentScript?.body ?? []}
        highlights={captionHighlights(currentScript)}
        onChange={changeProduce}
        onOpenVoices={() => navigate(PATH.voices)}
        onOpenAssets={() => navigate(PATH.assets)}
        assets={assets}
        jobId={view?.job.id}
      />
    </>
  );
}
