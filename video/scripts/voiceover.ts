// Voiceover with Cartesia Sonic: one WAV per scene in assets/vo/, plus assets/vo/durations.json for the edit.
// Key from CARTESIA_API_KEY (never printed). The lines mirror script.md; change both together.
//   CARTESIA_API_KEY="$(npx convex env get CARTESIA_API_KEY)" npm run vo            all scenes
//   ... npm run vo -- 04-how                                                         one scene
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const VOICE_ID = "5568a7df-e5ab-4442-9fae-2e9ba1b15ad8"; // "Quentin - Refined Narrator"
const MODELS = ["sonic-3", "sonic-2"]; // newest first; falls back if the account lacks one
const OUT = join(__dirname, "..", "assets", "vo");

export const VO: { id: string; text: string }[] = [
  { id: "02-title", text: "That call almost cost a founder four thousand eight hundred dollars. Countersign caught it in fifty seconds." },
  { id: "03-problem", text: "In a company, two people approve every payment, so a scammer has to fool both. A solo founder has nobody." },
  {
    id: "04-how",
    text: "Countersign answers every call, email and message for her. AI agents read the request, check the vendor book and flag the risk. Then it does what a careful accountant would. It never calls the number that called it. It calls the number it already trusts, and the real vendor says no.",
  },
  {
    id: "05-design",
    text: "The AI can read, reason and talk. It cannot move money. Only seventeen rules in plain code can, and the bank checks their signature. You can talk it into anything, except moving money.",
  },
  { id: "06-blocker", text: "Real bills still get paid on their own. Bigger ones wait for a code from the owner's own phone. Never a voice." },
  { id: "07-proof", text: "Thirty-nine attack scenarios. Every scam stopped. Zero wrong payments. Every step in a chained audit log." },
  { id: "08-close", text: "Built with Cartesia, Claude, Convex, Moss, C R S and Fetch dot A I. Call our number. Try to scam it." },
];

async function synthesize(key: string, text: string): Promise<Buffer> {
  let last = "";
  for (const model of MODELS) {
    const res = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: { "X-API-Key": key, "Cartesia-Version": "2025-04-16", "Content-Type": "application/json" },
      body: JSON.stringify({
        model_id: model,
        transcript: text,
        voice: { mode: "id", id: VOICE_ID },
        language: "en",
        output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44100 },
      }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    last = `${model}: ${res.status} ${(await res.text()).slice(0, 200)}`;
  }
  throw new Error(`Cartesia TTS failed (${last})`);
}

function seconds(file: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString();
  return Number(out.trim());
}

async function main() {
  const key = process.env.CARTESIA_API_KEY;
  if (!key) throw new Error("Set CARTESIA_API_KEY (see the top of this file)");
  mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  const durationsFile = join(OUT, "durations.json");
  const durations: Record<string, number> = existsSync(durationsFile) ? JSON.parse(readFileSync(durationsFile, "utf8")) : {};
  for (const line of VO.filter((l) => !only || l.id === only)) {
    const file = join(OUT, `${line.id}.wav`);
    writeFileSync(file, await synthesize(key, line.text));
    durations[line.id] = Number(seconds(file).toFixed(2));
    console.log(`${line.id}  ${durations[line.id]}s  (${line.text.split(/\s+/).length} words)`);
  }
  writeFileSync(durationsFile, `${JSON.stringify(durations, null, 2)}\n`);
  console.log(`total ${Object.values(durations).reduce((a, b) => a + b, 0).toFixed(1)}s`);
}

void main();
