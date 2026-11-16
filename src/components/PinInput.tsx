/** 와이어프레임의 4칸 PIN. 실제 입력은 투명 input 하나가 받는다 (모바일 숫자 키패드) */
export default function PinInput({
  value,
  onChange,
  disabled,
  onComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  onComplete?: () => void;
}) {
  return (
    <div className={`pin${disabled ? " disabled" : ""}`}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`pin-box${i < value.length ? " filled" : ""}${i === value.length && !disabled ? " cursor" : ""}`}
        >
          {i < value.length ? "•" : ""}
        </div>
      ))}
      <input
        aria-label="4자리 PIN"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        maxLength={4}
        value={value}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, 4))
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.length === 4) onComplete?.();
        }}
      />
    </div>
  );
}
