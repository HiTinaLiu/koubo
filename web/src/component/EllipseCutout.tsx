import {useEffect, useRef} from 'react';
import {ContourKeyLayer} from './ContourKeyLayer';
import {isRectPersonFrame, normalizeMask, normalizeZoom} from '../produce/mask';
import type {ProduceOptions} from '../types';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number] | 'move';

type Drag = {
  handle: Handle;
  startX: number;
  startY: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  aspect: number;
};

function resizeBox(drag: Drag, px: number, py: number, lockAspect: boolean) {
  let left = drag.left;
  let top = drag.top;
  let right = drag.right;
  let bottom = drag.bottom;
  const {handle, aspect} = drag;

  if (handle === 'e') right = px;
  else if (handle === 'w') left = px;
  else if (handle === 'n') top = py;
  else if (handle === 's') bottom = py;
  else {
    if (handle.includes('w')) left = px;
    if (handle.includes('e')) right = px;
    if (handle.includes('n')) top = py;
    if (handle.includes('s')) bottom = py;
  }

  if (lockAspect) {
    const ox = handle.includes('w') ? drag.right : drag.left;
    const oy = handle.includes('n') ? drag.bottom : drag.top;
    if (handle === 'e' || handle === 'w') {
      const width = Math.abs(px - ox);
      const height = width / aspect;
      const cy = (drag.top + drag.bottom) / 2;
      top = cy - height / 2;
      bottom = cy + height / 2;
      left = handle === 'w' ? ox - width : ox;
      right = handle === 'w' ? ox : ox + width;
    } else if (handle === 'n' || handle === 's') {
      const height = Math.abs(py - oy);
      const width = height * aspect;
      const cx = (drag.left + drag.right) / 2;
      left = cx - width / 2;
      right = cx + width / 2;
      top = handle === 'n' ? oy - height : oy;
      bottom = handle === 'n' ? oy : oy + height;
    } else {
      let width = Math.abs(px - ox);
      let height = Math.abs(py - oy);
      if (width / aspect > height) height = width / aspect;
      else width = height * aspect;
      left = px < ox ? ox - width : ox;
      right = px < ox ? ox : ox + width;
      top = py < oy ? oy - height : oy;
      bottom = py < oy ? oy : oy + height;
    }
  }

  if (right < left) [left, right] = [right, left];
  if (bottom < top) [top, bottom] = [bottom, top];
  return normalizeMask((left + right) / 2, (top + bottom) / 2, right - left, bottom - top);
}

export function EllipseCutout({
  options,
  takeUrl,
  disabled,
  onChange,
}: {
  options: ProduceOptions;
  takeUrl?: string;
  disabled?: boolean;
  onChange: (next: ProduceOptions) => void;
}) {
  const keyed = options.personMask === 'chroma';
  const rect = isRectPersonFrame(options.personMask);
  const dragRef = useRef<Drag | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const box = normalizeMask(options.maskX, options.maskY, options.maskW, options.maskH);
  const zoom = normalizeZoom(options.maskZoom);
  const left = box.maskX - box.maskW / 2;
  const top = box.maskY - box.maskH / 2;
  const mediaStyle = {transform: `scale(${zoom})`};

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      const current = optionsRef.current;
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      const currentZoom = normalizeZoom(current.maskZoom);
      const next = normalizeZoom(currentZoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
      if (next !== currentZoom) onChange({...current, maskZoom: next});
    };
    node.addEventListener('wheel', onWheel, {passive: false});
    return () => node.removeEventListener('wheel', onWheel);
  }, [disabled, onChange]);

  function frameOf(target: EventTarget | null) {
    return (target as HTMLElement | null)?.closest('.preview-frame') as HTMLElement | null;
  }

  function startDrag(handle: Handle, event: React.PointerEvent<HTMLElement>) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      left,
      top,
      right: left + box.maskW,
      bottom: top + box.maskH,
      aspect: box.maskW / Math.max(box.maskH, 0.01),
    };
  }

  function moveDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const frame = frameOf(event.currentTarget);
    if (!drag || !frame) return;
    const bounds = frame.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const px = (event.clientX - bounds.left) / bounds.width;
    const py = (event.clientY - bounds.top) / bounds.height;
    if (drag.handle === 'move') {
      const dx = (event.clientX - drag.startX) / bounds.width;
      const dy = (event.clientY - drag.startY) / bounds.height;
      const width = drag.right - drag.left;
      const height = drag.bottom - drag.top;
      onChange({
        ...options,
        ...normalizeMask(drag.left + width / 2 + dx, drag.top + height / 2 + dy, width, height),
      });
      return;
    }
    onChange({...options, ...resizeBox(drag, px, py, event.shiftKey)});
  }

  function endDrag(event: React.PointerEvent<HTMLElement>) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`preview-cutout${disabled ? ' is-locked' : ''}${rect ? ' is-square' : ''}`}
      style={{
        left: `${left * 100}%`,
        top: `${top * 100}%`,
        width: `${box.maskW * 100}%`,
        height: `${box.maskH * 100}%`,
      }}
      onPointerDown={(event) => startDrag('move', event)}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className={`preview-cutout-clip${keyed ? ' is-chroma' : ''}${rect ? ' is-square' : ''}`}>
        {takeUrl && keyed ? (
          <ContourKeyLayer src={takeUrl} tightness={options.chromaTolerance} style={mediaStyle} />
        ) : takeUrl ? (
          <video
            className="preview-cutout-media"
            src={takeUrl}
            muted
            loop
            playsInline
            autoPlay
            style={mediaStyle}
          />
        ) : (
          <div className="preview-cutout-placeholder" style={mediaStyle}>
            滚轮或下方滑条可放大缩小人像
          </div>
        )}
      </div>
      {HANDLES.map((id) => (
        <i
          key={id}
          className={`preview-cutout-handle ${id}`}
          onPointerDown={(event) => startDrag(id, event)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      ))}
      <label className="preview-cutout-zoom" onPointerDown={(event) => event.stopPropagation()}>
        <span>人像 {Math.round(zoom * 100)}%</span>
        <input
          type="range"
          min={40}
          max={300}
          step={1}
          value={Math.round(zoom * 100)}
          disabled={disabled}
          onChange={(event) => onChange({...options, maskZoom: normalizeZoom(Number(event.target.value) / 100)})}
        />
      </label>
    </div>
  );
}
