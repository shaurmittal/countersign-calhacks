"use client";
// The request as it arrived and Countersign's reply (inside the live strip), and the strip bays: every
// recent case as a strip in the bay its state puts it in. Two judges can test at once; click a strip to pin it.
import { motion } from "framer-motion";
import { Bot, Landmark, Mail, MessageCircle, MessageSquare, MessageSquareText, Phone, Paperclip } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import type { CaseRow } from "./DecisionCard";
import { verdictWord } from "./DecisionCard";
import { authBadge } from "../../shared/email/auth";
import { formatCents } from "../../shared/ledger";
import type { PaymentRequest } from "../../shared/types";
import { cn } from "../ui/cn";
import { spring } from "../ui/motion";
import { decisionTone, Stamp, Tag } from "../ui/primitives";
import { channelLabel, clockTime } from "./format";

const ICONS: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  agent: Bot,
  web: MessageSquareText,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  bank: Landmark,
};

export function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  const Icon = ICONS[channel] ?? MessageSquare;
  return <Icon className={cn("size-[15px] stroke-[1.75] text-muted-foreground", className)} aria-hidden="true" />;
}

export function IncomingMessage({ c }: { c: CaseRow }) {
  const email = c.channel === "email" ? c.emailSignals : null;
  return (
    <div className="space-y-5 px-4 py-5 sm:px-6" aria-live="polite">
      <div>
        <blockquote className="text-[16px] leading-relaxed tracking-[-0.01em] text-foreground sm:text-[17px]">
          {email ? emailBody(c.rawContent) : c.rawContent}
        </blockquote>
        {email && <EmailBadges email={email} />}
      </div>
      {c.replyText && (
        <motion.div
          key={c.replyText}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.smooth}
          className="rounded-lg border border-border bg-white/[0.02] px-4 py-3"
        >
          <p className="mb-1.5 text-[12px] text-muted-foreground">
            {email ? (
              <>Countersign&apos;s draft reply · not sent · Re: {email.subject || "(no subject)"}</>
            ) : (
              <>Countersign replied</>
            )}
          </p>
          <p className="text-[14px] leading-relaxed text-foreground/90">{c.replyText}</p>
        </motion.div>
      )}
    </div>
  );
}

type EmailView = NonNullable<CaseRow["emailSignals"]>;

/** "Subject: x\n\nbody" -> "x — body" on one line. */
function emailBody(raw: string): string {
  const m = raw.match(/^Subject: (.*)\n\n([\s\S]*)$/);
  return m ? `${m[1]} — ${m[2].replace(/\s+/g, " ")}` : raw;
}

/** What the receiving mail server proved about the sender, in one glance. */
function EmailBadges({ email }: { email: EmailView }) {
  const a = email.auth;
  const verdict = a.verdict === "pass" ? "pass" : a.verdict === "fail" ? "fail" : "unknown";
  const label = verdict === "pass" ? "Authenticated" : verdict === "fail" ? "Failed authentication" : "Unverified sender";
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      <Tag tone={verdict === "pass" ? "neutral" : verdict === "fail" ? "block" : "hold"} title={authTitle(a)}>
        {label} · {authBadge(a)}
      </Tag>
      {a.replyToDomain && <Tag tone="block">Replies go to {a.replyToDomain}</Tag>}
      {a.displayNameClaims && <Tag tone="block">Name poses as {a.displayNameClaims}</Tag>}
      {email.forwardedBy && <Tag tone="quiet">Forwarded by the owner</Tag>}
      {email.pdf && (
        <Tag tone="quiet">
          <Paperclip className="size-3" aria-hidden="true" /> {email.pdf.name}
        </Tag>
      )}
      {email.simulated && (
        <Tag tone="quiet" title="Crafted headers from /try, through the real parser and pipeline">
          Simulated
        </Tag>
      )}
    </div>
  );
}

function authTitle(a: EmailView["auth"]): string {
  return `SPF ${a.spf}, DKIM ${a.dkim}, DMARC ${a.dmarc}, as reported by the receiving mail server`;
}

