import {useNavigate} from 'react-router-dom';
import {uploadTake} from '../api';
import {captionHighlights} from '../highlight';
import {PATH} from '../paths';
import {FieldSelect} from '../component/FieldSelect';
import {ChromaColorFields} from './ChromaColorFields';
import {maskNeedsBackground, ProduceLookFields} from './ProduceLookFields';
import {PERSON_MASK_OPTIONS} from './options';
import {useStudio} from '../studio/StudioContext';
import {Teleprompter} from '../component/Teleprompter';
import type {PersonMask} from '../types';

export function TeleprompterProduceTab() {
  const navigate = useNavigate();
  const {
    busy,
    working,
    view,
    produce,
    changeProduce,
    voices,
    assets,
    currentScript,
    narrationPreview,
    wrap,
    remindNeedEngine,
  } = useStudio();

  if (!view) return null;
  const takeUrl = view.has_take ? `/api/jobs/${view.job.id}/take?t=${view.job.updated_at}` : '';

  return (
    <>
      <p className="hint">
        对着提词器出镜。可选不用人像、椭圆/方形挖空，或纯色抠像；步骤卡仍盖在画面上。选「不用人像」时仍用重录音对齐口播，成片不叠摄像头，画面沿用上一步展示稿的样式与背景。
      </p>
      <Teleprompter
        text={narrationPreview}
        highlights={captionHighlights(currentScript)}
        orientation={produce.orientation}
        disabled={busy || working}
        takeUrl={takeUrl}
        onRecorded={(blob) => {
          if (remindNeedEngine(['ffmpeg'], '提词器成片')) return;
          void wrap(() => uploadTake(view.job.id, blob, 'take.webm'), '重录已保存。');
        }}
      />
      <ProduceLookFields
        showBackground={maskNeedsBackground(produce.personMask)}
        voices={voices}
        options={produce}
        disabled={busy || working}
        hook={currentScript?.hook ?? ''}
        topic={currentScript?.topic ?? ''}
        bodyLines={currentScript?.body ?? []}
        highlights={captionHighlights(currentScript)}
        takeUrl={takeUrl}
        jobId={view.job.id}
        onChange={changeProduce}
        onOpenVoices={() => navigate(PATH.voices)}
        onOpenAssets={() => navigate(PATH.assets)}
        assets={assets}
        extra={
          <>
            <FieldSelect
              label="人物蒙版"
              value={produce.personMask}
              disabled={busy || working}
              options={PERSON_MASK_OPTIONS}
              hint={
                produce.personMask === 'chroma'
                  ? '矩形选框 + 纯色抠像。拖方框改范围，滚轮或滑条放大缩小框里的人像。'
                  : produce.personMask === 'cutout'
                    ? '在预览里拖椭圆改选框；滚轮或滑条放大缩小椭圆里的原视频。'
                    : produce.personMask === 'square'
                      ? '在预览里拖方框改选框；滚轮或滑条放大缩小方框里的原视频。'
                      : '成片沿用展示稿的主题色、展示卡和背景，不叠摄像头人像。仍需对着提词器录一段，用来提取声音并对齐步骤。'
              }
              onChange={(value) => changeProduce({...produce, personMask: value as PersonMask})}
            />
            {produce.personMask === 'chroma' ? (
              <ChromaColorFields
                options={produce}
                disabled={busy || working}
                takeUrl={takeUrl}
                onChange={changeProduce}
              />
            ) : null}
          </>
        }
      />
    </>
  );
}
