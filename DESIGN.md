---
name: Countersign
description: The second signer a one-person company never had. App UI for the War Room, /owner, /bank and /try.
colors:
  oled-black: "#000000"
  white-ink: "#fafafa"
  bay-surface: "#0a0a0a"
  skeleton-fill: "#121212"
  hairline: "rgb(255 255 255 / 0.09)"
  hairline-strong: "rgb(255 255 255 / 0.16)"
  muted-ink: "#a3a3a3"
  subtle-ink: "#8f8f8f"
  placeholder-ink: "#737373"
  countersign-amber: "#f2b04c"
  countersign-amber-ink: "#ffd08a"
  lock-ice: "#7cc4f5"
  lock-ice-ink: "#b5defa"
  owner-violet: "#c3a6ff"
  owner-violet-ink: "#ddd0ff"
  cleared-green: "#5bd69b"
  cleared-green-ink: "#86e4b6"
  refusal-red: "#ff6b4a"
  refusal-red-ink: "#ff9a82"
  hold-amber: "#f2b04c"
  hold-amber-ink: "#ffd08a"
typography:
  verdict:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.08em"
  verdict-compact:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.08em"
  page-title:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  balance:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "40px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.03em"
  amount:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "30px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.03em"
  amount-compact:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.03em"
  metric-strip:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.02em"
  caption:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "21px"
    fontWeight: 500
    lineHeight: 1.375
    letterSpacing: "-0.015em"
  caption-compact:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.375
  lead:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.375
  explain:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.375
  narration:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.375
  node:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.25
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  figure:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "34px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.03em"
  metric:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  stamp:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.08em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.375
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.006em"
  section:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\""
rounded:
  cell: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  bubble: "16px"
  full: "9999px"
spacing:
  hairline: "1px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  gutter: "32px"
components:
  button-primary:
    backgroundColor: "{colors.white-ink}"
    textColor: "{colors.oled-black}"
    typography: "{typography.section}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-approve:
    backgroundColor: "{colors.cleared-green}"
    textColor: "{colors.oled-black}"
    typography: "{typography.section}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-approve-hover:
    backgroundColor: "{colors.cleared-green-ink}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.refusal-red-ink}"
    typography: "{typography.section}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.white-ink}"
    typography: "{typography.section}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  stamp:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink}"
    typography: "{typography.stamp}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "24px"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.white-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  bay:
    backgroundColor: "{colors.bay-surface}"
    rounded: "{rounded.xl}"
  strip-row:
    backgroundColor: "{colors.oled-black}"
    textColor: "{colors.white-ink}"
    typography: "{typography.body}"
    padding: "10px 12px"
  input-field:
    backgroundColor: "{colors.oled-black}"
    textColor: "{colors.white-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "40px"
  otp-digit:
    backgroundColor: "{colors.bay-surface}"
    textColor: "{colors.white-ink}"
    rounded: "{rounded.lg}"
    width: "48px"
    height: "56px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "36px"
  nav-item-active:
    backgroundColor: "rgb(255 255 255 / 0.08)"
    textColor: "{colors.white-ink}"
---

# Design System: Countersign

Scope: the app pages (War Room `/`, `/owner`, `/bank`, `/try`), styled by `app/ui/app.css` under the `.cs` root. The `/demo` landing film (`landing.css`) shares this system's OLED ground, hairlines, Geist faces, top bar and colour meanings, but keeps its own film-specific deep tints and radii; the printable `/judge-card` (light card in `globals.css`) is separate.

## Overview

**Creative North Star: "The Flight Strip Board"**

Every payment request is a strip a controller must clear before it lands. The board is OLED black, written in white at stepped alphas, ruled with one-pixel white hairlines. Strips are long, low rows with a fixed column grammar (time, channel, from and ask, verdict stamp); the columns never move, only their values change. One region dominates each page (the live strip in the War Room, the waiting approval on /owner, the account on /bank), and everything else sits in quiet bays beside it.