/** Closed holds sit apart from "Waiting": nobody is being asked anything, so the strip isn't waiting on a person. */
const BAYS: { id: string; title: string; holds: (c: CaseRow) => boolean }[] = [
  { id: "working", title: "Working", holds: (c) => ["RECEIVED", "PARSED", "VERIFYING", "DECIDED"].includes(c.status) },
  { id: "waiting", title: "Waiting on a person", holds: (c) => c.status === "CALLBACK_PENDING" || c.status === "AWAITING_OWNER" },
  { id: "cleared", title: "Cleared and paid", holds: (c) => c.status === "CLOSED" && c.decision === "PAY" },
  { id: "refused", title: "Refused", holds: (c) => c.status === "CLOSED" && c.decision === "BLOCK" },
  { id: "held", title: "Held, or not a payment", holds: (c) => c.status === "CLOSED" && c.decision !== "PAY" && c.decision !== "BLOCK" },
];

const ASK: Record<string, string> = {
  pay_invoice: "pay an invoice",
  change_bank: "change bank details",
  wire: "send a wire",
  gift_cards: "buy gift cards",
  crypto: "pay in crypto",
  update_payroll: "change payroll",
  other: "something else",
  none: "not a payment",
};

/** What the strip asks for, in a few words: "pay an invoice · $362.00". */
function askOf(request: PaymentRequest | undefined): string {
  if (!request) return "reading…";
  const what = ASK[request.requestedAction] ?? request.requestedAction;
  return request.amountCents != null ? `${what} · ${formatCents(request.amountCents)}` : what;
}

/** Every recent case as a strip in its bay. Every bay keeps its slot; refused strips stay on the board, struck through. */
export function CaseQueue(props: {
  cases: CaseRow[];
  selectedId: Id<"cases"> | null;
  onSelect: (id: Id<"cases">) => void;
}) {
  return (
    <div>
      <p className="mb-2 grid grid-cols-[64px_18px_minmax(0,1fr)_auto] gap-2.5 border-b border-border px-3 pb-2 text-[12px] text-subtle" aria-hidden="true">
        <span>Time</span>
        <span />
        <span>From · ask</span>
        <span>Verdict</span>
      </p>
      <div className="space-y-4" role="list" aria-label="Cases by state">
        {BAYS.map((bay) => {
          const strips = props.cases.filter(bay.holds);
          return (
            <section key={bay.id} role="listitem" aria-label={bay.title}>
              <p className="mb-1.5 flex items-center justify-between px-1 text-[13px] text-muted-foreground">
                {bay.title}
                <span className="font-mono text-subtle">{strips.length}</span>
              </p>
              {strips.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-subtle">None</p>
              ) : (
                <motion.ol layout className="space-y-px overflow-hidden rounded-lg border border-border bg-border">
                  {strips.map((c) => (
                    <Strip key={c._id} c={c} selected={c._id === props.selectedId} onSelect={() => props.onSelect(c._id)} />
                  ))}
                </motion.ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Strip({ c, selected, onSelect }: { c: CaseRow; selected: boolean; onSelect: () => void }) {
  const request = c.request as PaymentRequest | undefined;
  const refused = c.status === "CLOSED" && c.decision === "BLOCK";
  const who = request?.claimedVendorName ?? c.fromAddress;
  return (
    // layoutId: when a strip is stamped it travels from its old bay to its new one.
    <motion.li layoutId={`strip-${c._id}`} transition={spring.morph} className="relative bg-background">
      {selected && <motion.span layoutId="strip-selected" className="absolute inset-0 bg-white/[0.08]" transition={spring.morph} />}
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className="relative grid w-full grid-cols-[64px_18px_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
      >
        <time className="font-mono text-[13px] text-subtle">{clockTime(c.createdAt).replace(/:\d\d /, " ")}</time>
        <ChannelIcon channel={c.channel} className="size-[15px]" />
        <span className="min-w-0">
          <span className={cn("block truncate text-[14px]", selected ? "text-foreground" : "text-foreground/90", refused && "struck")}>{who}</span>
          <span className="block truncate text-[13px] text-muted-foreground">{askOf(request)}</span>
        </span>
        <Stamp tone={decisionTone(c.decision)} size="sm">
          {c.decision ? verdictWord(c.decision, request) : "…"}
        </Stamp>
      </button>
    </motion.li>
  );
}
