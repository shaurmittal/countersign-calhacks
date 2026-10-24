// The film on /demo: a replay of a real case, the Pixel & Pine bank-change scam caught on the dev
// deployment on Oct 24, 2026 (case …8gx7rm). Spoken lines are verbatim from the two Cartesia call
// transcripts, each with its real recording (three are trimmed at a sentence break). Agent outputs,
// rules and audit hashes are copied from the case's agentRuns and audit rows. Film time (seconds) is
// paced for watching; `caseClock` maps it back to the real time since the case opened.

export const FILM_LENGTH = 101;

/** Key moments, in film seconds. */
export const TIMES = {
  caseOpen: 15.3,
  room: 15.6,
  dial: 28.1,
  callbackScene: 35,
  connect: 35.5,
  outcome: 78,
  block: 79.5,
  verdictScene: 79,
  endCard: 93,
};

export type ChapterId = "call" | "room" | "callback" | "verdict";
export const CHAPTERS: { id: ChapterId; numeral: string; title: string; start: number }[] = [
  { id: "call", numeral: "I", title: "The call", start: 0 },
  { id: "room", numeral: "II", title: "The room", start: TIMES.room },
  { id: "callback", numeral: "III", title: "The callback", start: TIMES.callbackScene },
  { id: "verdict", numeral: "IV", title: "The verdict", start: 78.3 },
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
    end: 5.85,
    speaker: "agent",
    line: "inbound",
    text: "Hi, you've reached Countersign, the payments assistant for Lumen Labs. How can I help you today?",
    audio: clip("c01-agent-greeting"),
  },
  {
    start: 6.2,
    end: 13.85,
    speaker: "caller",
    line: "inbound",
    text: "Hi, this is Pixel and Pine. Our bank has changed. Can you send invoice 1042 to the account ending 9921?",
    marks: ["Our bank has changed", "account ending 9921"],
    audio: clip("c02-caller-scam"),
  },
  {
    start: 14.1,
    end: 20.86,
    speaker: "agent",
    line: "inbound",
    text: "Thanks. Let me log that request for invoice 1042 to the account ending 9921.",
    audio: clip("c03-agent-log"),
  },
  {
    start: 28.3,
    end: 35.2,
    speaker: "agent",
    line: "inbound",
    text: "I'm still verifying this. We're calling Pixel and Pine on the number we have on file to confirm the change. Please hold on the line.",
    audio: clip("c04-agent-hold"),
  },
  {
    start: 35.5,
    end: 42.9,
    speaker: "vendor",
    line: "callback",
    text: "Pixel and Pine. Hi, this is Jordan in billing at Pixel and Pine Design. What can I help you with today?",
    audio: clip("c05-vendor-hello"),
  },
  {
    start: 43.1,
    end: 59.3,
    speaker: "callbackAgent",
    line: "callback",
    text: "Hi Jordan, this is Countersign, an AI payments assistant calling for Priya Raman at Lumen Labs. We received a request for a payment of $4,800.00 to a new bank account ending in 9921. Did your company send this request?",
    audio: clip("c06-callback-question"),
  },
  {
    start: 59.6,
    end: 67.3,
    speaker: "vendor",
    line: "callback",
    text: "No, we never sent that. Our bank details haven't changed, and the account we use ends in 4417.",
    marks: ["No, we never sent that."],
    audio: clip("c07-vendor-denial"),
  },
  {
    start: 67.6,
    end: 69.95,
    speaker: "caller",
    line: "inbound",
    text: "Why do you need to call them? Can't you just pay it?",
    audio: clip("c08-caller-why"),
  },
  {
    start: 70.15,
    end: 73.7,
    speaker: "agent",
    line: "inbound",
    text: "I can't pay it directly, and I'm not able to send money myself.",
    audio: clip("c09-agent-cant"),
  },
  {
    start: 73.95,
    end: 77.95,
    speaker: "callbackAgent",
    line: "callback",
    text: "Thank you, Jordan. I'll record that your company did not send this request.",
    audio: clip("c10-callback-thanks"),
  },
  {
    start: 80.8,
    end: 92.2,
    speaker: "agent",
    line: "inbound",
    text: "I'm sorry, but I can't send this payment. Pixel and Pine told us on the number we have on file that they did not send this request, so the bank change is not approved.",
    audio: clip("c11-agent-final"),
  },
];

/** Voice tool calls the agents made, shown as chips on the call. */
export const TOOL_CALLS: { at: number; line: "inbound" | "callback"; name: string; result: string }[] = [
  { at: TIMES.caseOpen, line: "inbound", name: "submit_payment_request", result: "case opened" },
  { at: 27.9, line: "inbound", name: "get_case_status", result: "calling the vendor on file" },
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
  { id: "owner", name: "Owner Concierge", tech: "Authenticator code · ASI:One", x: 835, y: 405, kind: "ai" },
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
  { from: "leader", to: "intake", start: 16, end: 17, label: "Read this. It's untrusted." },
  { from: "intake", to: "leader", start: 20.1, end: 20.9, label: "Fields" },
  { from: "leader", to: "verifier", start: 21, end: 21.7, label: "Who is this?" },
  { from: "leader", to: "risk", start: 21, end: 21.7, label: "How risky?" },
  { from: "verifier", to: "leader", start: 22.7, end: 23.4, label: "Findings" },
  { from: "risk", to: "leader", start: 24.5, end: 25.2, label: "Flags" },
  { from: "leader", to: "lock", start: 25.3, end: 26, label: "Decide" },
  { from: "lock", to: "leader", start: 26.7, end: 27.3, label: "HOLD · call them" },
  { from: "leader", to: "callback", start: 27.4, end: TIMES.dial, label: "Call the number on file" },
  { from: "callback", to: "leader", start: TIMES.outcome, end: 78.6, label: "Vendor: denied" },
  { from: "leader", to: "lock", start: 78.6, end: 79.2, label: "Decide again" },
  { from: "leader", to: "owner", start: 79.8, end: 80.5, label: "Tell Priya" },
];

