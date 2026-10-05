export function Stepper({ value, min = 0, max = -1, onChange, label }: { value: number; min?: number; max?: number; onChange: (v: number) => void; label: string }) {
  return (
    <span className="stepper">
      <button aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="val" aria-live="polite">
        {value}
      </span>
      <button aria-label={`More ${label}`} disabled={max >= 0 && value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}
