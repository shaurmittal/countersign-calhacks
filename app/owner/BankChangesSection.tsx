"use client";
// Lumen Bank payout changes waiting for the owner (logic: P1, convex/bank.ts decideBankChange). The vendor
// already confirmed the change on Countersign's callback; the owner's authenticator code is the second
// signer. Approving moves future payouts to the new account; it never pays anything by itself.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { OWNER_CODE } from "../../shared/config";
import { clockTime, secondsLeft, useNow } from "../components/format";
import { OtpInput } from "../ui/OtpInput";
import { buttonClass, SectionHead, Stamp } from "../ui/primitives";

type Change = FunctionReturnType<typeof api.bank.pendingChanges>[number];

export function BankChangesSection() {
  const changes = useQuery(api.bank.pendingChanges);
  // A decided change leaves the list, so its confirmation is shown here instead of on the card.
  const [done, setDone] = useState<string | null>(null);
  if (!done && (!changes || changes.length === 0)) return null;
  return (
    <section aria-labelledby="bank-changes-title">
      <SectionHead title={<span id="bank-changes-title">Bank-detail changes</span>} />
      <div className="space-y-4">
        {changes?.map((c) => (
          <BankChangeCard key={c.payeeId} item={c} onDone={setDone} />
        ))}
      </div>
      {done && (
        <p className="mt-3 rounded-lg bg-pay/10 px-3 py-2.5 text-[13.5px] text-pay-ink" aria-live="polite">
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
    <article className="overflow-hidden rounded-xl border border-border-strong bg-surface" aria-labelledby={`bank-payee-${item.payeeId}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-6">
        <div>
          <p className="flex items-center gap-3 font-mono text-[28px] font-medium leading-none tracking-[-0.03em] sm:text-[30px]">
            <span className="text-muted-foreground">…{item.fromLast4}</span>
            <ArrowRight className="size-5 text-subtle" aria-hidden="true" />
            <span>…{item.toLast4}</span>
          </p>
          <p className="mt-2.5 text-[16px] font-medium" id={`bank-payee-${item.payeeId}`}>
            {item.name}
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Lumen Bank · new routing <span className="font-mono">{item.toRouting}</span> · vendor confirmed by phone at {clockTime(item.confirmedAt)}
          </p>
        </div>
        <Stamp tone="owner">Needs your code</Stamp>
      </div>
      <div className="space-y-4 px-5 py-5 sm:px-6">
        <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          <li>Countersign called the number on file, and the vendor said they asked for this change.</li>
          <li>Approving moves future payouts to the new account. Nothing is paid now.</li>
        </ul>
        <form className="space-y-3 border-t border-border pt-5" onSubmit={(e) => act("approve", e)}>
          <label htmlFor={codeId} className="block text-[13px] font-medium">
            Code from your authenticator app
          </label>
          <OtpInput id={codeId} length={OWNER_CODE.digits} value={code} onChange={setCode} describedBy={`bank-help-${item.payeeId}`} />
          <p className="text-[12.5px] text-muted-foreground" id={`bank-help-${item.payeeId}`}>
            {lockedFor > 0
              ? `Locked after too many wrong codes. Try again in ${lockedFor}s.`
              : `${OWNER_CODE.digits} digits from the Countersign entry. Codes change every ${OWNER_CODE.periodSeconds} seconds.`}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" className={buttonClass("danger", "h-11")} disabled={!ready} onClick={() => act("decline")}>
              Decline
            </button>
            <button type="submit" className={buttonClass("approve", "h-11")} disabled={!ready}>
              Approve change
            </button>
          </div>
          <div aria-live="polite">{result && <p className="rounded-lg bg-block/10 px-3 py-2.5 text-[13.5px] text-block-ink">{result.text}</p>}</div>
        </form>
      </div>
    </article>
  );
}