Colour carries meaning, in the /demo film's palette: amber is Countersign at work, ice blue is deterministic code and the lock, violet is waiting on the owner, green is money cleared, red is a refusal. The verdict is stamped in monospace capitals, the one place the system raises its voice. Motion is spring-settled and conveys state only: an agent working, a verdict landing, a selection gliding.

Density is operational, not editorial: 14px body, 12 to 13px labels, mono for every time, amount, hash and code. Nothing disappears when it is cancelled or refused; refused strips stay on the board, struck through.

**Key Characteristics:**
- OLED black ground with white as the only secondary ink, stepped by alpha.
- One rule weight: a 1px white hairline at 9% (16% where a container must read as interactive).
- Fixed-column strips grouped into bays (Working, Waiting, Cleared, Refused, Held).
- A monospace verdict stamp is the only uppercase, letter-spaced text.
- Geist for words, Geist Mono for numbers, times, hashes and codes.
- Flat surfaces; depth comes from tone and hairlines, never shadows.

## Colors

OLED black and white, with the /demo film's palette, each hue holding one fixed meaning so the app and the film read as one product. (Updated Oct 24, 2026 at the user's request: "you may bring color into the UI now".)

### Primary
- **White Ink** (white-ink): body text, headlines, primary buttons (filled white on black), focus outlines, selection. Lower-emphasis text uses it at stepped alphas before falling to the grey inks.

### Meaning hues
- **Countersign Amber** `#f2b04c` / ink `#ffd08a` (`accent`): Countersign at work and the brand. The live dot and LIVE label, the logo's check, the "Call" pill, the selected case tab, the leader's glow in the room, an agent that is working (amber border, glow, breathing ring, a lit wire carrying a dot), finished agents (amber outline and check badge), agent-card titles, the "Countersign replied" label, the active step on /try. HOLD stamps share amber, as in the film.
- **Lock Ice** `#7cc4f5` / ink `#b5defa` (`code`): deterministic code and cryptography. The Policy Engine node and card, fired rules in the rule grid, "Audit chain verified", the audit ticker, countersignature hashes on /bank, the Payer's sealed lock, the Lumen Bank page tile.
- **Owner Violet** `#c3a6ff` / ink `#ddd0ff` (`owner`): waiting on Priya. ESCALATE stamps and their rule cell, "Needs your code" stamps, the approvals badge, the owner's chip in the room, focus on the code boxes, the Approvals page tile.
- **Cleared Green** `#5bd69b` / ink `#86e4b6` (`pay`): money cleared or an approval landed. PAY stamps, a paid Payer and its wire, "$0.00 lost to scams", the approve buttons, accepted transfers, an approved bank change.
- **Refusal Red** `#ff6b4a` / ink `#ff9a82` (`block`): refusals and attacks. BLOCK stamps, failed steps, rejected transfers, struck-through refused amounts, the hijacked-agent panel's wash.

Fills follow one recipe: stamp border at 50%, fill at 10–12%, text in the -ink tint; tags 30–35% border and 7% fill; a verdict card takes a faint 160° wash of its verdict's hue; page title tiles take a 12% fill with a soft glow.

### Neutral
- **OLED Black** (oled-black): page ground, strip rows, the rail, input fields.
- **Bay Surface** (bay-surface): the raised tone of a bay or card (live strip, approval card, bank account panel, OTP digits).
- **Skeleton Fill** (skeleton-fill): loading placeholders only, with a 5% white sweep.
- **Hairline** (hairline): every rule, row divider and bay border.
- **Hairline Strong** (hairline-strong): borders on inputs, ghost buttons, neutral stamps, and cards that hold an action.
- **Muted Ink** (muted-ink): secondary text, labels, inactive nav.
- **Subtle Ink** (subtle-ink): tertiary data such as times in rows, sequence numbers, hashes, unlit rule cells.
- **Placeholder Ink** (placeholder-ink): input placeholders.

