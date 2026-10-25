"use client";
// The request as it arrived and Countersign's reply (the caption under the room), and the case tabs:
// every recent case, newest first, so two judges can test at once; click a tab to pin it.
import { motion } from "framer-motion";
import { Bot, Landmark, Mail, MessageCircle, MessageSquare, MessageSquareText, Phone, Paperclip, Radio } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import type { CaseRow } from "./DecisionCard";
import { authBadge } from "../../shared/email/auth";
import { cn } from "../ui/cn";
import { spring } from "../ui/motion";
import { decisionTone, Tag } from "../ui/primitives";
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

/** The caption: who asked for what, in their words, and what Countersign said back. Sized for the back of a room. */
export function IncomingMessage({ c }: { c: CaseRow }) {
  const email = c.channel === "email" ? c.emailSignals : null;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface px-5 py-4" aria-live="polite">
      <div>
        <p className="mb-1.5 truncate font-mono text-[11.5px] uppercase tracking-[0.12em] text-foreground">
          {channelLabel(c.channel)} <span className="text-subtle">· from {c.fromAddress} · {clockTime(c.createdAt)}</span>
        </p>
        <blockquote className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-foreground">
          {email ? emailBody(c.rawContent) : c.rawContent}
        </blockquote>
        {email && <EmailBadges email={email} />}
      </div>
      {c.replyText && (
        <motion.div key={c.replyText} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="border-t border-border pt-3">
          <p className="mb-1.5 font-mono text-[11.5px] uppercase tracking-[0.12em] text-accent">
            Countersign{" "}
            <span className="text-subtle">{email ? `· draft reply · not sent · Re: ${email.subject || "(no subject)"}` : "· replied"}</span>
          </p>
          <p className="text-[15px] leading-snug text-foreground/90">{c.replyText}</p>
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

const DOT: Record<string, string> = {
  pay: "bg-pay",
  block: "bg-block",
  hold: "bg-hold",
  owner: "bg-owner",
  code: "bg-code",
  quiet: "bg-white/40",
  neutral: "bg-white/25",
};

/** Every recent case as a tab, newest first: time, channel, and a dot in its verdict's colour. */
export function CaseQueue(props: {
  cases: CaseRow[];
  selectedId: Id<"cases"> | null;
  following: boolean;
  onSelect: (id: Id<"cases">) => void;
  onFollow: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ol className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Cases, newest first">
        {props.cases.map((c) => {
          const selected = c._id === props.selectedId;
          return (
            <li key={c._id} className="relative shrink-0">
              {selected && <motion.span layoutId="case-tab" className="absolute inset-0 rounded-lg border border-accent/50 bg-accent/[0.08]" transition={spring.morph} />}
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => props.onSelect(c._id)}
                className={cn("relative flex h-9 items-center gap-2 rounded-lg px-3 text-[13.5px] transition-colors", selected ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <span className="font-mono text-[12.5px] text-subtle">{clockTime(c.createdAt)}</span>
                <ChannelIcon channel={c.channel} className={selected ? "text-foreground" : undefined} />
                <span className="hidden lg:inline">{channelLabel(c.channel)}</span>
                <span className={cn("size-2 rounded-full", DOT[decisionTone(c.decision)])} aria-hidden="true" />
                <span className="sr-only">{c.decision ?? c.status.toLowerCase().replace("_", " ")}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {!props.following && (
        <button
          type="button"
          onClick={props.onFollow}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-[13px] text-foreground hover:bg-white/[0.06]"
        >
          <Radio className="size-4" aria-hidden="true" />
          Follow newest
        </button>
      )}
    </div>
  );
}
