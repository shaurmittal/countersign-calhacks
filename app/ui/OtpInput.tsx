"use client";
// The owner's 6-digit authenticator code as six boxes that auto-advance, accept a paste (or iOS one-time-code
// autofill) of the whole code, and pop each digit in. Adapted from EasyUI's OTP Input
// (MIT: github.com/Surajmaurya1/easyui).
import { motion, useReducedMotion } from "framer-motion";
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "./cn";

export function OtpInput(props: {
  length: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  describedBy?: string;
  label?: string;
}) {
  const { length, value, onChange } = props;
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [popped, setPopped] = useState<number | null>(null);
  const reduce = useReducedMotion();
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const set = (next: string[], pop: number | null) => {
    onChange(next.join("").replace(/\s/g, ""));
    setPopped(pop);
  };

  const fill = (raw: string, from: number) => {
    const incoming = raw.replace(/\D/g, "").slice(0, length - from);
    if (!incoming) return;
    const next = [...digits];
    for (let i = 0; i < incoming.length; i++) next[from + i] = incoming[i];
    const last = from + incoming.length - 1;
    set(next, last);
    refs.current[Math.min(last + 1, length - 1)]?.focus();
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) next[i] = "";
      else if (i > 0) {
        next[i - 1] = "";
        refs.current[i - 1]?.focus();
      }
      set(next, null);
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
    }
  };

  return (
    <div role="group" aria-label={props.label ?? "Authenticator code"} aria-describedby={props.describedBy} className="flex gap-1.5 sm:gap-2">
      {digits.map((d, i) => (
        <motion.input
          key={i}
          id={i === 0 ? props.id : undefined}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={i === 0 ? length : 1}
          value={d}
          disabled={props.disabled}
          aria-label={`Digit ${i + 1} of ${length}`}
          onChange={(e) => fill(e.target.value.slice(d ? 1 : 0) || e.target.value, i)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
            e.preventDefault();
            fill(e.clipboardData.getData("text"), 0);
          }}
          onFocus={(e) => e.target.select()}
          animate={!reduce && popped === i ? { scale: [1, 1.14, 1] } : { scale: 1 }}
          onAnimationComplete={() => popped === i && setPopped(null)}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
          className={cn(
            "h-12 w-10 rounded-lg border bg-surface text-center font-mono text-[20px] text-foreground outline-none transition-colors sm:h-14 sm:w-12 sm:text-[22px]",
            d ? "border-white/35" : "border-border-strong",
            "focus:border-owner focus:shadow-[0_0_0_3px_rgba(195,166,255,0.18)] focus-visible:outline-none disabled:opacity-40",
          )}
        />
      ))}
    </div>
  );
}
