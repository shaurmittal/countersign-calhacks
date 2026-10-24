"use client";
// The owner's block and trust lists (page: P4, logic: P3). Every change needs a code from the authenticator
// app, checked server-side (convex/senderLists.ts). Values arrive masked, so this page holds no numbers.
// Block: any request from or to the entry is refused (R16). Trust: the sender counts as on file for one
// vendor (R3) and nothing else, so bank changes still need a callback and the owner's approval.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { OWNER_CODE } from "../../shared/config";
import { clockTime } from "../components/format";

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

  return (
    <section className="lists" aria-labelledby="lists-title">
      <h2 id="lists-title">Block and trust lists</h2>
      <p className="code-help">
        Block refuses anything from or to an entry. Trust only says a sender belongs to a vendor: bank changes still
        need a callback and your approval.
      </p>

      <div className="code-form">
        <label htmlFor="lists-code">Code from your authenticator app</label>
        <input
          id="lists-code"
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OWNER_CODE.digits}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, OWNER_CODE.digits))}
        />
        <p className="code-help">Each add or remove uses one code. Wait for the next one before the next change.</p>
      </div>

      <form className="list-form" onSubmit={onAdd}>
        <div className="segmented" role="radiogroup" aria-label="List">
          {(["deny", "trust"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className="seg" onClick={() => chooseKind(k)}>
              {k === "deny" ? "Block" : "Trust for a vendor"}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Match</span>
          <select value={match} onChange={(e) => setMatch(e.target.value as Match)}>
            {matches.map((m) => (
              <option key={m} value={m}>
                {MATCH_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{MATCH_LABELS[match]}</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={PLACEHOLDERS[match]} required />
        </label>
        {kind === "trust" && (
          <label className="field">
            <span>Vendor</span>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} required>
              <option value="">Choose a vendor…</option>
              {(vendors ?? []).map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Why" />
        </label>
        <label className="field">
          <span>Expires after (days, optional)</span>
          <input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="Never" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={!codeReady || value.trim() === ""}>
          {kind === "deny" ? "Add to block list" : "Add to trust list"}
        </button>
      </form>

      <div aria-live="polite">{result && <p className={`result ${result.ok ? "ok" : "bad"}`}>{result.text}</p>}</div>

      {lists === undefined ? (
        <p className="muted">Loading…</p>
      ) : lists.entries.length === 0 ? (
        <p className="muted">No entries yet.</p>
      ) : (
        <ul className="feed">
          {lists.entries.map((entry) => (
            <EntryItem key={entry.id} entry={entry} disabled={!codeReady} onRemove={() => run(() => remove({ entryId: entry.id, code }))} />
          ))}
        </ul>
      )}

      {lists && lists.knownBad.length > 0 && (
        <>
          <h2>Marked bad after a denied callback</h2>
          <ul className="feed">
            {lists.knownBad.map((k, i) => (
              <li key={`${k.vendorName}-${i}`}>
                <time>Never counts as on file again</time>
                {k.value} · claimed to be {k.vendorName}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function EntryItem({ entry, disabled, onRemove }: { entry: Entry; disabled: boolean; onRemove: () => void }) {
  return (
    <li className="list-entry" data-kind={entry.kind} data-expired={entry.expired}>
      <div>
        <time dateTime={new Date(entry.createdAt).toISOString()}>
          {entry.kind === "deny" ? "Blocked" : `Trusted for ${entry.vendorName ?? "a vendor"}`} · {MATCH_LABELS[entry.match]} ·
          added {clockTime(entry.createdAt)}
          {entry.expired ? " · expired" : entry.expiresAt ? ` · until ${new Date(entry.expiresAt).toLocaleDateString()}` : ""}
        </time>
        <span className="list-value">{entry.value}</span>
        {entry.note && <span className="muted"> · {entry.note}</span>}
      </div>
      <button type="button" className="btn btn-danger" disabled={disabled} onClick={onRemove} aria-label={`Remove ${entry.value}`}>
        Remove
      </button>
    </li>
  );
}
