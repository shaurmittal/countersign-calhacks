"use client";
// The app frame for the War Room, /owner, /bank and /try: a left rail with the four destinations and a
// page header. Rail interaction (hover pill that follows the pointer, active pill that glides between
// items) adapted from EasyUI's Sidebar (MIT: github.com/Surajmaurya1/easyui).
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Landmark, LayoutDashboard, MessageSquareText, Phone, ShieldCheck, SquarePlay } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { cn } from "./cn";
import { spring } from "./motion";
import "./app.css";

const LINE = "+1 (256) 215-6932";

type NavItem = { href: string; label: string; icon: ReactNode; badge?: number };

export function AppShell(props: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  const pending = useQuery(api.owner.pending);
  const changes = useQuery(api.bank.pendingChanges);
  const waiting = (pending?.length ?? 0) + (changes?.length ?? 0);

  const items: NavItem[] = [
    { href: "/", label: "War Room", icon: <LayoutDashboard /> },
    { href: "/owner", label: "Approvals", icon: <ShieldCheck />, badge: waiting || undefined },
    { href: "/bank", label: "Lumen Bank", icon: <Landmark /> },
    { href: "/try", label: "Try to scam it", icon: <MessageSquareText /> },
  ];

  return (
    <div className="cs md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <Rail items={items} />
      <MobileBar items={items} />
      <div className="min-w-0">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border px-4 pb-5 pt-6 sm:px-8 sm:pt-8">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-[26px]">{props.title}</h1>
            {props.subtitle && <div className="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">{props.subtitle}</div>}
          </div>
          {props.actions && <div className="flex shrink-0 items-center gap-2">{props.actions}</div>}
        </header>
        <main className={cn("px-4 pb-16 pt-6 sm:px-8", !props.wide && "max-w-[1180px]")}>{props.children}</main>
      </div>
    </div>
  );
}

function Rail({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const [hover, setHover] = useState<{ y: number; h: number } | null>(null);

  return (
    <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-background md:flex" aria-label="Countersign">
      <a href="/" className="flex h-[68px] items-center gap-2.5 px-5 text-[15px] font-semibold tracking-[-0.02em]">
        <LogoMark />
        Countersign
      </a>
      <nav className="relative flex-1 px-3 pt-2">
        <ul ref={listRef} className="relative space-y-0.5" onMouseLeave={() => setHover(null)}>
          {hover && (
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 rounded-lg bg-white/[0.04]"
              initial={false}
              animate={{ y: hover.y, height: hover.h }}
              transition={spring.snappy}
            />
          )}
          {items.map((item) => {
            const active = item.href === "/" ? path === "/" : path?.startsWith(item.href);
            return (
              <li
                key={item.href}
                onMouseEnter={(e) => {
                  const li = e.currentTarget;
                  setHover({ y: li.offsetTop, h: li.offsetHeight });
                }}
              >
                <a
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span layoutId="rail-active" className="absolute inset-0 rounded-lg bg-white/[0.08]" transition={spring.morph} />
                  )}
                  <span className="relative grid size-5 place-items-center [&>svg]:size-[17px] [&>svg]:stroke-[1.75]">{item.icon}</span>
                  <span className="relative flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="relative rounded-md bg-foreground px-1.5 text-[11px] font-semibold tabular-nums leading-5 text-background">
                      {item.badge}
                    </span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="space-y-3 border-t border-border p-5 text-[12px] leading-relaxed text-muted-foreground">
        <a href={`tel:${LINE.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-foreground hover:underline">
          <Phone className="size-3.5 stroke-[1.75]" />
          <span className="font-mono text-[12px]">{LINE}</span>
        </a>
        <p>Call the line, or type at /try. Every request lands on this board.</p>
        <a href="/demo" className="flex items-center gap-2 hover:text-foreground">
          <SquarePlay className="size-3.5 stroke-[1.75]" />
          Watch the film
        </a>
      </div>
    </aside>
  );
}

function MobileBar({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur md:hidden">
      <div className="flex h-12 items-center gap-2 px-4 text-[14px] font-semibold tracking-[-0.02em]">
        <LogoMark />
        Countersign
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Pages">
        {items.map((item) => {
          const active = item.href === "/" ? path === "/" : path?.startsWith(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] [&>svg]:size-[14px]",
                active ? "bg-white/[0.1] text-foreground" : "text-muted-foreground",
              )}
            >
              {item.icon}
              {item.label}
              {item.badge ? <span className="rounded bg-foreground px-1 text-[10px] font-semibold text-background">{item.badge}</span> : null}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

/** The padlock with a check: the check turns green, the one place the logo uses color. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9.5 15.6l1.8 1.8 3.4-3.6" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
