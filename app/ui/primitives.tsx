// Small building blocks shared by the app pages: the verdict stamp, tags, section headings, buttons.
import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "pay" | "block" | "hold" | "owner" | "neutral" | "quiet";

/** Decision -> tone. Green clears money, red refuses, amber holds, white waits for the owner. */
export function decisionTone(decision: string | null | undefined): Tone {
  switch (decision) {
    case "PAY":
      return "pay";
    case "BLOCK":
      return "block";
    case "HOLD":
      return "hold";
    case "ESCALATE":
      return "owner";
    case undefined:
    case null:
      return "neutral";
    default:
      return "quiet";
  }
}

const STAMP: Record<Tone, string> = {
  pay: "border-pay/50 bg-pay/[0.12] text-pay-ink",
  block: "border-block/50 bg-block/[0.12] text-block-ink",
  hold: "border-hold/40 bg-hold/[0.08] text-hold-ink",
  owner: "border-white/40 bg-white/[0.06] text-foreground",
  neutral: "border-border-strong text-muted-foreground",
  quiet: "border-border text-muted-foreground",
};

/** The verdict stamped at the end of a strip. */
export function Stamp({ tone, children, size = "md", className }: { tone: Tone; children: ReactNode; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border font-mono font-semibold uppercase tracking-[0.08em]",
        size === "sm" && "h-6 px-1.5 text-[11.5px]",
        size === "md" && "h-6 px-2 text-[11px]",
        size === "lg" && "h-11 px-4 text-[20px] tracking-[0.1em] sm:h-[60px] sm:px-5 sm:text-[30px]",
        STAMP[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const TAG: Record<Tone, string> = {
  pay: "text-pay-ink border-pay/30 bg-pay/[0.07]",
  block: "text-block-ink border-block/30 bg-block/[0.07]",
  hold: "text-hold-ink border-hold/25 bg-hold/[0.06]",
  owner: "text-foreground border-white/25",
  neutral: "text-foreground/85 border-border-strong",
  quiet: "text-muted-foreground border-border",
};

/** A fact about a case: "Sender not on file", "R2 Bank change", "$4,800.00". */
export function Tag({ tone = "neutral", children, title, className }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] leading-[18px]", TAG[tone], className)}>
      {children}
    </span>
  );
}

/** A section heading with an optional right-hand slot. */
export function SectionHead({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-[13px] font-medium text-foreground">{title}</h2>
      {children && <div className="flex items-center gap-2 text-right text-[12px] text-muted-foreground max-sm:[&>span:not(.font-mono)]:hidden">{children}</div>}
    </div>
  );
}

const BUTTON = {
  primary: "bg-foreground text-background hover:bg-white/85 disabled:bg-white/20 disabled:text-white/40",
  approve: "bg-pay text-black hover:bg-pay-ink disabled:bg-pay/20 disabled:text-white/40",
  danger: "border border-block/50 text-block-ink hover:bg-block/10 disabled:border-border disabled:text-white/30",
  ghost: "border border-border-strong text-foreground hover:bg-white/[0.06] disabled:text-white/30",
};

export function buttonClass(variant: keyof typeof BUTTON = "primary", className?: string) {
  return cn(
    "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-[13px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98] disabled:active:scale-100",
    BUTTON[variant],
    className,
  );
}
