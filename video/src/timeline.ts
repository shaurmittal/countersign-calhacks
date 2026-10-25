// The edit in seconds. Scene starts, where each voiceover file lands, and one caption cue per spoken
// sentence (times from silence detection on the Cartesia files). The SRT is built from the same cues.
import durations from "../assets/vo/durations.json";
import { FPS } from "./theme";

export const f = (sec: number) => Math.round(sec * FPS);

export const SCENES = {
  cold: 0,
  title: 12.4,
  problem: 19.4,
  how: 25.8,
  design: 42.9,
  blocker: 54.8,
  proof: 61.7,
  close: 69.6,
  end: 81,
} as const;

export const TOTAL_SECONDS = SCENES.end;

/** Where each narration file starts. */
export const VO_AT: Record<keyof typeof durations, number> = {
  "02-title": 12.6,
  "03-problem": 19.6,
  "04-how": 26.0,
  "05-design": 43.1,
  "06-blocker": 55.0,
  "07-proof": 61.8,
  "08-close": 69.8,
};

/** [start, end] within each narration file, from silence detection. */
const SENTENCES: { vo: keyof typeof durations; from: number; to: number; text: string }[] = [
  { vo: "02-title", from: 0.63, to: 3.6, text: "That call almost cost a founder $4,800." },
  { vo: "02-title", from: 4.27, to: 6.4, text: "Countersign caught it in fifty seconds." },
  { vo: "03-problem", from: 0, to: 4.09, text: "In a company, two people approve every payment, so a scammer has to fool both." },
  { vo: "03-problem", from: 4.32, to: 5.9, text: "A solo founder has nobody." },
  { vo: "04-how", from: 0, to: 3.14, text: "Countersign answers every call, email and message for her." },
  { vo: "04-how", from: 3.73, to: 7.34, text: "AI agents read the request, check the vendor book and flag the risk." },
  { vo: "04-how", from: 8.02, to: 9.91, text: "Then it does what a careful accountant would." },
  { vo: "04-how", from: 10.62, to: 12.27, text: "It never calls the number that called it." },
  { vo: "04-how", from: 13.1, to: 16.49, text: "It calls the number it already trusts, and the real vendor says no." },
  { vo: "05-design", from: 0.16, to: 2.34, text: "The AI can read, reason and talk." },
  { vo: "05-design", from: 2.75, to: 3.72, text: "It cannot move money." },
  { vo: "05-design", from: 4.14, to: 8.35, text: "Only seventeen rules in plain code can, and the bank checks their signature." },
  { vo: "05-design", from: 8.51, to: 11.33, text: "You can talk it into anything, except moving money." },
  { vo: "06-blocker", from: 0, to: 2.04, text: "Real bills still get paid on their own." },
  { vo: "06-blocker", from: 2.56, to: 4.97, text: "Bigger ones wait for a code from the owner's own phone." },
  { vo: "06-blocker", from: 5.48, to: 6.32, text: "Never a voice." },
  { vo: "07-proof", from: 0.64, to: 2.17, text: "Thirty-nine attack scenarios." },
  { vo: "07-proof", from: 2.52, to: 3.6, text: "Every scam stopped." },
  { vo: "07-proof", from: 4.06, to: 5.24, text: "Zero wrong payments." },
  { vo: "07-proof", from: 5.39, to: 7.48, text: "Every step in a chained audit log." },
  { vo: "08-close", from: 0, to: 5.45, text: "Built with Cartesia, Claude, Convex, Moss, CRS and Fetch.ai." },
  { vo: "08-close", from: 5.76, to: 6.54, text: "Call our number." },
  { vo: "08-close", from: 7.04, to: 7.94, text: "Try to scam it." },
];

export type Cue = { start: number; end: number; text: string; speaker?: string };

/** Narration cues in absolute seconds. */
export const VO_CUES: Cue[] = SENTENCES.map((s) => ({ start: VO_AT[s.vo] + s.from, end: VO_AT[s.vo] + s.to, text: s.text }));

/** The cold open's real call lines, captioned too (absolute seconds). */
export const CALL = {
  buzz: 0.15,
  caller: 1.0, // assets/audio/caller-scam.wav, 6.9 s
  room: 4.6, // hard cut to the room while the caller keeps talking
  dial: 8.0, // ringback while Countersign dials the number on file
  silence: 9.7,
  denial: 10.2, // assets/audio/vendor-denial.wav, 1.5 s
  block: 11.5,
};

export const CALL_CUES: Cue[] = [
  { start: 1.05, end: 4.3, text: "Hi, this is Pixel and Pine. Our bank has changed.", speaker: "Caller" },
  { start: 4.3, end: 7.7, text: "Can you send invoice 1042 to the account ending 9921?", speaker: "Caller" },
  { start: 10.25, end: 11.7, text: "No, we never sent that.", speaker: "The real Pixel & Pine" },
];

export const ALL_CUES: Cue[] = [...CALL_CUES, ...VO_CUES].sort((a, b) => a.start - b.start);

export const VO_DURATIONS = durations;

/** Narration intervals, for ducking the music under speech. */
export const SPEECH: [number, number][] = [
  ...Object.entries(VO_AT).map(([id, at]) => [at, at + durations[id as keyof typeof durations]] as [number, number]),
];