### Named Rules
**The One-Meaning Colour Rule.** Every hue names one thing: amber is Countersign working, ice is code and the lock, violet is the owner, green is money cleared, red is a refusal. A hue never decorates something outside its meaning; if nothing fits, it is grey.

**The Violet Waits Rule.** A case waiting for the owner is violet: escalation is Priya's question, not an outcome.

**The Ink-On-Black Rule.** Signal text on black uses the lighter -ink tint, never the base hue; the base hue is for fills, borders and the one filled key-rule cell.

## Typography

**Display Font:** Geist (with ui-sans-serif, system-ui)
**Body Font:** Geist
**Label/Mono Font:** Geist Mono (with ui-monospace, SF Mono, Menlo)

**Character:** One neutral grotesque for every word, and its mono sibling for every figure, so amounts, times and hashes line up in tabular columns like a departures board. Tight negative tracking on headings, slightly negative on body.

### Hierarchy
- **Headline** (600, 22px mobile / 26px desktop, 1.25, -0.025em): the page title in the header. One per page.
- **Figure** (Geist Mono 500, 28 to 40px, 1, -0.03em): the dominant money figure on a page (bank balance, the amount awaiting approval, a changed bank account).
- **Metric** (Geist Mono 400, 22px / 24px, 1.25, -0.02em): the scoreboard rail values, rolled digit by digit.
- **Stamp** (Geist Mono 600, uppercase, 0.08em; 11px small, up to 30px with 0.1em on the live strip): verdicts only.
- **Title** (500, 16px, 1.375, -0.01em): the payee line on a strip; the inbound message quote runs at 16 to 17px regular.
- **Body** (400, 14px, 1.5, -0.006em): the `.cs` default. Subtitles cap at 68ch.
- **Section** (500, 13px): bay and section headings, button labels.
- **Label** (400, 12 to 12.5px): metric labels, row secondary lines, tags, notes.
- **Data** (Geist Mono 400, 13px, tabular numerals): times, sequence numbers, hashes, routing and last-4, rule IDs.

### Named Rules
**The Mono-For-Figures Rule.** Every amount, time, hash, code, rule ID and count is Geist Mono with tabular numerals. Words are never mono except inside a stamp.

**The One Shout Rule.** Uppercase and wide letter-spacing belong to the verdict stamp alone. Headings, labels and section titles stay sentence case.

## Layout

A 232px sticky left rail beside a fluid content column (desktop, from 768px); below that the rail becomes a sticky top bar with a horizontally scrolling pill nav. The page header sits on a hairline with 32px side gutters (16px on mobile); content caps at 1180px except on the War Room, which runs wide.

The War Room's first viewport: a hairline-ruled metrics rail across the top (2, 3, then 6 columns at 640px and 1280px), then a dominant left column (the live strip, then the agent roster) and a 360px right column (strip bays and the audit feed) from 1280px. Strips use fixed grid columns: 64px time, 18px channel icon, flexible from/ask, auto verdict; the expanded live strip widens to 88px time and 150px channel.

Spacing runs on a 4px base: 6 and 8px between inline items, 12px row and tag gaps, 16px and 24px card padding (mobile and desktop), 24px between stacked sections. Lists of rows use a 1px gap over a hairline-coloured container, so the gap itself draws the divider.

**The Fixed Columns Rule.** A strip's columns never reflow by content; only values change. New information arrives as a new row, not a new layout.

## Elevation & Depth

