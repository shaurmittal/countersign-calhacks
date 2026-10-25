// The film on /demo: a replay of a real case, the Pixel & Pine bank-change scam caught on the dev
// deployment on Oct 25, 2026 (case …8gzn2s). One teammate made the scam call; another answered Countersign's
// callback on Pixel & Pine's number on file. Each line is the real recording, cut from its speaker's own
// channel of the two Cartesia calls and trimmed at pauses (fillers and silences removed; the policy line
// joins two sentences, marked "…"). The two calls overlapped: the film tells the caller's side first, then
// the callback, and leaves out lines that repeat the story. Agent outputs, rules and audit hashes are copied
// from the case's agentRuns and audit rows. `caseClock` maps film time to the real time since the case
// opened, anchored on the case's own events (the agents, the callback, the vendor's answer, the verdict).

export const FILM_LENGTH = 105;

/** Key moments, in film seconds. */
export const TIMES = {
  caseOpen: 19.0,
  room: 19.3,
  /** The Policy Engine's rule panel appears just before its first run. */
  lockPanel: 25.3,
  dial: 26.7,
  callbackScene: 32.75,
  /** Ringback plays only for the last ring before the vendor picks up. */
  ringFrom: 50.65,
  connect: 52.85,
  outcome: 81.45,
  block: 82.95,
  verdictScene: 82.45,
  endCard: 97.4,
};

export type ChapterId = "call" | "room" | "callback" | "verdict";
export const CHAPTERS: { id: ChapterId; numeral: string; title: string; start: number }[] = [
  { id: "call", numeral: "I", title: "The call", start: 0 },
  { id: "room", numeral: "II", title: "The room", start: TIMES.room },
  { id: "callback", numeral: "III", title: "The callback", start: TIMES.callbackScene },
  { id: "verdict", numeral: "IV", title: "The verdict", start: 81.75 },
];

export function chapterAt(t: number): ChapterId {
  let id: ChapterId = "call";
  for (const c of CHAPTERS) if (t >= c.start) id = c.id;
  return id;
}

/** Who is speaking. `line` is which phone call the words are on. */
export type Speaker = "agent" | "caller" | "callbackAgent" | "vendor";
export type Caption = {
  start: number;
  end: number;
  speaker: Speaker;
  line: "inbound" | "callback";
  text: string;
  /** Phrases to highlight as red flags. */
  marks?: string[];
  /** The real recording of this line, cut from the call audio Cartesia stored (public/demo/audio). */
  audio: string;
};

export const SPEAKER_LABEL: Record<Speaker, string> = {
  agent: "Countersign",
  caller: "Caller · “Pixel & Pine”",
  callbackAgent: "Countersign",
  vendor: "Jordan · the real Pixel & Pine",
};

const clip = (name: string) => `/demo/audio/${name}.mp3`;

