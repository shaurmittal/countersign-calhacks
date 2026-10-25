// Records the real app for the video. Chrome's screencast (via Playwright's CDP session) at 1920x1080 and
// deviceScaleFactor 2, so every frame is 3840x2160 and stays sharp when the edit punches in. Frames arrive
// only when the page repaints; each keeps its real timestamp, and ffmpeg holds it until the next one, giving
// a constant 30 fps clip in assets/footage/<name>.mp4 that runs in real time.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";

export const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const SITE = process.env.SITE_URL ?? "https://countersign-calhacks.vercel.app";
const FOOTAGE = join(__dirname, "..", "assets", "footage");
const FFMPEG = "/opt/homebrew/bin/ffmpeg";

export type Shot = {
  name: string;
  path: string;
  /** localStorage entries set before the page loads (e.g. the /try visitor id). */
  storage?: Record<string, string>;
  /** Runs while recording. Recording starts once the page has settled. */
  act: (page: Page) => Promise<void>;
  /** Wait after load before recording starts, so no spinner or "Connecting…" is ever filmed. */
  settleMs?: number;
};

export async function record(shot: Shot): Promise<string> {
  const dir = join(FOOTAGE, shot.name, "frames");
  rmSync(join(FOOTAGE, shot.name), { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--hide-scrollbars", "--force-color-profile=srgb", "--disable-features=Translate"],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: "dark" });
  if (shot.storage) {
    await context.addInitScript((entries: Record<string, string>) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, shot.storage);
  }
  const page = await context.newPage();
  await page.goto(`${SITE}${shot.path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(shot.settleMs ?? 2500);

  const cdp = await context.newCDPSession(page);
  const frames: { file: string; t: number }[] = [];
  let n = 0;
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = join(dir, `${String(n++).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 });
    void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
  const started = Date.now() / 1000;
  await shot.act(page);
  const ended = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  await browser.close();
  if (frames.length === 0) throw new Error(`${shot.name}: no frames recorded`);

  // A constant 30 fps list: output frame k shows the latest screen frame at k/30 s. Screencast timestamps run
  // on Chrome's clock, so they are used only relative to each other; the clip runs as long as the recording.
  const span = ended - started;
  const t0 = frames[0].t;
  const lines: string[] = [];
  let j = 0;
  for (let k = 0; k < Math.ceil(span * 30); k++) {
    while (j + 1 < frames.length && frames[j + 1].t - t0 <= k / 30) j++;
    lines.push(`file '${frames[j].file}'`, "duration 0.0333333");
  }
  const list = join(FOOTAGE, shot.name, "frames.txt");
  writeFileSync(list, `${lines.join("\n")}\n`);
  const out = join(FOOTAGE, `${shot.name}.mp4`);
  execFileSync(FFMPEG, [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", "scale=3840:2160:flags=lanczos,format=yuv420p", "-r", "30",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-movflags", "+faststart", out,
  ]);
  rmSync(join(FOOTAGE, shot.name), { recursive: true, force: true }); // the mp4 is the keeper; frames are GBs
  console.log(`${shot.name}: ${frames.length} frames, ${(ended - started).toFixed(1)}s -> ${out}`);
  return out;
}
