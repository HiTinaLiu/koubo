import {normalizeChromaTolerance} from '../chroma';
import type {ProduceOptions} from '../types';

export function ChromaColorFields({
  options,
  disabled,
  onChange,
}: {
  options: ProduceOptions;
  disabled?: boolean;
  takeUrl?: string;
  onChange: (next: ProduceOptions) => void;
}) {
  const tightness = normalizeChromaTolerance(options.chromaTolerance);
  return (
    <div className="chroma-fields">
      <label>
        <span>轮廓松紧 {Math.round(tightness * 100)}%</span>
        <input
          type="range"
          min={6}
          max={42}
          step={1}
          value={Math.round(tightness * 100)}
          disabled={disabled}
          onChange={(event) =>
            onChange({...options, chromaTolerance: normalizeChromaTolerance(Number(event.target.value) / 100)})
          }
        />
      </label>
      <p className="hint">
        只抠最外圈纯色背景。人物外轮廓围住的内部整块保留，衣服、手缝里不再往里抠。外圈还有底色就调大松紧。
      </p>
    </div>
  );
}