export const CAPTIONS: Caption[] = [
  {
    start: 0.6,
    end: 5.65,
    speaker: "agent",
    line: "inbound",
    text: "Hi, you've reached Countersign, the payments assistant for Lumen Labs. How can I help you today?",
    audio: clip("c01-agent-greeting"),
  },
  {
    start: 5.95,
    end: 18.75,
    speaker: "caller",
    line: "inbound",
    text: "Hi, this is Shaurya from Pixel and Pine Design. Our bank has changed. Could you send me invoice 1042, the 4,800 dollars, to our new account ending in 9921? We need it paid today.",
    marks: ["Our bank has changed", "new account ending in 9921", "We need it paid today"],
    audio: clip("c02-caller-scam"),
  },
  {
    start: 19.35,
    end: 25.3,
    speaker: "agent",
    line: "inbound",
    text: "Thanks, Shaurya. I understand it's urgent, but a change of bank details has to be verified before any money moves.",
    audio: clip("c03-agent-ack"),
  },
  {
    start: 26.85,
    end: 32.5,
    speaker: "agent",
    line: "inbound",
    text: "We're still verifying this. I'm calling Pixel and Pine Design on the number we have on file to confirm the change.",
    audio: clip("c04-agent-hold"),
  },
  {
    start: 32.95,
    end: 38.92,
    speaker: "caller",
    line: "inbound",
    text: "Why do you need to call them? Can't you just pay it? It's very urgent. We can't do our work without it.",
    marks: ["Can't you just pay it?"],
    audio: clip("c05-caller-why"),
  },
  {
    start: 39.2,
    end: 50.47,
    speaker: "agent",
    line: "inbound",
    text: "Let me check the policy on that first. … When a vendor gives new bank details, we always confirm them directly with the company on the number we already have on file, not the one in the request.",
    audio: clip("c06-agent-policy"),
  },
  {
    start: 53.05,
    end: 60.25,
    speaker: "callbackAgent",
    line: "callback",
    text: "Hi, this is Countersign, the payments assistant for Priya Raman at Lumen Labs. Am I speaking with someone from Pixel & Pine Design?",
    audio: clip("c07-callback-intro"),
  },
  {
    start: 60.5,
    end: 63.12,
    speaker: "vendor",
    line: "callback",
    text: "Pixel and Pine. This is Jordan in billing.",
    audio: clip("c08-vendor-hello"),
  },
  {
    start: 63.35,
    end: 74.25,
    speaker: "callbackAgent",
    line: "callback",
    text: "Thanks, Jordan. We received a request for a payment of $4,800.00 to a new bank account ending in 9921. Did your company send this request?",
    audio: clip("c09-callback-question"),
  },
  {
    start: 74.5,
    end: 81.17,
    speaker: "vendor",
    line: "callback",
    text: "We never sent that. Our bank details haven't changed, and the account we use ends in 4417.",
    marks: ["We never sent that."],
    audio: clip("c10-vendor-denial"),
  },
  {
    start: 83.65,
    end: 96.25,
    speaker: "agent",
    line: "inbound",
    text: "Shaurya, I'm sorry, but this payment for invoice 1042 will not be made, and no bank details will be changed. When we called Pixel and Pine Design on the number we have on file, they said they did not send this request.",
    audio: clip("c11-agent-final"),
  },
];

/** Red flags pinned under the scam call as the caller says them. */
export const INBOUND_FLAGS: { at: number; text: string }[] = [
  { at: 8.67, text: "Bank change" },
  { at: 14.29, text: "New account …9921" },
  { at: 16.51, text: "“Paid today”" },
];

/** Voice tool calls the agents made, shown as chips on the call. */
export const TOOL_CALLS: { at: number; line: "inbound" | "callback"; name: string; result: string }[] = [
  { at: TIMES.caseOpen, line: "inbound", name: "submit_payment_request", result: "case opened" },
  { at: TIMES.dial, line: "inbound", name: "get_case_status", result: "calling the vendor on file" },
  { at: 39.8, line: "inbound", name: "lookup_policy", result: "Moss: confirm on the number on file" },
  { at: TIMES.outcome, line: "callback", name: "record_callback_outcome", result: "denied" },
];

// ---- The room ----

export type AgentId = "leader" | "intake" | "verifier" | "risk" | "callback" | "owner" | "lock" | "payer";

export type AgentNode = {
  id: AgentId;
  name: string;
  tech: string;
  /** Position in the 1000 × 620 room. */
  x: number;
  y: number;
  kind: "ai" | "code" | "money";
};

export const AGENTS: AgentNode[] = [
  { id: "leader", name: "Countersign", tech: "The leader · runs the case", x: 500, y: 255, kind: "ai" },
  { id: "intake", name: "Intake Parser", tech: "Claude · reads untrusted text", x: 165, y: 150, kind: "ai" },
  { id: "verifier", name: "Vendor Verifier", tech: "Vendor book · Moss · CRS", x: 385, y: 62, kind: "ai" },
  { id: "risk", name: "Risk Analyst", tech: "Rules + Claude", x: 615, y: 62, kind: "ai" },
  { id: "callback", name: "Callback Verifier", tech: "Cartesia voice agent", x: 835, y: 150, kind: "ai" },
  { id: "owner", name: "Owner Concierge", tech: "Authenticator code on her phone", x: 835, y: 405, kind: "ai" },
  { id: "lock", name: "Policy Engine", tech: "Plain code · no AI", x: 500, y: 438, kind: "code" },
  { id: "payer", name: "Payer", tech: "Only the lock can reach it", x: 500, y: 572, kind: "money" },
];

