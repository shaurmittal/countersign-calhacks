"use client";
// Lumen Bank payout changes waiting for the owner (logic: P1, convex/bank.ts decideBankChange). The vendor
// already confirmed the change on Countersign's callback; the owner's authenticator code is the second
// signer. Approving moves future payouts to the new account; it never pays anything by itself.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { OWNER_CODE } from "../../shared/config";
import { CodeBoxes } from "./CodeBoxes";
import { clockTime, secondsLeft, useNow } from "../components/format";

type Change = FunctionReturnType<typeof api.bank.pendingChanges>[number];

export function BankChangesSection() {
  const changes = useQuery(api.bank.pendingChanges);
  // A decided change leaves the list, so its confirmation is shown here instead of on the card.
  const [done, setDone] = useState<string | null>(null);
  if (!done && (!changes || changes.length === 0)) return null;
  return (
    <section className="ow-section" aria-labelledby="bank-changes-h">
      <h2 id="bank-changes-h" className="ow-h">
        Bank-detail changes
      </h2>
      {changes?.map((c) => (
        <BankChangeCard key={c.payeeId} item={c} onDone={setDone} />
      ))}
      {done && (
        <p className="ow-result ok" aria-live="polite">
          {done}
        </p>
      )}
    </section>
  );
}

function BankChangeCard({ item, onDone }: { item: Change; onDone: (message: string) => void }) {
  const now = useNow();
  const decide = useMutation(api.bank.decideBankChange);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string } | null>(null);

  const lockedFor = item.lockedUntil && item.lockedUntil > now ? secondsLeft(item.lockedUntil, now) : 0;
  const codeId = `bank-code-${item.payeeId}`;

  async function act(action: "approve" | "decline", e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await decide({ payeeId: item.payeeId, code, action });
      if (res.ok) onDone(res.message);
      else setResult({ text: res.error });
    } catch {
      setResult({ text: "Couldn't reach Countersign. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const ready = code.length === OWNER_CODE.digits && !busy && lockedFor === 0;
  return (
    <article className="ow-card" data-state="waiting" aria-labelledby={`bank-payee-${item.payeeId}`}>
      <div className="ow-card-head">
        <span className="ow-badge">New bank details</span>
        <span className="ow-meta">Lumen Bank · confirmed by phone at {clockTime(item.confirmedAt)}</span>
      </div>
      <div className="ow-amount ow-amount-sm">
        …{item.fromLast4} <span className="ow-arrow">→</span> …{item.toLast4}
      </div>
      <p className="ow-payee" id={`bank-payee-${item.payeeId}`}>
        <b>{item.name}</b>
        <span className="ow-mono"> · new routing {item.toRouting}</span>
      </p>
      <div className="ow-why">
        <p className="ow-why-title">What happened</p>
        <ul>
          <li>
            <span className="ow-rule">R2</span>
            <span>Countersign called the number on file and the vendor said they asked for this change.</span>
          </li>
          <li>
            <span className="ow-rule">$0</span>
            <span>Approving moves future payouts to the new account. Nothing is paid now.</span>
          </li>
        </ul>
      </div>

      <form className="ow-form" onSubmit={(e) => act("approve", e)}>
        <CodeBoxes id={codeId} value={code} onChange={setCode} describedBy={`bank-help-${item.payeeId}`} disabled={lockedFor > 0} />
        <p className="ow-help" id={`bank-help-${item.payeeId}`}>
          {lockedFor > 0
            ? `Locked after too many wrong codes. Try again in ${lockedFor}s.`
            : `${OWNER_CODE.digits} digits from the Countersign entry in your authenticator app. Each code works once.`}
        </p>
        <div className="ow-actions">
          <button type="button" className="ow-btn ow-btn-danger" disabled={!ready} onClick={() => act("decline")}>
            Decline
          </button>
          <button type="submit" className="ow-btn ow-btn-approve" disabled={!ready}>
            Approve change
          </button>
        </div>
        <div aria-live="polite">{result && <p className="ow-result bad">{result.text}</p>}</div>
      </form>
    </article>
  );
}
