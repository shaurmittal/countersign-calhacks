"use client";
// Hash-chained audit trail for one case (spec §7.2). Newest first; each event carries the hash that chains it
// to the one before. Row insertion motion adapted from EasyUI's Activity Feed (MIT: github.com/Surajmaurya1/easyui).
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { spring } from "../ui/motion";
import { clockTime } from "./format";

const HASH_PREFIX_CHARS = 10;
const FEED_LENGTH = 8;

export function AuditTrail({ caseId }: { caseId: Id<"cases"> }) {
  const events = useQuery(api.audit.forCase, { caseId });
  if (events === undefined) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-8" />
        ))}
      </div>
    );
  }
  const latest = [...events].reverse().slice(0, FEED_LENGTH);
  return (
    <ol className="space-y-px overflow-hidden rounded-lg border border-border bg-border" aria-label="Audit trail, newest first">
      <AnimatePresence initial={false}>
        {latest.map((e) => (
          <motion.li
            key={e._id}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.smooth}
            className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 bg-background px-3 py-2.5"
            title={`${clockTime(e.at)} · prev ${e.prevHash.slice(0, HASH_PREFIX_CHARS)}`}
          >
            <span className="font-mono text-[13px] leading-5 text-subtle">#{e.seq}</span>
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] leading-5 text-foreground/90">
                <span className="text-muted-foreground">{e.actor}</span> · {e.action}
              </span>
              <span className="block truncate font-mono text-[13px] leading-5 text-subtle">{e.hash.slice(0, HASH_PREFIX_CHARS)}…</span>
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
