import {useEffect, useRef} from 'react';
import {contourWorkSize, keySolidContour} from '../contourKey';

export function ContourKeyLayer({
  src,
  tightness,
  style,
}: {
  src: string;
  tightness: number;
  style?: React.CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const work = document.createElement('canvas');
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      if (video.readyState < 2 || !video.videoWidth) return;
      const size = contourWorkSize(video.videoWidth, video.videoHeight);
      if (work.width !== size.width || work.height !== size.height) {
        work.width = size.width;
        work.height = size.height;
      }
      const workCtx = work.getContext('2d', {willReadFrequently: true});
      const viewCtx = canvas.getContext('2d');
      if (!workCtx || !viewCtx) return;
      workCtx.drawImage(video, 0, 0, size.width, size.height);
      const keyed = keySolidContour(workCtx.getImageData(0, 0, size.width, size.height), tightness);
      workCtx.putImageData(keyed, 0, 0);
      if (canvas.width !== size.width || canvas.height !== size.height) {
        canvas.width = size.width;
        canvas.height = size.height;
      }
      viewCtx.clearRect(0, 0, canvas.width, canvas.height);
      viewCtx.drawImage(work, 0, 0);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [src, tightness]);

  return (
    <>
      <video
        ref={videoRef}
        className="preview-cutout-media is-source"
        src={src}
        muted
        loop
        playsInline
        autoPlay
      />
      <canvas className="preview-cutout-media" ref={canvasRef} style={style} />
    </>
  );
}
