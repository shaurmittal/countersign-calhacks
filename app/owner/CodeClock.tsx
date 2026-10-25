"use client";
// "New code in 12s": the authenticator's 30-second window as a draining ring, so the owner knows whether to
// wait for a fresh code before typing. Ice while there's time, red in the last few seconds.
import { useEffect, useState } from "react";
import { OWNER_CODE } from "../../shared/config";
import { useNow } from "../components/format";

export function CodeClock() {
  const now = useNow(250);
  // Time-based, so it renders only in the browser: the server's clock would never match the first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const period = OWNER_CODE.periodSeconds;
  const left = period - ((now / 1000) % period);
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 font-mono text-[12.5px] text-muted-foreground"
      title={`Authenticator codes change every ${period} seconds`}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r={r} fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth="2.25" />
        {mounted && (
          <circle
            cx="10"
            cy="10"
            r={r}
            fill="none"
            stroke={left < 6 ? "#ff6b4a" : "#7cc4f5"}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - left / period)}
            transform="rotate(-90 10 10)"
          />
        )}
      </svg>
      {mounted ? `New code in ${Math.ceil(left)}s` : "Codes change every 30s"}
    </span>
  );
}