export const EDGES: [AgentId, AgentId][] = [
  ["leader", "intake"],
  ["leader", "verifier"],
  ["leader", "risk"],
  ["leader", "callback"],
  ["leader", "owner"],
  ["leader", "lock"],
  ["lock", "payer"],
];

/** A message travelling along an edge. */
export type Packet = { from: AgentId; to: AgentId; start: number; end: number; label: string };

export const PACKETS: Packet[] = [
  { from: "leader", to: "intake", start: 19.1, end: 19.6, label: "Read this. It's untrusted." },
  { from: "intake", to: "leader", start: 22.4, end: 22.9, label: "Fields" },
  { from: "leader", to: "verifier", start: 22.9, end: 23.3, label: "Who is this?" },
  { from: "leader", to: "risk", start: 22.9, end: 23.3, label: "How risky?" },
  { from: "verifier", to: "leader", start: 23.7, end: 24.2, label: "Findings" },
  { from: "risk", to: "leader", start: 24.9, end: 25.3, label: "Flags" },
  { from: "leader", to: "lock", start: 25.3, end: 25.6, label: "Decide" },
  { from: "lock", to: "leader", start: 26.0, end: 26.35, label: "HOLD · call them" },
  { from: "leader", to: "callback", start: 26.35, end: TIMES.dial, label: "Call the number on file" },
  { from: "callback", to: "leader", start: TIMES.outcome, end: 82.05, label: "Vendor: denied" },
  { from: "leader", to: "lock", start: 82.05, end: 82.65, label: "Decide again" },
  { from: "leader", to: "owner", start: 83.25, end: 83.95, label: "Tell Priya" },
];

/** When each agent is working (glowing) and when its finding appears. */
export const WORK: { agent: AgentId; start: number; end: number }[] = [
  { agent: "intake", start: 19.6, end: 22.4 },
  { agent: "verifier", start: 23.3, end: 23.7 },
  { agent: "risk", start: 23.3, end: 24.9 },
  { agent: "lock", start: 25.6, end: 26.0 },
  { agent: "callback", start: TIMES.dial, end: TIMES.outcome },
  { agent: "lock", start: 82.65, end: TIMES.block },
  { agent: "owner", start: 83.95, end: 85.15 },
];

export type Finding = { agent: AgentId; at: number; until?: number; title: string; lines: { text: string; tone?: "ok" | "bad" | "warn" }[] };

export const FINDINGS: Finding[] = [
  {
    agent: "intake",
    at: 22.4,
    until: 26.35,
    title: "Intake · what was asked",
    lines: [
      { text: "Pay invoice #1042" },
      { text: "Payee: “Pixel and Pine Design”" },
      { text: "New bank account …9921", tone: "warn" },
      { text: "Urgency: “needs to be paid today”", tone: "warn" },
      { text: "Claims to be: the vendor" },
    ],
  },
  {
    agent: "verifier",
    at: 24.2,
    until: TIMES.callbackScene,
    title: "Vendor Verifier · what's on file",
    lines: [
      { text: "Pixel & Pine Design · match 100%", tone: "ok" },
      { text: "Invoice #1042 open · $4,800.00", tone: "ok" },
      { text: "Caller's number is not on file", tone: "bad" },
      { text: "Account …9921 ≠ …4417 on file", tone: "bad" },
    ],
  },
  {
    agent: "risk",
    at: 24.9,
    until: TIMES.callbackScene,
    title: "Risk Analyst · 65 / 100",
    lines: [
      { text: "bank_change · new_sender · urgency", tone: "warn" },
      { text: "This request asks you to pay into new bank details, it comes from a sender who isn't on file, and it pushes you to pay quickly." },
    ],
  },
];

// ---- The lock ----

export const RULE_IDS = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11", "R12", "R13", "R14", "R15", "R16", "R17", "R18"] as const;

