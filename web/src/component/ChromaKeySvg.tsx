import {normalizeChromaColor, normalizeChromaTolerance} from '../chroma';

export function ChromaKeySvg({
  color,
  tolerance,
  filterId = 'koubo-chroma',
}: {
  color: string;
  tolerance: number;
  filterId?: string;
}) {
  const key = normalizeChromaColor(color);
  const t = normalizeChromaTolerance(tolerance);
  const soft = 0.07;
  const slope = 1 / soft;
  const intercept = -t / soft;
  return (
    <svg width="0" height="0" style={{position: 'absolute'}} aria-hidden="true">
      <filter id={filterId} colorInterpolationFilters="sRGB" x="-2%" y="-2%" width="104%" height="104%">
        <feFlood floodColor={key} result="key" />
        <feBlend in="SourceGraphic" in2="key" mode="difference" result="diff" />
        <feColorMatrix
          in="diff"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.299 0.587 0.114 0 0"
          result="lum"
        />
        <feComponentTransfer in="lum" result="hard">
          <feFuncA type="linear" slope={slope} intercept={intercept} />
        </feComponentTransfer>
        <feMorphology in="hard" operator="erode" radius="0.7" result="eroded" />
        <feGaussianBlur in="eroded" stdDeviation="0.55" result="softmask" />
        <feComposite in="SourceGraphic" in2="softmask" operator="in" result="cut" />
        <feColorMatrix in="cut" type="saturate" values="0.94" />
      </filter>
    </svg>
  );
}
