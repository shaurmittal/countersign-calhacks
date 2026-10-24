"use client";
// Hash-chained audit trail for one case (spec §7.2, right). Newest first, latest few only.
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { clockTime } from "./format";

const HASH_PREFIX_CHARS = 12;
const TICKER_LENGTH = 6;

export function AuditTrail({ caseId }: { caseId: Id<"cases"> }) {
  const events = useQuery(api.audit.forCase, { caseId });
  if (events === undefined) return <p className="wr-muted">Loading audit trail…</p>;
  return (
    <ol className="lp-chain wr-ticker" aria-label="Audit trail, newest first">
      {[...events].reverse().slice(0, TICKER_LENGTH).map((e) => (
        <li key={e._id} className="wr-rise" title={`${clockTime(e.at)} · prev ${e.prevHash.slice(0, HASH_PREFIX_CHARS)}`}>
          <b>#{e.seq}</b> {e.actor} · {e.action}
          <span className="wr-hash">{e.hash.slice(0, HASH_PREFIX_CHARS)}</span>
        </li>
      ))}
    </ol>
  );
}