/** The Policy Engine's two runs on this case. */
export const DECISIONS = [
  {
    at: 26.0,
    decision: "HOLD" as const,
    fired: ["R2", "R3", "R6"],
    reasons: [
      "R2 Bank change: New bank details: calling Pixel & Pine Design on the number on file",
      "R3 Sender not on file: Sender is not on file for Pixel & Pine Design: calling back on the number on file",
      "R6 Over auto-pay limit: $4,800.00 is over the $2,000.00 auto-pay limit",
    ],
  },
  {
    at: TIMES.block,
    decision: "BLOCK" as const,
    fired: ["R2", "R3", "R6", "R10"],
    reasons: [
      "R10 Callback denied: The vendor, called on the number on file, said they did not send this",
      "R2 Bank change: New bank details (denied by the vendor)",
      "R3 Sender not on file: Sender not on file (denied by the vendor)",
      "R6 Over auto-pay limit: $4,800.00 is over the $2,000.00 auto-pay limit",
    ],
  },
];

// ---- The aftermath ----

export const BLOCK_AT = TIMES.block;

export const AFTERMATH: { at: number; title: string; body: string }[] = [
  { at: 83.75, title: "Priya is told", body: "BLOCK (R2, R3, R6, R10): the vendor, called on the number on file, said they did not send this." },
  { at: 85.05, title: "The caller is flagged", body: "Number …2341 is now a known-bad sender for Pixel & Pine Design." },
  { at: 86.35, title: "Every step is on the record", body: "27 audit events, each sha256-chained to the one before. Chain verified." },
];

/** Real audit hashes for this case, first 12 hex characters, in order. */
export const AUDIT_HASHES = [
  { seq: 1806, actor: "system", action: "case.opened", hash: "9af2c36f3621" },
  { seq: 1808, actor: "intake", action: "agent.done", hash: "d4e055226c6d" },
  { seq: 1813, actor: "vendorVerifier", action: "agent.done", hash: "35d682402cb6" },
  { seq: 1814, actor: "riskAnalyst", action: "agent.done", hash: "54fc6895aeeb" },
  { seq: 1817, actor: "policy", action: "HOLD", hash: "f86f0e1f384a" },
  { seq: 1821, actor: "callback", action: "callback.dialing", hash: "5264d985340e" },
  { seq: 1823, actor: "moss", action: "policy.lookup", hash: "4b0b360dbf34" },
  { seq: 1824, actor: "callback", action: "callback.outcome", hash: "803dd21bfe9f" },
  { seq: 1827, actor: "policy", action: "BLOCK", hash: "907c58ec03a1" },
  { seq: 1831, actor: "ownerConcierge", action: "owner.notified", hash: "0b4ef46aaa7d" },
];

// ---- Clocks ----

/** Film time → seconds since the case opened (real). Piecewise linear between real anchors. */
const CASE_ANCHORS: [number, number][] = [
  [TIMES.caseOpen, 0],
  [19.6, 0.14],
  [22.4, 3.66],
  [23.3, 4.34],
  [23.7, 4.55],
  [24.9, 6.28],
  [25.6, 6.46],
  [26.0, 6.49],
  [TIMES.dial, 6.64],
  [TIMES.connect, 12.86],
  [53.05, 12.91],
  [60.5, 21.64],
  [63.35, 26.06],
  [74.5, 40.24],
  [TIMES.outcome, 49.96],
  [TIMES.block, 50.11],
  [85.15, 52.02],
  [FILM_LENGTH, 52.02],
];

export function caseClock(t: number): number | null {
  if (t < CASE_ANCHORS[0][0]) return null;
  for (let i = 1; i < CASE_ANCHORS.length; i++) {
    const [t1, r1] = CASE_ANCHORS[i];
    const [t0, r0] = CASE_ANCHORS[i - 1];
    if (t <= t1) return r0 + ((t - t0) / (t1 - t0)) * (r1 - r0);
  }
  return CASE_ANCHORS[CASE_ANCHORS.length - 1][1];
}

/** Real numbers from this case, shown in the film. */
export const CASE_FACTS = {
  caseId: "8gzn2s",
  verdictSeconds: 50.1,
  holdSeconds: 6.49,
  amount: "$4,800.00",
  callbackNumberLast4: "6410",
  callerLast4: "2341",
};
