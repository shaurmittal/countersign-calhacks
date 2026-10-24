"use client";
// Hero card: attack messages from the answer key, each run through the real Policy Engine as it appears.
import { useEffect, useMemo, useState } from "react";
import { RULES } from "../../../shared/policy/rules";
import type { RuleId } from "../../../shared/types";
import { SCENARIOS, runScenario } from "../../../scenarios/run";

const IDS = ["owner-wire-before-flight", "injection", "aws-lookalike", "gift-cards-from-owner", "payroll-redirect", "crypto-payment"];
const STEP_MS = 4200;

export function HeroTicker() {
  const items = useMemo(
    () =>
      IDS.map((id) => SCENARIOS.find((s) => s.id === id))
        .filter((s) => s !== undefined)
        .map((s) => ({ s, r: runScenario(s) })),
    [],
  );
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(1);
      return;
    }
    const tick = setInterval(() => setI((x) => (x + 1) % items.length), STEP_MS);
    return () => clearInterval(tick);
  }, [items.length]);

  // Types the message, then shows the decision.
  useEffect(() => {
    setShown(0);
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 1500);
      setShown(k);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [i]);

  const { s, r } = items[i];
  const text = s.text.length > 150 ? `${s.text.slice(0, 147)}…` : s.text;
  return (
    <aside className="lp-ticker" aria-label="Scam messages run through the Policy Engine">
      <p className="lp-ticker-head">
        <span>Incoming</span>
        <b>Policy Engine · running in your browser</b>
      </p>
      <p className="lp-ticker-from">
        {s.channel === "call" ? "Call" : s.channel === "email" ? "Email" : "Text"} from …{s.from.replace(/\D/g, "").slice(-4) || s.from}
      </p>
      <p className="lp-ticker-msg">{text.slice(0, Math.round(text.length * shown))}</p>
      <div className="lp-ticker-out">
        {shown >= 1 && (
          <>
            <span className="lp-ticker-decision" data-decision={r.decision} key={`d-${i}`}>
              {r.decision}
            </span>
            <span className="lp-ticker-rules" key={`r-${i}`}>
              {r.firedRules
                .slice(0, 3)
                .map((id) => `${id} ${RULES[id as RuleId].name}`)
                .join(" · ")}
            </span>
          </>
        )}
      </div>
      <div className="lp-ticker-dots" aria-hidden="true">
        {items.map((_, j) => (
          <span key={j} data-on={j === i || undefined} />
        ))}
      </div>
    </aside>
  );
}
