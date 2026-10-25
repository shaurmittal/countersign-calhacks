"use client";
// The owner's block and trust lists (page: P4, logic: P3). Every change needs a code from the authenticator
// app, checked server-side (convex/senderLists.ts). Values arrive masked, so this page holds no numbers.
// Block: any request from or to the entry is refused (R16). Trust: the sender counts as on file for one
// vendor (R3) and nothing else, so bank changes still need a callback and the owner's approval.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { OWNER_CODE } from "../../shared/config";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { clockTime } from "../components/format";
import { cn } from "../ui/cn";
import { spring } from "../ui/motion";
import { OtpInput } from "../ui/OtpInput";
import { buttonClass, SectionHead, Stamp } from "../ui/primitives";

type Lists = FunctionReturnType<typeof api.senderLists.list>;
type Entry = Lists["entries"][number];
type Kind = "deny" | "trust";
type Match = "phone" | "email" | "domain" | "bank";
type Result = { ok: boolean; text: string } | null;

const MATCH_LABELS: Record<Match, string> = { phone: "Phone number", email: "Email", domain: "Domain", bank: "Bank account" };
const PLACEHOLDERS: Record<Match, string> = {
  phone: "+1 555 555 0199",
  email: "billing@example.com",
  domain: "pixelandpine-billing.example",
  bank: "021000021 9921",
};

