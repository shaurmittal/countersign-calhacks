"use client";
// The two phone calls: the inbound line (scene I, then on hold) and the callback to the real vendor (scene III).
import { CAPTIONS, CASE_FACTS, INBOUND_FLAGS, TIMES, TOOL_CALLS, type Caption } from "./story";
import { ramp } from "./useFilm";

const BARS = Array.from({ length: 56 }, (_, i) => {
  const env = Math.sin((i / 55) * Math.PI);
  const wobble = 0.5 + 0.5 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.43));
  return { h: 0.18 + 0.82 * env * wobble, d: (i % 9) * 0.07 };
});

export function speakingOn(t: number, line: Caption["line"]): Caption | null {
  return CAPTIONS.find((c) => c.line === line && t >= c.start && t < c.end) ?? null;
}

export function Waveform({ t, line, big }: { t: number; line: Caption["line"]; big?: boolean }) {
  const now = speakingOn(t, line);
  const tone = now ? (now.speaker === "caller" ? "scam" : now.speaker === "vendor" ? "vendor" : "agent") : "idle";
  return (
    <div className={`lp-wave${big ? " is-big" : ""}`} data-tone={tone} aria-hidden="true">
      {BARS.map((b, i) => (
        <span key={i} style={{ height: `${Math.round(b.h * 100)}%`, animationDelay: `${b.d}s` }} />
      ))}
    </div>
  );
}

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Tools({ t, line }: { t: number; line: Caption["line"] }) {
  const shown = TOOL_CALLS.filter((c) => c.line === line && t >= c.at);
  if (shown.length === 0) return null;
  const last = shown[shown.length - 1];
  return (
    <p className="lp-tool" key={last.name} style={{ opacity: ramp(t, last.at, 0.4) }}>
      <span className="lp-tool-name">{last.name}</span>
      <span aria-hidden="true">→</span>
      <span>{last.result}</span>
    </p>
  );
}

/** Scene I: the scam call arriving on Countersign's line. */
export function InboundCall({ t }: { t: number }) {
  const ringing = t < CAPTIONS[0].start;
  return (
    <div className="lp-call">
      <div className="lp-call-head">
        <span className={`lp-live-dot${ringing ? " is-ringing" : ""}`} aria-hidden="true" />
        <span>{ringing ? "Incoming call" : "On the line"}</span>
        <span className="lp-call-num">+1 (•••) •••-{CASE_FACTS.callerLast4}</span>
        <span className="lp-call-to">→ Countersign · Lumen Labs</span>
        {!ringing && <span className="lp-call-time">{clock(t - CAPTIONS[0].start)}</span>}
      </div>
      <Waveform t={t} line="inbound" big />
      <ul className="lp-flags" aria-label="Red flags">
        {INBOUND_FLAGS.map((f) =>
          t >= f.at ? (
            <li key={f.text} style={{ opacity: ramp(t, f.at, 0.35), transform: `translateY(${(1 - ramp(t, f.at, 0.35)) * 8}px)` }}>
              {f.text}
            </li>
          ) : null,
        )}
      </ul>
      <Tools t={t} line="inbound" />
    </div>
  );
}

/** Scene III, right side: both calls at once. */
export function TwoCalls({ t }: { t: number }) {
  const connected = t >= TIMES.connect;
  const denied = t >= TIMES.outcome;
  return (
    <div className="lp-twocalls">
      <div className="lp-mini-call" data-speaking={speakingOn(t, "inbound") ? "yes" : undefined}>
        <p className="lp-mini-label">
          Line 1 · the caller <span>{speakingOn(t, "inbound") ? "speaking" : "on hold"}</span>
        </p>
        <Waveform t={t} line="inbound" />
      </div>

      <div className="lp-callback" data-denied={denied || undefined}>
        <p className="lp-callback-label">Line 2 · Countersign is calling</p>
        <p className="lp-callback-who">Pixel &amp; Pine Design</p>
        <p className="lp-callback-num">
          Number on file <b>…{CASE_FACTS.callbackNumberLast4}</b>
          <span>never the number in the message</span>
        </p>
        <div className="lp-callback-status">{connected ? (denied ? "Call ended · outcome recorded" : "Connected") : "Ringing…"}</div>
        <ol className="lp-cb-transcript" aria-label="Callback transcript so far">
          {CAPTIONS.filter((c) => c.line === "callback" && t >= c.end)
            .slice(-3)
            .map((c) => (
              <li key={c.start} data-speaker={c.speaker}>
                <b>{c.speaker === "vendor" ? "Jordan" : "Countersign"}</b> {c.text}
              </li>
            ))}
        </ol>
        <Waveform t={t} line="callback" big />
        <Tools t={t} line="callback" />
        {denied && (
          <p className="lp-denied" style={{ opacity: ramp(t, TIMES.outcome, 0.3), transform: `rotate(-6deg) scale(${1.6 - 0.6 * ramp(t, TIMES.outcome, 0.3)})` }}>
            Denied
          </p>
        )}
      </div>
    </div>
  );
}