Flat. There are no box shadows anywhere in the app. Depth is tonal: OLED black ground, bay surface (#0a0a0a) for raised containers, and white washes at 2 to 9% for hover, selection and quoted replies. Hairlines do the separating. The only blur is the 95% black mobile top bar with backdrop blur, and a one-shot 6px blur on the verdict stamp as it lands.

### Named Rules
**The Hairline Discipline Rule.** One rule weight (1px) at two strengths (9% and 16%). Separation is a hairline or a tone step, never a shadow or a thicker line.

**The Wash Ladder Rule.** Interactive emphasis climbs a white-alpha ladder: 4% hover, 6% ghost hover, 8% selected or active, 9 to 10% a user's own chat bubble or mobile active pill.

## Shapes

Gently rounded, never pill-shaped except for dots, progress bars and the mobile nav. Bays and cards are 12px; buttons, inputs, nav items, OTP digits and row groups 8px; stamps and tags 6px; rule cells 4px. Chat bubbles on /try are 16px with the corner nearest the speaker tightened to 6px. Empty bays use a dashed hairline. The focus outline (2px white, 2px offset) carries a 6px radius.

## Components

### Buttons
Quiet, compact, and decisive only when the action moves money.
- **Shape:** gently rounded (8px), 36px tall, 14px side padding, 13px medium label, optional 16px icon at an 8px gap.
- **Primary:** filled white on black; hover drops to 85% white.
- **Approve:** filled cleared green with black text; hover lifts to the green ink tint. Used only for the owner's approve action.
- **Danger:** transparent, red ink text, 50% red hairline; hover adds a 10% red wash.
- **Ghost:** transparent, white text, strong hairline; hover adds a 6% white wash.
- **Hover / Focus / Active:** 150ms colour transition; press scales to 0.98; disabled fills drop to 20% and text to 30 to 40% white.

### Chips (Tags)
- **Style:** a fact about a case ("R15 Injection attempt", "Sender not on file"): 12px text, 6px radius, 1px border, 2px by 8px padding. Neutral tags use the strong hairline and 85% white text.
- **State:** the key fired rule takes its decision's tone (30% border, 7% fill, -ink text); every other tag stays neutral.

### Cards / Containers (Bays)
- **Corner Style:** 12px.
- **Background:** bay surface for cards that hold a decision or an action; transparent with a hairline for roster and list bays.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px hairline; strong hairline when the card holds an action; tinted to 30% green or red when its verdict lands; 40% amber while cooling off.
- **Internal Padding:** 16px mobile, 24px desktop; inner split columns are divided by a hairline.

### Inputs / Fields
- **Style:** OLED black, strong hairline, 8px radius, 36 to 40px tall, 12px padding; bank fields set in mono.
- **Focus:** border turns full white; no glow. The global focus-visible outline is 2px white at 2px offset.
- **OTP input:** six 48 by 56px digit boxes (40 by 48 on mobile) on bay surface, 22px mono digits; a filled box's border rises to 35% white; each typed digit pops (spring scale to 1.14); paste and one-time-code autofill fill all six.

### Navigation
- **Top bar (every page):** a sticky 56px bar, 85% black with a backdrop blur: the logo (amber check) and wordmark, then War Room, Approvals, Lumen Bank, Try to scam it and The film as 32px items with 15px line icons. The active page sits in an 8% white pill with a 10% ring that glides between items on a shared-layout spring. The approvals count is a violet badge. At the right, an amber "Call" pill with the line in mono.
- **Mobile:** the same bar, then a scrolling row of 32px fully rounded pills; active is a 10% white wash.
- **Page header (Approvals, Lumen Bank, Try):** a 44px icon tile in the page's colour (violet, ice, amber) beside a 32px title and a 14.5px subtitle; content is centred at 1240px (1480px for /try). The War Room has no header: the stage is the page.

### War Room composition
Built for a projector, in the /demo film's arrangement: a top bar instead of the rail (logo, a WAR ROOM tag, the other pages, a "Call" pill with the line), then the live numbers strip, then one bordered frame holding the case tabs with the case clock at the right, the agent room with the request and reply under it on the left, the verdict card and the agent cards on the right, and the audit ticker along the bottom. The other app pages keep the rail.

### Verdict Stamp (signature)
Geist Mono capitals, letter-spaced, bordered and washed in its decision's tone (pay, block, hold, owner-white, neutral, quiet). Small (24px) in lists and alerts. On the War Room's verdict card it is the headline: 44px bold type (36px on phones) in a 2px-bordered box, landing with a spring from 1.12 scale and 8px blur, followed by the one-sentence explanation at 19px, the fired-rule chips (the key rule in the verdict's tone) and the 18-rule grid with fired rules lit.

### Case Tabs
Every recent case newest first as a 40px tab: mono time, channel icon and name, and a dot in its verdict's colour. The selected tab carries a 30% white border and 7% wash that glides between tabs; "Follow newest" appears only when a tab is pinned.

### Agent Cards
One card per agent that has run, in pipeline order: the agent name in mono capitals with its status (Working, Done, Failed) and duration at the right, the finding as a 16px medium sentence, and the evidence chips underneath, always visible. Agents that haven't run appear only in the room.

### Agent Room (signature)
The film's formation in the app's palette: Countersign (the leader, 80px) at the centre of a faint dotted orbit, the five AI agents around it as 64px circles, the Policy Engine below as the one rounded-square node (code, not AI), and the Payer under it, reachable only from the Policy Engine. Rows sit far enough apart that no label meets the next node. Wires are white hairlines, dashed at rest; a wire turns solid and carries a travelling dot while the agent at its end works. Nodes go idle (15% border, 40% ink), working (white border, soft white glow, breathing ring), done (white check badge), failed (red badge). The Policy Engine takes the verdict's colour; the Payer turns green only on a real payment and otherwise reads "Never called", "$0 moved · sealed" or "Payment failed". A 17px caption under the room narrates the current step. State comes from the case's rows (app/components/roomState.ts). Below 768px the drawing hides and the caption and agent cards carry the story.

### Request Caption
Under the room: the channel, sender and time in mono capitals, the request itself at 21px, the mail server's verdict chips for email, then Countersign's reply at 21px under a hairline.

### Audit Ticker
A single row along the bottom of the frame: "Audit chain" label, then the case's latest events newest first as mono chips (#seq, actor, action, hash prefix) joined by left arrows, fading out at the right edge. New events slide in from the left.

### Live Numbers
One line a room can read from the back: a white live dot, then each number in 22px mono with its label in muted sans (requests, scam attempts stopped, lost to scams in green while it's $0, bills paid with the total, median decision), and "Audit chain verified · N events" with a drawn check at the right. Digits roll on a spring when a real row changes them.

## Do's and Don'ts

### Do:
- **Do** keep the ground pure OLED black (#000000) and lift containers only to the bay surface (#0a0a0a).
- **Do** use green only for cleared money or a landed approval, red only for refusals, amber only for holds, and grey for everything else.
- **Do** set every amount, time, hash, code and rule ID in Geist Mono with tabular numerals.
- **Do** separate with 1px white hairlines at 9% or 16%, and draw row dividers with a 1px gap over a hairline-coloured list.
- **Do** keep refused and cancelled strips on the board, struck through, rather than removing them.
- **Do** animate only state: rows settle on the smooth spring (stiffness 200, damping 28), selections glide on the morph spring, and all looping motion stops under reduced motion.

### Don't:
- **Don't** use a signal hue for decoration, status chrome, risk levels, warnings or icons that do not name a decision.
- **Don't** add box shadows, gradients (beyond the skeleton sweep) or glass effects; depth is tonal.
- **Don't** set uppercase or letter-spaced text anywhere but the verdict stamp; no eyebrow labels above headings.
- **Don't** fill a panel with amber; holds stay small (text, stamp, a 5% row wash at most).
- **Don't** let columns in a strip reflow or move between states.
- **Don't** import the /demo film's Bricolage Grotesque, JetBrains Mono or amber accent into the app pages.
