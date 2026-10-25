---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/owner/page.tsx","app/bank/page.tsx","app/try/page.tsx"]
---

# Surface: Countersign app (War Room `/`, `/owner`, `/bank`, `/try`)

Mode: Operate. Audience: judges watching the War Room projected on stage, and the solo founder (Priya) operating approvals on her phone. Task: see what Countersign did with each request, why, and act (approve/decline with a code, try a scam, watch the bank refuse a hijacked agent). Constraints: every value is a live Convex row; code freeze 4:30 AM; `/demo` and `/judge-card` are out of scope.

## Direction contract

THESIS: Every payment request is a flight strip a controller must clear before it lands; nothing moves money without a cleared strip. Refuses the category default of a KPI-card admin template with a chart nobody reads.

OWN-WORLD: OLED black (#000) bays, white as the secondary ink at stepped alphas, one-device-pixel white hairlines, strips as long low rows with a fixed column grammar (time · channel · from · ask · amount · verdict stamp). Green (#22c55e family) only when money is cleared or an approval lands; red (#ef4444 family) only for refusals; amber for holds, kept small. Geist for everything, Geist Mono for amounts, hashes, codes, times. EasyUI motion: spring-settled rows, agent activity timeline, OTP input, animated numbers.

STORY: A judge sees a request arrive as a new strip, watches the fixed roster of agents tick through it in order, and sees the verdict stamped at the strip's end in green or red. The founder sees what waits for her code and clears it.

FIRST VIEWPORT: Left rail (logo, four destinations, live line number). Top: one hairline-ruled metrics rail (requests, scams refused, lost to scams $0 in green, bills paid, median decision, audit chain). Centre, dominant: the live case as a wide expanded strip — the message, the verdict stamp large at its right end, fired rules — with the agent roster beneath in fixed slots. Right column: strip bays (Working, Waiting, Cleared, Refused) and the audit feed. Primary action: select a strip; "Follow newest" returns.

FORM: Flight Strip Board, position 3 of 7 on the grounded list; seed key 54d05fbe. Raises: fixed columns (split-flap), nothing disappears it cancels (ticket wallet), one region dominates (zoo map), fixed roster (character catalog), hairline discipline (centre rail).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
