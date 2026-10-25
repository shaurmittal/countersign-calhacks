// Writes out/countersign-demo.srt from the same cues the video burns in (src/timeline.ts).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_CUES } from "../src/timeline";

const stamp = (s: number) => {
  const ms = Math.round(s * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

// Each cue holds 0.15 s past its last word, but never into the next cue.
const body = ALL_CUES.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(Math.min(c.end + 0.15, ALL_CUES[i + 1]?.start ?? Infinity))}\n${c.speaker ? `${c.speaker}: ` : ""}${c.text}\n`).join("\n");
const out = join(__dirname, "..", "out", "countersign-demo.srt");
writeFileSync(out, body);
console.log(`${ALL_CUES.length} cues -> ${out}`);
