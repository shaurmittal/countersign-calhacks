"use client";
// The app frame for the War Room, /owner, /bank and /try: one top bar everywhere (logo, the four pages, the
// film, the phone line), so the room on a projector and the owner's phone read as one product. Pages with a
// title get a header under it; the War Room goes straight to its stage. The active-page pill glides between
// items (shared-layout spring, as in EasyUI's navigation, MIT: github.com/Surajmaurya1/easyui).
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Landmark, LayoutDashboard, MessageSquareText, Phone, ShieldCheck, SquarePlay } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { cn } from "./cn";
import { spring } from "./motion";
import "./app.css";

const LINE = "+1 (256) 215-6932";

type NavItem = { href: string; label: string; icon: ReactNode; badge?: number };

const PAGE_TONE = {
  owner: "border-owner/40 bg-owner/12 text-owner-ink shadow-[0_0_24px_rgba(195,166,255,0.18)]",
  code: "border-code/40 bg-code/12 text-code-ink shadow-[0_0_24px_rgba(124,196,245,0.18)]",
  accent: "border-accent/40 bg-accent/12 text-accent-ink shadow-[0_0_24px_rgba(242,176,76,0.18)]",
};

/** A titled page (Approvals, Lumen Bank, Try to scam it), its icon tile in the page's colour. */
export function AppShell(props: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  icon?: ReactNode;
  tone?: keyof typeof PAGE_TONE;
}) {
  return (
    <Frame>
      <div className={cn("mx-auto", props.wide ? "max-w-[1480px]" : "max-w-[1240px]")}>
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-7 pt-4 sm:pt-8">
          <div className="flex min-w-0 items-start gap-4">
            {props.icon && (
              <span className={cn("mt-1 grid size-11 shrink-0 place-items-center rounded-xl border [&>svg]:size-5 [&>svg]:stroke-[1.75]", PAGE_TONE[props.tone ?? "accent"])}>
                {props.icon}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-[32px]">{props.title}</h1>
              {props.subtitle && <div className="mt-2 max-w-[72ch] text-[14.5px] leading-relaxed text-muted-foreground">{props.subtitle}</div>}
            </div>
          </div>
          {props.actions && <div className="flex shrink-0 items-center gap-2">{props.actions}</div>}
        </header>
        {props.children}
      </div>
    </Frame>
  );
}

/** The War Room: the same bar, the full width, no title block (the stage is the page). */
export function StageShell({ children }: { children: ReactNode }) {
  return <Frame>{children}</Frame>;
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/";
  const pending = useQuery(api.owner.pending);
  const changes = useQuery(api.bank.pendingChanges);
  const waiting = (pending?.length ?? 0) + (changes?.length ?? 0);
  const links: NavItem[] = [
    { href: "/", label: "War Room", icon: <LayoutDashboard /> },
    { href: "/owner", label: "Approvals", icon: <ShieldCheck />, badge: waiting || undefined },
    { href: "/bank", label: "Lumen Bank", icon: <Landmark /> },
    { href: "/try", label: "Try to scam it", icon: <MessageSquareText /> },
  ];
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="cs">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-4 px-4 sm:px-6">
          <a href="/" className="flex shrink-0 items-center gap-2.5 text-[15px] font-semibold tracking-[-0.02em]">
            <LogoMark />
            Countersign
          </a>
          <nav className="ml-3 hidden items-center gap-0.5 md:flex" aria-label="Pages">
            {links.map((l) => {
              const active = isActive(l.href);
              return (
                <a
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13.5px] transition-colors [&>svg]:relative [&>svg]:size-[15px] [&>svg]:stroke-[1.75]",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-white/[0.08] ring-1 ring-white/10" transition={spring.morph} />}
                  {l.icon}
                  <span className="relative">{l.label}</span>
                  {l.badge ? <span className="relative rounded-md bg-owner px-1.5 text-[11px] font-semibold leading-5 text-black">{l.badge}</span> : null}
                </a>
              );
            })}
            <a href="/demo" className="ml-1 flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground">
              <SquarePlay className="size-[15px] stroke-[1.75]" />
              The film
            </a>
          </nav>
          <a
            href={`tel:${LINE.replace(/[^\d+]/g, "")}`}
            className="ml-auto flex h-9 shrink-0 items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 text-[13px] font-medium text-accent-ink transition-colors hover:bg-accent/20"
          >
            <Phone className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Call</span>
            <span className="font-mono">{LINE}</span>
          </a>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] md:hidden" aria-label="Pages">
          {links.map((l) => {
            const active = isActive(l.href);
            return (
              <a
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] [&>svg]:size-[14px]", active ? "bg-white/[0.1] text-foreground" : "text-muted-foreground")}
              >
                {l.icon}
                {l.label}
                {l.badge ? <span className="rounded bg-owner px-1 text-[11px] font-semibold text-black">{l.badge}</span> : null}
              </a>
            );
          })}
        </nav>
      </header>
      <div className="mx-auto max-w-[1680px] px-3 pb-12 pt-3 sm:px-6">{children}</div>
    </div>
  );
}

/** The padlock with a check, in the film's amber. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9.5 15.6l1.8 1.8 3.4-3.6" stroke="#f2b04c" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
