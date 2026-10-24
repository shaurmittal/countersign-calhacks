"use client";
// Hash-chained audit trail for one case (spec §7.2, right). Newest first.
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { clockTime } from "./format";

const HASH_PREFIX_CHARS = 12;

export function AuditTrail({ caseId }: { caseId: Id<"cases"> }) {
  const events = useQuery(api.audit.forCase, { caseId });
  return (
    <section className="panel grow" aria-labelledby="audit-heading">
      <h2 id="audit-heading">Audit trail · sha256(prev + event)</h2>
      {events === undefined ? (
        <p className="empty">Loading…</p>
      ) : (
        <ol className="audit" reversed>
          {[...events].reverse().map((e) => (
            <li key={e._id} title={`${clockTime(e.at)} · prev ${e.prevHash.slice(0, HASH_PREFIX_CHARS)}`}>
              <span>#{e.seq}</span>
              <span>
                {e.actor} · {e.action}
              </span>
              <span className="hash">{e.hash.slice(0, HASH_PREFIX_CHARS)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
