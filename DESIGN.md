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
  cleared-green: "#22c55e"
  cleared-green-ink: "#4ade80"
  refusal-red: "#ef4444"
  refusal-red-ink: "#f87171"
  hold-amber: "#f59e0b"
  hold-amber-ink: "#fbbf24"
typography:
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

Scope: the app pages only (War Room `/`, `/owner`, `/bank`, `/try`), styled by `app/ui/app.css` under the `.cs` root. The `/demo` film (Bricolage Grotesque, JetBrains Mono, amber accent, `landing.css`) and the printable `/judge-card` (light card in `globals.css`) are separate worlds and are not governed by this file.

## Overview

**Creative North Star: "The Flight Strip Board"**

Every payment request is a strip a controller must clear before it lands. The board is OLED black, written in white at stepped alphas, ruled with one-pixel white hairlines. Strips are long, low rows with a fixed column grammar (time, channel, from and ask, verdict stamp); the columns never move, only their values change. One region dominates each page (the live strip in the War Room, the waiting approval on /owner, the account on /bank), and everything else sits in quiet bays beside it.

Colour is reserved for outcomes. Green appears only when money is cleared or an approval lands, red only for refusals, amber only for holds; every other pixel is black, white or grey. The verdict is stamped in monospace capitals at the strip's end, the one place the system raises its voice. Motion is spring-settled and conveys state only: a row arriving, a verdict landing, a selection gliding.

Density is operational, not editorial: 14px body, 12 to 13px labels, mono for every time, amount, hash and code. Nothing disappears when it is cancelled or refused; refused strips stay on the board, struck through.

**Key Characteristics:**
- OLED black ground with white as the only secondary ink, stepped by alpha.
- One rule weight: a 1px white hairline at 9% (16% where a container must read as interactive).
- Fixed-column strips grouped into bays (Working, Waiting, Cleared, Refused, Held).
- A monospace verdict stamp is the only uppercase, letter-spaced text.
- Geist for words, Geist Mono for numbers, times, hashes and codes.
- Flat surfaces; depth comes from tone and hairlines, never shadows.

## Colors

A black-and-white operating board with three signal hues that only ever mean a decision.

### Primary
- **White Ink** (white-ink): the secondary colour of the whole system. Body text, headlines, primary buttons (filled white on black), the active rail badge, focus outlines, selection, the live dot, and the ESCALATE stamp (white means "waiting for the owner"). Lower-emphasis text uses it at stepped alphas (90%, 85%) before falling to the grey inks.

### Secondary (signal hues, decision-only)
- **Cleared Green** (cleared-green) with **Cleared Green Ink** (cleared-green-ink) for text on black: PAY stamps, a paid amount, "Lost to scams $0.00", the approve button, an approved bank change, an accepted bank transfer, the check in the logo.
- **Refusal Red** (refusal-red) with **Refusal Red Ink** (refusal-red-ink): BLOCK stamps, the key fired rule on a refused case, a broken audit chain, a declined or rejected result, the danger button, and the strike-through on refused strips (red ink at 55%).
- **Hold Amber** (hold-amber) with **Hold Amber Ink** (hold-amber-ink): HOLD stamps, the cooling-off timer after an owner approval, a frozen payee awaiting callback, the "calling the vendor" line. Kept small: text and stamps, never a filled panel beyond a 5% wash on a frozen row.

Signal fills follow a fixed recipe: stamp border at 50% (amber 40%), fill at 12% (amber 8%), text in the -ink tint; tags drop to 30% border and 7% fill; a whole bay border tints to 30% when its verdict lands.

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
**The Outcome-Only Colour Rule.** Green only when money is cleared or an approval lands, red only for refusals, amber only for holds. Everything else is neutral. If a hue does not name a decision, it is grey.

**The White Waits Rule.** A case waiting for the owner is white, not a colour. Escalation is a question, not an outcome.

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
- **Rail:** logo and wordmark (15px semibold) in a 68px header, four 36px items with 17px line icons at 1.75 stroke, 13.5px labels in muted ink. A 4% white hover pill follows the pointer; the 8% active pill glides between items on a shared-layout spring. The approvals count is a small filled-white badge. A hairline-topped footer carries the phone line in mono.
- **Mobile:** sticky 48px top bar, then a scrolling row of 32px fully rounded pills; active is a 10% white wash.

### Verdict Stamp (signature)
The decision stamped at a strip's end: Geist Mono semibold capitals, letter-spaced, 6px radius, bordered and washed in its decision's tone (pay, block, hold, owner-white, neutral, quiet). Small (24px) in rows and lists; large (60px tall, 30px type) on the live strip, where it lands with a spring from 1.18 scale and 6px blur.

### Flight Strip (signature)
A row in a bay: OLED black on a 1px-gap hairline list, fixed columns (mono time, channel icon, who over ask, verdict stamp), 10px by 12px padding. Hover is a 4% wash; the selected strip carries an 8% wash that glides between rows. Refused strips stay listed with their name struck through in 55% red ink.

### Agent Roster
A fixed vertical timeline of every agent in order, joined by a hairline spine: a check, spinner or alert in a 24px node, the agent name at 13.5px medium, a one-line summary, mono duration at the right, and an expandable evidence panel behind a hairline left rule. Agents that did not run stay in the roster, dimmed and marked "not needed".

### Agent Room (signature)
The case drawn as a left-to-right flow of hairline-bordered step cards: Request → Intake → Vendor check ∥ Risk check → Policy Engine, with the callback and the owner's code as detours above and below the Policy Engine that loop back into it, and the lock, a short vertical bar the path must cross, between the Policy Engine and the Payer. State comes from the case's rows (app/components/roomState.ts). Steps carry a white number badge in the order their runs actually started; the route the case took stays as solid 55% white connectors while untaken ones stay dashed and faint; a 4px dot travels the connector into whichever step is working. The Policy Engine is the one square-cornered card (code, not AI) and takes the verdict's colour; the PAY path crosses the lock in green ("PAY crossed the lock"), any other verdict stops at it with a red bar ("Stopped at the lock"). One caption line narrates the current step. The drawing caps at 960px, drops the Request card under 760px of width, and hides below 640px, where the caption and the step list carry the story.

### Live Numbers
The scoreboard rail: hairline-ruled cells, 12.5px muted label over a mono metric whose digits roll on a spring when a real row changes the count. The live dot (6px white, a 2.4s expanding ring) means only "this updates by itself".

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
