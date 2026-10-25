"use client";
// Scene IV: the lock says BLOCK, and what happens next. A pure function of t.
import { RULES } from "../../../shared/policy/rules";
import type { RuleId } from "../../../shared/types";
import { AFTERMATH, AUDIT_HASHES, BLOCK_AT, CASE_FACTS, DECISIONS, TIMES } from "./story";
import { ramp } from "./useFilm";

export const END_CARD_AT = TIMES.endCard;

export function Verdict({ t, onReplay }: { t: number; onReplay: () => void }) {
  const slam = ramp(t, BLOCK_AT, 0.35);
  const block = DECISIONS[1];
  const end = ramp(t, END_CARD_AT, 0.8);
  return (
    <div className="lp-verdict">
      <div className="lp-verdict-main" style={{ opacity: 1 - end }}>
        <div className="lp-stamp" style={{ opacity: slam, transform: `rotate(-4deg) scale(${1.9 - 0.9 * slam})` }}>
          BLOCK
        </div>
        <p className="lp-zero" style={{ opacity: ramp(t, BLOCK_AT + 0.5, 0.5) }}>
          <b>$0</b> moved
        </p>
        <ul className="lp-fired">
          {block.fired.map((id, i) => (
            <li key={id} style={{ opacity: ramp(t, BLOCK_AT + 0.6 + i * 0.18, 0.3) }} data-key={id === "R10" || undefined}>
              <b>{id}</b> {RULES[id as RuleId].name}
            </li>
          ))}
        </ul>
      </div>

      <ul className="lp-after" style={{ opacity: 1 - end }}>
        {AFTERMATH.map((a, i) => (
          <li key={a.title} style={{ opacity: ramp(t, a.at, 0.45), transform: `translateY(${(1 - ramp(t, a.at, 0.45)) * 14}px)` }}>
            <p className="lp-after-title">{a.title}</p>
            <p>{a.body}</p>
            {i === 2 && (
              <ol className="lp-chain" aria-label="Audit hashes">
                {AUDIT_HASHES.map((h, j) => (
                  <li key={h.seq} style={{ opacity: ramp(t, a.at + 0.2 + j * 0.12, 0.25) }} title={`#${h.seq} ${h.actor} · ${h.action}`}>
                    {h.hash}
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>

      {end > 0 && (
        <div className="lp-endcard" style={{ opacity: end }}>
          <Vault turn={ramp(t, END_CARD_AT + 0.4, 1.2)} />
          <p className="lp-endcard-line">
            You can talk it into anything <em>except moving money.</em>
          </p>
          <dl className="lp-endcard-facts">
            <div>
              <dt>{CASE_FACTS.verdictSeconds.toFixed(1)}s</dt>
              <dd>from request to verdict</dd>
            </div>
            <div>
              <dt>1 call</dt>
              <dd>to the real vendor, on the number on file</dd>
            </div>
            <div>
              <dt>$0</dt>
              <dd>moved. The AI never had the key.</dd>
            </div>
          </dl>
          <div className="lp-endcard-actions">
            <button type="button" className="lp-btn lp-btn-ghost" onClick={onReplay}>
              Watch again
            </button>
            <a className="lp-btn lp-btn-primary" href="#your-turn">
              Now try to scam it yourself
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/** The vault door on the end card; its wheel turns shut as the card appears. */
function Vault({ turn }: { turn: number }) {
  const bolts = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg className="lp-vault" viewBox="0 0 420 420" aria-hidden="true">
      <circle cx="210" cy="210" r="196" fill="#0b1824" stroke="#7cc4f5" strokeWidth="6" />
      <circle cx="210" cy="210" r="168" fill="none" stroke="rgba(124, 196, 245, 0.4)" strokeWidth="2" />
      {bolts.map((a) => (
        <rect key={a} x="204" y="20" width="12" height="22" rx="3" fill="#7cc4f5" transform={`rotate(${a} 210 210)`} />
      ))}
      <g transform={`rotate(${-90 * turn} 210 210)`} stroke="#b5defa" strokeWidth="8" strokeLinecap="round" fill="none">
        <circle cx="210" cy="210" r="86" strokeWidth="5" />
        <path d="M210 112 L210 308 M112 210 L308 210 M141 141 L279 279 M279 141 L141 279" />
      </g>
      <circle cx="210" cy="210" r="30" fill="#0b1824" stroke="#b5defa" strokeWidth="5" />
      <circle cx="210" cy="210" r="9" fill="#b5defa" />
    </svg>
  );
}
