// Display helpers for the War Room and the owner page.
import { useEffect, useState } from "react";
import { RULES } from "../../shared/policy/rules";

const CHANNEL_LABELS: Record<string, string> = {
  sms: "SMS",
  call: "Phone call",
  email: "Email",
  agent: "Agent (Fetch.ai)",
  web: "Web chat",
  whatsapp: "WhatsApp",
  bank: "Lumen Bank",
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

export function clockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function secondsLeft(untilMs: number, now: number): number {
  return Math.max(0, Math.ceil((untilMs - now) / 1000));
}

/** Account numbers are shown by their last 4 digits only. */
export function last4(value: string | undefined | null): string {
  return value ? `…${value.slice(-4)}` : "—";
}

type RuleInfo = { name: string; description: string; overridable: boolean };

/** Rule metadata for any rule id the Policy Engine returns, including ones added after this build. */
export function ruleInfo(id: string): RuleInfo | null {
  return (RULES as Record<string, RuleInfo>)[id] ?? null;
}

/** Re-renders every `intervalMs` so countdowns tick. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
