import React from 'react';
import {CalculateMetadataFunction, Composition} from 'remotion';
import {TalkingVideo} from './TalkingVideo';
import {demoTimeline, TalkingVideoProps} from './types';

const defaultProps: TalkingVideoProps = {
  jobId: 'demo',
  audioFile: '',
  timeline: demoTimeline,
};

export const calculateTalkingMetadata: CalculateMetadataFunction<TalkingVideoProps> = ({
  props,
}) => {
  const fps = props.timeline?.fps ?? 30;
  const durationMs = props.timeline?.duration_ms ?? 12000;
  return {
    fps,
    width: props.timeline?.width ?? 1080,
    height: props.timeline?.height ?? 1920,
    durationInFrames: Math.max(1, Math.ceil((durationMs / 1000) * fps)),
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="TalkingVideo"
      component={TalkingVideo}
      durationInFrames={360}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={calculateTalkingMetadata}
    />
  );
};
