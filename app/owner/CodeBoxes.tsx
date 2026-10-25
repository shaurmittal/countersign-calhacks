"use client";
// The owner's code entry: six boxes drawn over one real input, so the phone's one-time-code autofill,
// paste and screen readers all still work. Plus a ring showing when the authenticator's code rolls over.
import { useEffect, useState } from "react";
import { OWNER_CODE } from "../../shared/config";
import { useNow } from "../components/format";

export function CodeBoxes(props: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  describedBy?: string;
  disabled?: boolean;
  label?: string;
}) {
  const { id, value, onChange, describedBy, disabled, label = "Code from your authenticator app" } = props;
  return (
    <div className="ow-code-field">
      <label htmlFor={id} className="ow-code-label">
        {label}
      </label>
      <div className="ow-code" data-disabled={disabled || undefined}>
        <input
          id={id}
          className="ow-code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OWNER_CODE.digits}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, OWNER_CODE.digits))}
          aria-describedby={describedBy}
        />
        <div className="ow-code-boxes" aria-hidden="true">
          {Array.from({ length: OWNER_CODE.digits }, (_, i) => (
            <span key={i} data-filled={value[i] ? "" : undefined} data-active={i === value.length ? "" : undefined}>
              {value[i] ?? ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** "New code in 12s": the authenticator's 30-second window, drawn as a draining ring. */
export function CodeClock() {
  const now = useNow(250);
  // Time-based, so it renders only in the browser: the server's clock would never match the first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="ow-clock" aria-hidden="true" />;
  const period = OWNER_CODE.periodSeconds;
  const left = period - ((now / 1000) % period);
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span className="ow-clock" title="Authenticator codes change every 30 seconds">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r={r} fill="none" stroke="var(--lp-line-2)" strokeWidth="2.5" />
        <circle
          cx="11"
          cy="11"
          r={r}
          fill="none"
          stroke={left < 6 ? "var(--lp-red)" : "var(--lp-ice)"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - left / period)}
          transform="rotate(-90 11 11)"
        />
      </svg>
      New code in {Math.ceil(left)}s
    </span>
  );
}