export function ListsSection() {
  const lists = useQuery(api.senderLists.list);
  const vendors = useQuery(api.senderLists.vendors);
  const add = useMutation(api.senderLists.add);
  const remove = useMutation(api.senderLists.remove);

  const [code, setCode] = useState("");
  const [kind, setKind] = useState<Kind>("deny");
  const [match, setMatch] = useState<Match>("phone");
  const [value, setValue] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  const codeReady = code.length === OWNER_CODE.digits && !busy;
  const matches: Match[] = kind === "deny" ? ["phone", "email", "domain", "bank"] : ["phone", "email", "domain"];

  async function run(action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setBusy(true);
    setResult(null);
    try {
      const res = await action();
      setResult(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
      if (res.ok) setCode(""); // a code works once
      return res.ok;
    } catch {
      setResult({ ok: false, text: "Couldn't reach Countersign. Check your connection and try again." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      add({
        kind,
        match,
        value,
        vendorId: kind === "trust" && vendorId ? (vendorId as Id<"vendors">) : undefined,
        note: note.trim() || undefined,
        expiresInDays: days.trim() ? Number(days) : undefined,
        code,
      }),
    );
    if (ok) {
      setValue("");
      setNote("");
      setDays("");
    }
  }

  function chooseKind(next: Kind) {
    setKind(next);
    if (next === "trust" && match === "bank") setMatch("phone");
  }

  const field = "h-10 w-full rounded-lg border border-border-strong bg-background px-3 text-[14px] text-foreground outline-none transition-colors focus:border-foreground";
  return (
    <section aria-labelledby="lists-title">
      <h3 id="lists-title" className="sr-only">Block and trust lists</h3>
      <p className="mb-4 max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">
        Block refuses anything from or to an entry. Trust only says a sender belongs to a vendor: bank changes still
        need a callback and your approval.
      </p>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="space-y-3 border-b border-border px-5 py-5 sm:px-6">
          <label htmlFor="lists-code" className="block text-[13px] font-medium">
            Code from your authenticator app
          </label>
          <OtpInput id="lists-code" length={OWNER_CODE.digits} value={code} onChange={setCode} describedBy="lists-code-help" />
          <p id="lists-code-help" className="text-[12.5px] text-muted-foreground">
            Each add or remove uses one code. Wait for the next one before the next change.
          </p>
        </div>

        <form className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6" onSubmit={onAdd}>
          <div className="relative grid grid-cols-2 rounded-lg border border-border-strong p-1 sm:col-span-2" role="radiogroup" aria-label="List">
            {(["deny", "trust"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className="relative h-8 rounded-md text-[13px] text-muted-foreground aria-checked:text-foreground"
                onClick={() => chooseKind(k)}
              >
                {kind === k && <motion.span layoutId="list-kind" className="absolute inset-0 rounded-md bg-white/[0.09]" transition={spring.snappy} />}
                <span className="relative">{k === "deny" ? "Block" : "Trust for a vendor"}</span>
              </button>
            ))}
          </div>
          <label className="space-y-1.5 text-[12.5px] text-muted-foreground">
            <span>Match</span>
            <Select value={match} onChange={(v) => setMatch(v as Match)}>
              {matches.map((m) => (
                <option key={m} value={m}>
                  {MATCH_LABELS[m]}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5 text-[12.5px] text-muted-foreground">
            <span>{MATCH_LABELS[match]}</span>
            <input className={cn(field, "font-mono")} value={value} onChange={(e) => setValue(e.target.value)} placeholder={PLACEHOLDERS[match]} required />
          </label>
          {kind === "trust" && (
            <label className="space-y-1.5 text-[12.5px] text-muted-foreground sm:col-span-2">
              <span>Vendor</span>
              <Select value={vendorId} onChange={setVendorId} required>
                <option value="">Choose a vendor…</option>
                {(vendors ?? []).map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="space-y-1.5 text-[12.5px] text-muted-foreground">
            <span>Note (optional)</span>
            <input className={field} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Why" />
          </label>
          <label className="space-y-1.5 text-[12.5px] text-muted-foreground">
            <span>Expires after (days, optional)</span>
            <input className={field} value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="Never" />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" className={buttonClass("primary")} disabled={!codeReady || value.trim() === ""}>
              {kind === "deny" ? "Add to block list" : "Add to trust list"}
            </button>
            <div aria-live="polite" className="text-[13px]">
              {result && <p className={result.ok ? "text-pay-ink" : "text-block-ink"}>{result.text}</p>}
            </div>
          </div>
        </form>
      </div>

      {lists === undefined ? (
        <div className="skeleton mt-4 h-14 rounded-lg" />
      ) : lists.entries.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">No entries yet.</p>
      ) : (
        <ul className="mt-4 space-y-px overflow-hidden rounded-xl border border-border bg-border">
          {lists.entries.map((entry) => (
            <EntryItem key={entry.id} entry={entry} disabled={!codeReady} onRemove={() => run(() => remove({ entryId: entry.id, code }))} />
          ))}
        </ul>
      )}

      {lists && lists.knownBad.length > 0 && (
        <div className="mt-8">
          <SectionHead title="Marked bad after a denied callback" />
          <ul className="space-y-px overflow-hidden rounded-xl border border-border bg-border">
            {lists.knownBad.map((k, i) => (
              <li key={`${k.vendorName}-${i}`} className="flex flex-wrap items-center justify-between gap-2 bg-background px-4 py-3 text-[13px]">
                <span>
                  <span className="font-mono text-foreground">{k.value}</span>
                  <span className="text-muted-foreground"> · claimed to be {k.vendorName}</span>
                </span>
                <span className="text-[12px] text-block-ink">Never counts as on file again</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** A native select themed like the inputs: same height, ink and border, and a drawn chevron. */
function Select(props: { value: string; onChange: (value: string) => void; required?: boolean; children: ReactNode }) {
  return (
    <span className="relative block">
      <select
        value={props.value}
        required={props.required}
        onChange={(e) => props.onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-lg border border-border-strong bg-background pl-3 pr-9 text-[14px] text-foreground outline-none transition-colors focus:border-foreground"
      >
        {props.children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </span>
  );
}

function EntryItem({ entry, disabled, onRemove }: { entry: Entry; disabled: boolean; onRemove: () => void }) {
  return (
    <li className={cn("flex items-center justify-between gap-3 bg-background px-4 py-3", entry.expired && "opacity-55")}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <Stamp tone={entry.kind === "deny" ? "block" : "neutral"} size="sm">
            {entry.kind === "deny" ? "Blocked" : "Trusted"}
          </Stamp>
          <span className="truncate font-mono text-[13.5px]">{entry.value}</span>
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {entry.kind === "trust" && `For ${entry.vendorName ?? "a vendor"} · `}
          {MATCH_LABELS[entry.match]} · added {clockTime(entry.createdAt)}
          {entry.expired ? " · expired" : entry.expiresAt ? ` · until ${new Date(entry.expiresAt).toLocaleDateString()}` : ""}
          {entry.note && ` · ${entry.note}`}
        </p>
      </div>
      <button type="button" className={buttonClass("ghost", "h-8 shrink-0 px-3")} disabled={disabled} onClick={onRemove} aria-label={`Remove ${entry.value}`}>
        Remove
      </button>
    </li>
  );
}
