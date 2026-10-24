"use client";
// "Try to break it": the real Policy Engine (shared/policy/engine.ts) runs in the visitor's browser on the
// 30-scenario answer key (scenarios/scenarios.json), with the reference verifier from scenarios/world.ts.
import { useMemo, useState } from "react";
import type { PolicyResult, RuleId } from "../../../shared/types";
import { SCENARIOS, runScenario, type Scenario } from "../../../scenarios/run";

const TITLES: Record<string, string> = {
  "pixel-bank-change-denied": "Bank change, vendor says no",
  "pixel-bank-change-no-answer": "Bank change, vendor doesn't pick up",
  "pixel-bank-change-spoofed-caller-id": "Bank change from a spoofed number",
  "pixel-bank-change-spanish": "Bank change, in Spanish",
  "owner-impersonation": "“It's Priya, I'm locked out”",
  "owner-wire-before-flight": "The boss boarding a flight",
  "cofounder-wire": "The cofounder's urgent wire",
  "aws-lookalike": "A fake AWS invoice",
  "google-workspace-lookalike": "A lookalike Google domain",
  "northwind-lookalike-invoice": "A lookalike vendor billing site",
  "franchise-tax-notice": "A fake tax notice",
  "payroll-redirect": "Contractor payroll redirect",
  "gift-cards": "Gift cards for a client",
  "gift-cards-from-owner": "Gift cards “from Priya”",
  "crypto-payment": "Pay us in USDT",
  injection: "“Ignore all previous instructions”",
  "injection-known-vendor": "An injection inside a real invoice",
  "duplicate-invoice": "Pay the same invoice twice",
  "amount-anomaly": "An invoice three times the usual",
  "ofac-hit": "A sanctioned payee",
  "northwind-happy": "Northwind's monthly bill",
  "sam-weekly": "Sam's weekly invoice",
  "northwind-from-vendor-on-file": "Northwind, from its own address",
  "sam-new-number-confirmed": "Sam on a new phone, confirmed",
  "pixel-needs-owner-otp": "A big invoice that needs Priya",
  "genuine-bank-change-confirmed": "A real bank change, vendor confirms",
  "genuine-bank-change-approved": "A real bank change, Priya approves",
  "harbor-legal-always-escalates": "The lawyer, who always needs Priya",
  "crs-outage": "A bill while verification is down",
  hello: "Just saying hi",
};

const CHANNEL: Record<string, string> = { sms: "Text", call: "Call", email: "Email", agent: "Agent", web: "Web", whatsapp: "WhatsApp" };

type Ran = { s: Scenario; r: PolicyResult };

function context(s: Scenario): string | null {
  if (s.callbackOutcome === "denied") return "On the callback, the vendor says they didn't send it.";
  if (s.callbackOutcome === "confirmed") return "On the callback, the vendor confirms it.";
  if (s.callbackOutcome === "no_answer") return "Nobody answers the callback.";
  if (s.callbackOutcome === "unclear") return "The callback is unclear.";
  if (s.approval) return "Priya approves with her authenticator code.";
  return null;
}

export function BreakIt() {
  const [group, setGroup] = useState<"scam" | "real">("scam");
  const [picked, setPicked] = useState<string>("injection-known-vendor");
  const [ran, setRan] = useState<Record<string, Ran>>({});
  const [all, setAll] = useState<Ran[] | null>(null);

  const list = useMemo(() => SCENARIOS.filter((s) => (group === "scam" ? s.scam : !s.scam)), [group]);
  const current = SCENARIOS.find((s) => s.id === picked) ?? list[0];
  const result = ran[current.id];

  const run = (s: Scenario) => {
    setPicked(s.id);
    setRan((prev) => ({ ...prev, [s.id]: { s, r: runScenario(s) } }));
  };
  const runAll = () => {
    const out = SCENARIOS.map((s) => ({ s, r: runScenario(s) }));
    setRan(Object.fromEntries(out.map((x) => [x.s.id, x])));
    setAll(out);
  };

  const tally = all && {
    scams: all.filter((x) => x.s.scam),
    stopped: all.filter((x) => x.s.scam && x.r.decision !== "PAY").length,
    legit: all.filter((x) => !x.s.scam),
    legitOk: all.filter((x) => !x.s.scam && x.r.decision === x.s.expectedDecision).length,
    falsePay: all.filter((x) => x.r.decision === "PAY" && x.s.expectedDecision !== "PAY").length,
  };

  return (
    <div className="lp-break">
      <div className="lp-break-list">
        <div className="lp-seg" role="tablist" aria-label="Scenario group">
          <button type="button" role="tab" aria-selected={group === "scam"} onClick={() => setGroup("scam")}>
            Scams <span>{SCENARIOS.filter((s) => s.scam).length}</span>
          </button>
          <button type="button" role="tab" aria-selected={group === "real"} onClick={() => setGroup("real")}>
            Real bills <span>{SCENARIOS.filter((s) => !s.scam).length}</span>
          </button>
        </div>
        <ul>
          {list.map((s) => {
            const r = ran[s.id]?.r;
            return (
              <li key={s.id}>
                <button type="button" aria-pressed={current.id === s.id} onClick={() => run(s)}>
                  <span className="lp-break-title">{TITLES[s.id] ?? s.id}</span>
                  {r ? (
                    <span className="lp-pill" data-decision={r.decision}>
                      {r.decision}
                    </span>
                  ) : (
                    <span className="lp-pill lp-pill-idle">Run</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="lp-break-detail" aria-live="polite">
        <p className="lp-break-meta">
          {CHANNEL[current.channel] ?? current.channel} from {current.from.startsWith("+") ? `…${current.from.slice(-4)}` : current.from}
        </p>
        <blockquote className="lp-break-msg">{current.text}</blockquote>
        {context(current) && <p className="lp-break-context">{context(current)}</p>}

        {result ? (
          <div className="lp-break-result" key={`${current.id}-${result.r.decision}`}>
            <p className="lp-big-decision" data-decision={result.r.decision}>
              {result.r.decision}
            </p>
            <ul className="lp-reasons">
              {result.r.reasons.slice(0, 4).map((reason) => {
                const id = reason.split(" ")[0] as RuleId;
                return (
                  <li key={reason}>
                    <b>{id}</b> {reason.slice(id.length + 1)}
                  </li>
                );
              })}
            </ul>
            <p className="lp-expected">
              Answer key: {current.expectedDecision} {result.r.decision === current.expectedDecision ? "· matches" : "· differs"}
              {!result.r.overridable && result.r.decision === "BLOCK" && " · not even Priya can override this"}
            </p>
          </div>
        ) : (
          <button type="button" className="lp-btn lp-btn-primary" onClick={() => run(current)}>
            Run it through the Policy Engine
          </button>
        )}

        <div className="lp-break-all">
          <button type="button" className="lp-btn lp-btn-ghost" onClick={runAll}>
            Run all {SCENARIOS.length}
          </button>
          {tally && (
            <p>
              <b>
                {tally.stopped}/{tally.scams.length}
              </b>{" "}
              scams stopped · <b>{tally.legitOk}/{tally.legit.length}</b> real bills handled right · <b>{tally.falsePay}</b> false PAY
              <span>Computed in your browser just now.</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
