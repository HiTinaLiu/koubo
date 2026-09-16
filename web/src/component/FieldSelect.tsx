export function FieldSelect({
  label,
  value,
  disabled,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  options: Array<{id: string; name: string}>;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      {hint ? <p className="hint">{hint}</p> : null}
    </label>
  );
}