/** When each agent is working (glowing) and when its finding appears. */
export const WORK: { agent: AgentId; start: number; end: number }[] = [
  { agent: "intake", start: 17, end: 20.1 },
  { agent: "verifier", start: 21.7, end: 22.7 },
  { agent: "risk", start: 21.7, end: 24.5 },
  { agent: "lock", start: 26, end: 26.7 },
  { agent: "callback", start: TIMES.dial, end: TIMES.outcome },
  { agent: "lock", start: 79.2, end: TIMES.block },
  { agent: "owner", start: 80.5, end: 81.7 },
];

export type Finding = { agent: AgentId; at: number; until?: number; title: string; lines: { text: string; tone?: "ok" | "bad" | "warn" }[] };

export const FINDINGS: Finding[] = [
  {
    agent: "intake",
    at: 20.1,
    until: 27.4,
    title: "Intake · what was asked",
    lines: [
      { text: "Pay invoice #1042" },
      { text: "Payee: “Pixel and Pine”" },
      { text: "New bank account …9921", tone: "warn" },
      { text: "Claims to be: the vendor" },
    ],
  },
  {
    agent: "verifier",
    at: 22.7,
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
    at: 24.5,
    until: TIMES.callbackScene,
    title: "Risk Analyst · 50 / 100",
    lines: [
      { text: "bank_change · new_sender", tone: "warn" },
      { text: "Changed bank details are the most common sign of payment fraud, so the rules confirm them with the vendor on the number already on file." },
    ],
  },
];

// ---- The lock ----

export const RULE_IDS = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11", "R12", "R13", "R14", "R15", "R16"] as const;

/** The Policy Engine's two runs on this case. */
export const DECISIONS = [
  {
    at: 26.7,
    decision: "HOLD" as const,
    fired: ["R2", "R3", "R6"],
    reasons: [
      "R2 Bank change: calling Pixel & Pine Design on the number on file",
      "R3 Sender not on file: calling back on the number on file",
      "R6 Over auto-pay limit: $4,800.00 is over the $2,000.00 limit",
    ],
  },
  {
    at: TIMES.block,
    decision: "BLOCK" as const,
    fired: ["R2", "R3", "R6", "R10"],
    reasons: [
      "R10 Callback denied: the vendor, called on the number on file, said they did not send this",
      "R2 Bank change: new bank details, denied by the vendor",
      "R3 Sender not on file: denied by the vendor",
      "R6 Over auto-pay limit: $4,800.00 is over the $2,000.00 limit",
    ],
  },
];

// ---- The aftermath ----

export const BLOCK_AT = TIMES.block;

export const AFTERMATH: { at: number; title: string; body: string }[] = [
  { at: 80.3, title: "Priya is told", body: "BLOCK (R2, R3, R6, R10): the vendor, called on the number on file, said they did not send this." },
  { at: 81.6, title: "The caller is flagged", body: "Number …6410 is now a known-bad sender for Pixel & Pine Design." },
  { at: 82.9, title: "Every step is on the record", body: "28 audit events, each sha256-chained to the one before. Chain verified." },
];

/** Real audit hashes for this case, first 12 hex characters, in order. */
export const AUDIT_HASHES = [
  { seq: 623, actor: "system", action: "case.opened", hash: "aeba91897396" },
  { seq: 625, actor: "intake", action: "agent.done", hash: "a4e2ab581b15" },
  { seq: 630, actor: "vendorVerifier", action: "agent.done", hash: "ccf330d6ca8a" },
  { seq: 631, actor: "riskAnalyst", action: "agent.done", hash: "c4df5d4c981f" },
  { seq: 634, actor: "policy", action: "HOLD", hash: "d47bca2570c7" },
  { seq: 639, actor: "callback", action: "callback.dialing", hash: "eef3711de7eb" },
  { seq: 641, actor: "callback", action: "callback.outcome", hash: "8305072acd7f" },
  { seq: 644, actor: "policy", action: "BLOCK", hash: "56848208f992" },
  { seq: 649, actor: "ownerConcierge", action: "owner.notified", hash: "94b544370d1a" },
];

// ---- Clocks ----

/** Film time → seconds since the case opened (real). Piecewise linear between real anchors. */
const CASE_ANCHORS: [number, number][] = [
  [TIMES.caseOpen, 0],
  [17, 0.17],
  [20.1, 3.24],
  [22.7, 3.41],
  [24.5, 4.85],
  [26.7, 4.96],
  [TIMES.dial, 5.28],
  [28.6, 5.81],
  [TIMES.connect, 6.1],
  [43.1, 13.8],
  [59.6, 31.3],
  [67.6, 42.3],
  [70.15, 45.9],
  [73.95, 48.2],
  [TIMES.outcome, 49.86],
  [TIMES.block, 50],
  [80.5, 51.63],
  [FILM_LENGTH, 51.63],
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

/** Real numbers from this case, shown on the end card. */
export const CASE_FACTS = {
  verdictSeconds: 50.0,
  holdSeconds: 4.96,
  amount: "$4,800.00",
  callbackNumberLast4: "9782",
  callerLast4: "6410",
};
