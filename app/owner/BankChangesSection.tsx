"use client";
// Lumen Bank payout changes waiting for the owner (logic: P1, convex/bank.ts decideBankChange). The vendor
// already confirmed the change on Countersign's callback; the owner's authenticator code is the second
// signer. Approving moves future payouts to the new account; it never pays anything by itself.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { OWNER_CODE } from "../../shared/config";
import { clockTime, secondsLeft, useNow } from "../components/format";

type Change = FunctionReturnType<typeof api.bank.pendingChanges>[number];

export function BankChangesSection() {
  const changes = useQuery(api.bank.pendingChanges);
  // A decided change leaves the list, so its confirmation is shown here instead of on the card.
  const [done, setDone] = useState<string | null>(null);
  if (!done && (!changes || changes.length === 0)) return null;
  return (
    <>
      <h2>Bank-detail changes</h2>
      {changes?.map((c) => (
        <BankChangeCard key={c.payeeId} item={c} onDone={setDone} />
      ))}
      {done && (
        <p className="result ok" aria-live="polite">
          {done}
        </p>
      )}
    </>
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
    <article className="approval" data-state="waiting" aria-labelledby={`bank-payee-${item.payeeId}`}>
      <div>
        <div className="approval-amount">
          …{item.fromLast4} → …{item.toLast4}
        </div>
        <div className="approval-payee" id={`bank-payee-${item.payeeId}`}>
          {item.name}
        </div>
        <div className="approval-meta">
          Lumen Bank · new routing {item.toRouting} · vendor confirmed by phone at {clockTime(item.confirmedAt)}
        </div>
      </div>
      <ul>
        <li>Countersign called the number on file and the vendor said they asked for this change.</li>
        <li>Approving moves future payouts to the new account. Nothing is paid now.</li>
      </ul>

      <form className="code-form" onSubmit={(e) => act("approve", e)}>
        <label htmlFor={codeId}>Code from your authenticator app</label>
        <input
          id={codeId}
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OWNER_CODE.digits}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, OWNER_CODE.digits))}
          aria-describedby={`bank-help-${item.payeeId}`}
        />
        <p className="code-help" id={`bank-help-${item.payeeId}`}>
          {lockedFor > 0
            ? `Locked after too many wrong codes. Try again in ${lockedFor}s.`
            : `${OWNER_CODE.digits} digits, from the Countersign entry. Codes change every ${OWNER_CODE.periodSeconds} seconds.`}
        </p>
        <div className="actions">
          <button type="button" className="btn btn-danger" disabled={!ready} onClick={() => act("decline")}>
            Decline
          </button>
          <button type="submit" className="btn btn-primary" disabled={!ready}>
            Approve change
          </button>
        </div>
        <div aria-live="polite">{result && <p className="result bad">{result.text}</p>}</div>
      </form>
    </article>
  );
}
