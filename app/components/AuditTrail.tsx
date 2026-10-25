"use client";
// Hash-chained audit trail for one case (spec §7.2), as a ticker along the bottom of the room: newest first,
// each event with the hash that chains it to the one before. New events slide in from the left.
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Link2 } from "lucide-react";
import { Fragment } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { spring } from "../ui/motion";
import { clockTime } from "./format";

const HASH_PREFIX_CHARS = 10;
const TICKER_LENGTH = 8;

export function AuditTrail({ caseId }: { caseId: Id<"cases"> }) {
  const events = useQuery(api.audit.forCase, { caseId });
  const latest = events ? [...events].reverse().slice(0, TICKER_LENGTH) : null;
  return (
    <section aria-label="Audit trail for this case, newest first" className="flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-surface px-4 py-2.5">
      <p className="flex shrink-0 items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-[0.12em] text-code-ink">
        <Link2 className="size-3.5" aria-hidden="true" />
        Audit chain
      </p>
      <ol className="flex min-w-0 items-center gap-2 overflow-hidden [mask-image:linear-gradient(to_right,black_85%,transparent)]">
        {latest === null ? (
          <li className="skeleton h-7 w-[60%]" />
        ) : (
          <AnimatePresence initial={false}>
            {latest.map((e, i) => (
              <Fragment key={e._id}>
                {i > 0 && <ArrowLeft className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />}
                <motion.li
                  layout
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={spring.smooth}
                  className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-code/20 bg-code/[0.05] px-2.5 py-1 font-mono text-[12.5px]"
                  title={`${clockTime(e.at)} · prev ${e.prevHash.slice(0, HASH_PREFIX_CHARS)}`}
                >
                  <b className="font-semibold text-code-ink">#{e.seq}</b>
                  <span className="text-muted-foreground">{e.actor}</span>
                  <span className="text-foreground/90">{e.action}</span>
                  <span className="text-subtle">{e.hash.slice(0, HASH_PREFIX_CHARS)}</span>
                </motion.li>
              </Fragment>
            ))}
          </AnimatePresence>
        )}
      </ol>
    </section>
  );
}
